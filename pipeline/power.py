"""Download monthly NASA POWER grids (MERRA-2 / CERES based) with an on-disk cache.

POWER's regional endpoint accepts one parameter per request and a box of at
most 10 x 10 degrees, and returns every native grid cell (0.5 x 0.625 deg for
MERRA-2 variables) inside it. Each response is cached as gzip JSON so the
pipeline never downloads the same thing twice.
"""
from __future__ import annotations

import gzip
import json
import time
from pathlib import Path

import numpy as np
import requests

API = "https://power.larc.nasa.gov/api/temporal/monthly"
CACHE = Path(__file__).parent / "cache" / "power"
FILL = -999.0


def _get(url: str, params: dict, tries: int = 5) -> dict:
    for attempt in range(tries):
        try:
            r = requests.get(url, params=params, timeout=300)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 422:
                raise ValueError(r.text)
        except (requests.RequestException, json.JSONDecodeError):
            pass
        time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"POWER request failed after {tries} tries: {url} {params}")


def _months(start: int, end: int) -> list[str]:
    return [f"{y}{m:02d}" for y in range(start, end + 1) for m in range(1, 13)]


def regional(param: str, bbox: tuple[float, float, float, float], start: int = 1981, end: int = 2025) -> dict:
    """Return {"lat": [...], "lon": [...], "months": [...], "values": ndarray[cell, month]}.

    bbox is (lat_min, lat_max, lon_min, lon_max). Fill values become NaN.
    """
    lat0, lat1, lon0, lon1 = bbox
    key = f"reg_{param}_{lat0}_{lat1}_{lon0}_{lon1}_{start}_{end}.json.gz"
    path = CACHE / key
    if path.exists():
        raw = json.loads(gzip.decompress(path.read_bytes()))
    else:
        raw = _get(
            f"{API}/regional",
            {
                "parameters": param,
                "community": "AG",
                "latitude-min": lat0,
                "latitude-max": lat1,
                "longitude-min": lon0,
                "longitude-max": lon1,
                "start": start,
                "end": end,
                "format": "JSON",
            },
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(gzip.compress(json.dumps(raw).encode()))
    months = _months(start, end)
    lats, lons, rows = [], [], []
    for f in raw["features"]:
        lon, lat = f["geometry"]["coordinates"][:2]
        series = f["properties"]["parameter"][param]
        rows.append([series.get(m, FILL) for m in months])
        lats.append(lat)
        lons.append(lon)
    values = np.array(rows, dtype=float)
    values[values <= FILL + 1e-6] = np.nan
    return {"lat": np.array(lats), "lon": np.array(lons), "months": months, "values": values}


def point(params: list[str], lat: float, lon: float, start: int = 1981, end: int = 2025) -> dict:
    """Return {param: ndarray[month]} for a single grid cell (up to 15 parameters per call)."""
    key = f"pt_{'-'.join(params)}_{lat}_{lon}_{start}_{end}.json.gz"
    path = CACHE / key
    if path.exists():
        raw = json.loads(gzip.decompress(path.read_bytes()))
    else:
        raw = _get(
            f"{API}/point",
            {
                "parameters": ",".join(params),
                "community": "AG",
                "latitude": lat,
                "longitude": lon,
                "start": start,
                "end": end,
                "format": "JSON",
            },
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(gzip.compress(json.dumps(raw).encode()))
    months = _months(start, end)
    out = {}
    for p in params:
        s = raw["properties"]["parameter"][p]
        v = np.array([s.get(m, FILL) for m in months], dtype=float)
        v[v <= FILL + 1e-6] = np.nan
        out[p] = v
    return out
