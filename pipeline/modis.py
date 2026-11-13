"""Download MODIS subsets (NDVI, tree cover) from the ORNL DAAC MODIS web service.

The service answers each request in roughly 30 seconds regardless of size and
returns at most 10 composites per call, so we sample a 3 x 3 grid of land
sites inside each region, fetch them in parallel and cache every chunk.

Run directly to download everything:  python modis.py
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import sys
import time
from pathlib import Path

import numpy as np
import requests

from config import REGIONS
from power import regional

API = "https://modis.ornl.gov/rst/api/v1"
CACHE = Path(__file__).parent / "cache" / "modis"

PRODUCTS = {
    # product, band, km buffer, scale, valid range
    "ndvi": ("MOD13Q1", "250m_16_days_NDVI", 1, 0.0001, (-2000, 10000)),
    "tree": ("MOD44B", "Percent_Tree_Cover", 1, 1.0, (0, 100)),
}


def sites_for(region_id: str) -> list[dict]:
    """Pick up to nine land sites: the land cell nearest the centre of each third of the box."""
    lat0, lat1, lon0, lon1 = REGIONS[region_id]["bbox"]
    grid = regional("GWETROOT", REGIONS[region_id]["bbox"])
    land = np.isfinite(grid["values"]).mean(axis=1) > 0.9
    lats, lons = grid["lat"][land], grid["lon"][land]
    sites = []
    for i in range(3):
        for j in range(3):
            clat = lat0 + (lat1 - lat0) * (2 * i + 1) / 6
            clon = lon0 + (lon1 - lon0) * (2 * j + 1) / 6
            inside = (
                (lats >= lat0 + (lat1 - lat0) * i / 3)
                & (lats <= lat0 + (lat1 - lat0) * (i + 1) / 3)
                & (lons >= lon0 + (lon1 - lon0) * j / 3)
                & (lons <= lon0 + (lon1 - lon0) * (j + 1) / 3)
            )
            if not inside.any():
                continue
            d = (lats[inside] - clat) ** 2 + (lons[inside] - clon) ** 2
            k = int(np.argmin(d))
            sites.append({"id": f"{region_id}-{i}{j}", "lat": float(lats[inside][k]), "lon": float(lons[inside][k])})
    return sites


def _get(url: str, params: dict, tries: int = 6) -> dict:
    for attempt in range(tries):
        try:
            r = requests.get(url, params=params, timeout=400, headers={"Accept": "application/json"})
            if r.status_code == 200:
                return r.json()
        except (requests.RequestException, json.JSONDecodeError):
            pass
        time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"ORNL request failed: {url} {params}")


def product_dates(product: str, lat: float, lon: float) -> list[dict]:
    path = CACHE / f"dates_{product}.json"
    if path.exists():
        return json.loads(path.read_text())
    dates = _get(f"{API}/{product}/dates", {"latitude": lat, "longitude": lon})["dates"]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dates))
    return dates


def chunk_path(key: str, site: dict, start: str) -> Path:
    return CACHE / key / f"{site['id']}_{start}.json"


def fetch_chunk(key: str, site: dict, dates: list[dict]) -> Path:
    product, band, km, _, _ = PRODUCTS[key]
    path = chunk_path(key, site, dates[0]["modis_date"])
    if path.exists():
        return path
    data = _get(
        f"{API}/{product}/subset",
        {
            "latitude": site["lat"],
            "longitude": site["lon"],
            "band": band,
            "startDate": dates[0]["modis_date"],
            "endDate": dates[-1]["modis_date"],
            "kmAboveBelow": km,
            "kmLeftRight": km,
        },
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    slim = [{"date": s["calendar_date"], "data": s["data"]} for s in data["subset"]]
    path.write_text(json.dumps(slim))
    return path


def load_site(key: str, site: dict) -> list[tuple[str, float]]:
    """Return [(calendar_date, median value)] for one site, skipping fill/invalid pixels."""
    _, _, _, scale, (lo, hi) = PRODUCTS[key]
    out = []
    for f in sorted((CACHE / key).glob(f"{site['id']}_*.json")):
        for s in json.loads(f.read_text()):
            px = np.array(s["data"], dtype=float)
            px = px[(px >= lo) & (px <= hi)]
            if px.size >= max(3, 0.3 * len(s["data"])):
                out.append((s["date"], float(np.median(px)) * scale))
    out.sort()
    return out


def all_jobs() -> list[tuple[str, dict, list[dict]]]:
    jobs = []
    for key, (product, *_rest) in PRODUCTS.items():
        first = sites_for(next(iter(REGIONS)))[0]
        dates = product_dates(product, first["lat"], first["lon"])
        chunks = [dates[i : i + 10] for i in range(0, len(dates), 10)]
        for rid in REGIONS:
            for site in sites_for(rid):
                for ch in chunks:
                    jobs.append((key, site, ch))
    # Tree cover first (few chunks), then finish whole NDVI sites one priority level at a
    # time (centre site of every region first), so complete series arrive early.
    order = ["11", "00", "02", "20", "22", "01", "10", "12", "21"]
    jobs.sort(key=lambda j: (j[0] != "tree", order.index(j[1]["id"].split("-")[1]), j[2][0]["modis_date"]))
    return jobs


def main(workers: int = 12) -> None:
    jobs = all_jobs()
    todo = [j for j in jobs if not chunk_path(j[0], j[1], j[2][0]["modis_date"]).exists()]
    print(f"{len(jobs)} chunks total, {len(todo)} to download", flush=True)
    done = 0
    t0 = time.time()
    with cf.ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(fetch_chunk, *j): j for j in todo}
        for fut in cf.as_completed(futs):
            done += 1
            try:
                fut.result()
            except Exception as e:  # keep going; a re-run picks up failures
                print("FAILED", futs[fut][0], futs[fut][1]["id"], e, flush=True)
            if done % 5 == 0 or done == len(todo):
                rate = done / (time.time() - t0)
                print(f"{done}/{len(todo)}  {rate*60:.1f}/min  eta {(len(todo)-done)/max(rate,1e-9)/60:.0f} min", flush=True)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 12)
