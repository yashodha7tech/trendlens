"""Weather-station records from NOAA Climate Data Online (CDO).

Uses the Global Summary of the Month (GSOM) dataset through NCEI's public
Access services (the data behind the CDO web tool). Station data give an
independent check on the MERRA-2 temperature and rainfall trends.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import requests

SEARCH = "https://www.ncei.noaa.gov/access/services/search/v1/data"
DATA = "https://www.ncei.noaa.gov/access/services/data/v1"
CACHE = Path(__file__).parent / "cache" / "cdo"
FIELDS = {"t2m": "TAVG", "precip": "PRCP"}


def _get(url: str, params: dict, tries: int = 5):
    for attempt in range(tries):
        try:
            r = requests.get(url, params=params, timeout=300)
            if r.status_code == 200:
                return r.json()
        except (requests.RequestException, json.JSONDecodeError):
            pass
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"CDO request failed: {url} {params}")


def search(region_id: str, bbox, start: int, end: int) -> list[dict]:
    path = CACHE / f"search_{region_id}.json"
    if path.exists():
        return json.loads(path.read_text())
    lat0, lat1, lon0, lon1 = bbox
    out, offset = [], 0
    while True:
        d = _get(
            SEARCH,
            {
                "dataset": "global-summary-of-the-month",
                "bbox": f"{lat1},{lon0},{lat0},{lon1}",
                "startDate": f"{start}-01-01",
                "endDate": f"{end}-12-31",
                "dataTypes": "TAVG",
                "limit": 1000,
                "offset": offset,
            },
        )
        for r in d["results"]:
            st = r["stations"][0]
            ranges = {x["id"]: (x["dateRange"]["start"][:4], x["dateRange"]["end"][:4]) for x in st["dataTypes"]}
            lon, lat = r["boundingPoints"][0]["coordinates"]
            if "TAVG" in ranges:
                out.append({"id": st["id"], "name": st["name"], "lat": lat, "lon": lon, "ranges": ranges})
        offset += 1000
        if offset >= d.get("count", 0):
            break
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out))
    return out


def monthly(station_ids: list[str], start: int, end: int) -> dict[str, dict[str, dict[str, float]]]:
    """{station: {"YYYY-MM": {"TAVG": x, "PRCP": y}}}"""
    out: dict = {}
    todo = []
    for sid in station_ids:
        p = CACHE / "stations" / f"{sid}.json"
        if p.exists():
            out[sid] = json.loads(p.read_text())
        else:
            todo.append(sid)
    for i in range(0, len(todo), 20):
        batch = todo[i : i + 20]
        rows = _get(
            DATA,
            {
                "dataset": "global-summary-of-the-month",
                "stations": ",".join(batch),
                "startDate": f"{start}-01-01",
                "endDate": f"{end}-12-31",
                "dataTypes": "TAVG,PRCP",
                "format": "json",
                "units": "metric",
            },
        )
        got = {sid: {} for sid in batch}
        for r in rows:
            rec = {}
            for k in ("TAVG", "PRCP"):
                if r.get(k) not in (None, ""):
                    rec[k] = float(r[k])
            got.setdefault(r["STATION"], {})[r["DATE"]] = rec
        for sid, recs in got.items():
            p = CACHE / "stations" / f"{sid}.json"
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(recs))
            out[sid] = recs
    return out


def station_arrays(recs: dict, field: str, start: int, end: int) -> np.ndarray:
    """Monthly values start..end as an array (NaN where missing). PRCP is converted to mm/day."""
    vals = []
    for y in range(start, end + 1):
        for m in range(1, 13):
            v = recs.get(f"{y}-{m:02d}", {}).get(field)
            if v is not None and field == "PRCP":
                days = (np.datetime64(f"{y + (m == 12)}-{(m % 12) + 1:02d}-01") - np.datetime64(f"{y}-{m:02d}-01")).astype(int)
                v = v / days
            vals.append(np.nan if v is None else v)
    return np.array(vals, dtype=float)
