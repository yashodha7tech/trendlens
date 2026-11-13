"""Build every data file the web app reads.

  python build.py            -> public/data/catalog.json, public/data/regions/<id>.json,
                                data/<region>_<variable>.csv (cleaned regional series)

Inputs are the cached downloads from power.py, modis.py and cdo.py.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
from pathlib import Path

import numpy as np

import cdo
import modis
import stats
from config import END_YEAR, REGIONS, TOPICS, VARIABLES
from power import regional

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
CSV_DIR = ROOT / "data"
MIN_YEARS = 15


def rnd(x, d=4):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return None
    return round(float(x), d)


def rlist(a, d):
    return [None if not np.isfinite(v) else round(float(v), d) for v in a]


def month_axis(start: int, end: int = END_YEAR):
    years = np.repeat(np.arange(start, end + 1), 12)
    months = np.tile(np.arange(1, 13), end - start + 1)
    return years, months


# ---------------------------------------------------------------- verdicts

def classify(res: dict) -> str:
    """significant / not_yet / none. 'not_yet' = not significant, but at the current
    rate and noise level it would become detectable within about the same length of
    record again (Weatherhead et al. 1998)."""
    if res["mk"]["p"] < stats.ALPHA:
        return "significant"
    need = res["years_needed"]
    if need is not None and need <= 2 * res["n_years"]:
        return "not_yet"
    return "none"


def summary(res: dict, mean: float, coverage: float, first: int, last: int, per_year: int, decimals: int) -> dict:
    sen, mk, ols = res["sen"], res["mk"], res["ols"]
    return {
        "first": first,
        "last": last,
        "n_years": res["n_years"],
        "coverage": rnd(coverage, 3),
        "mean": rnd(mean, decimals + 1),
        "slope": rnd(sen["slope"] * 10, decimals + 2),
        "low": rnd(sen["low"] * 10, decimals + 2),
        "high": rnd(sen["high"] * 10, decimals + 2),
        "intercept": rnd(sen["intercept"], 6),
        "p": rnd(mk["p"], 6),
        "z": rnd(mk["z"], 4),
        "tau": rnd(mk["tau"], 4),
        "factor": rnd(mk["factor"], 4),
        "r1": rnd(mk["r1"], 4),
        "t_slope": rnd(ols["slope"] * 10, decimals + 2),
        "t_low": rnd(ols["low"] * 10, decimals + 2),
        "t_high": rnd(ols["high"] * 10, decimals + 2),
        "t_p": rnd(ols["p"], 6),
        "snr": rnd(res["snr"], 3),
        "noise": rnd(res["noise"], decimals + 2),
        "years_needed": rnd(res["years_needed"], 1),
        "verdict": classify(res),
        "per_year": per_year,
    }


# ---------------------------------------------------------------- POWER variables

def area_mean(grid: dict, land: np.ndarray) -> np.ndarray:
    v = grid["values"][land]
    w = np.cos(np.deg2rad(grid["lat"][land]))[:, None] * np.isfinite(v)
    tot = w.sum(axis=0)
    return np.where(tot > 0, np.nansum(np.nan_to_num(v) * w, axis=0) / np.where(tot > 0, tot, 1), np.nan)


def land_mask(grid: dict, land_grid: dict, land: np.ndarray) -> tuple[np.ndarray, float, float]:
    """Land mask on any POWER grid, taken from the MERRA-2 land cells (0.5 x 0.625 deg).
    A coarser cell counts as land when at least half of the MERRA-2 cells inside it are land."""
    lats, lons = np.unique(grid["lat"]), np.unique(grid["lon"])
    dlat = float(np.min(np.diff(lats))) if len(lats) > 1 else 0.5
    dlon = float(np.min(np.diff(lons))) if len(lons) > 1 else 0.625
    if abs(dlat - 0.5) < 1e-6 and abs(dlon - 0.625) < 1e-6 and len(grid["lat"]) == len(land):
        return land, dlat, dlon
    mask = np.zeros(len(grid["lat"]), dtype=bool)
    for k, (la, lo) in enumerate(zip(grid["lat"], grid["lon"])):
        inside = (np.abs(land_grid["lat"] - la) <= dlat / 2) & (np.abs(land_grid["lon"] - lo) <= dlon / 2)
        mask[k] = inside.any() and land[inside].mean() >= 0.5
    return mask, dlat, dlon


def power_variable(rid: str, vid: str, land_grid: dict, land0: np.ndarray):
    meta = VARIABLES[vid]
    grid = regional(meta["power"], REGIONS[rid]["bbox"])
    land, dlat, dlon = land_mask(grid, land_grid, land0)
    start = meta["start"]
    all_years = np.array([int(m[:4]) for m in grid["months"]])
    keep = all_years >= start
    grid = {**grid, "values": grid["values"][:, keep]}
    years, months = month_axis(start)
    series = area_mean(grid, land)

    # per-cell trend map with false-discovery control
    cells = []
    ps = []
    for k in np.where(land)[0]:
        v = grid["values"][k]
        if np.isfinite(v).mean() < 0.9:
            continue
        r = stats.analyze(years, v, 12, months)
        cells.append([float(grid["lat"][k]), float(grid["lon"][k]), r["sen"]["slope"] * 10])
        ps.append(r["mk"]["p"])
    sig, q = stats.bh_fdr(np.array(ps))
    cmap = {
        "kind": "grid",
        "dlat": dlat,
        "dlon": dlon,
        "cells": [[c[0], c[1], rnd(c[2], meta["decimals"] + 2), rnd(p, 5), bool(s)] for c, p, s in zip(cells, ps, sig)],
        "n_sig": int(sig.sum()),
        "n_sig_raw": int((np.array(ps) < 0.05).sum()),
    }
    return years, months, series, cmap


# ---------------------------------------------------------------- MODIS variables

def ndvi_site_monthly(site: dict, start: int) -> np.ndarray:
    years, months = month_axis(start)
    idx = {(y, m): i for i, (y, m) in enumerate(zip(years, months))}
    out = np.full(len(years), np.nan)
    for date, val in modis.load_site("ndvi", site):
        mid = dt.date.fromisoformat(date) + dt.timedelta(days=8)
        i = idx.get((mid.year, mid.month))
        if i is not None:
            out[i] = val if np.isnan(out[i]) else max(out[i], val)  # maximum-value composite
    return out


def tree_site_annual(site: dict, start: int) -> np.ndarray:
    years = np.arange(start, END_YEAR + 1)
    out = np.full(len(years), np.nan)
    for date, val in modis.load_site("tree", site):
        y = int(date[:4])
        if start <= y <= END_YEAR:
            out[y - start] = val
    return out


def modis_variable(rid: str, vid: str):
    meta = VARIABLES[vid]
    start = meta["start"]
    sites = modis.sites_for(rid)
    if vid == "ndvi":
        years, months = month_axis(start)
        per_site = np.array([ndvi_site_monthly(s, start) for s in sites])
        per_year = 12
    else:
        years = np.arange(start, END_YEAR + 1)
        months = None
        per_site = np.array([tree_site_annual(s, start) for s in sites])
        per_year = 1
    good = np.isfinite(per_site).mean(axis=1) > 0.8
    sites = [s for s, g in zip(sites, good) if g]
    per_site = per_site[good]
    if len(sites) == 0:
        return None
    valid = np.isfinite(per_site).sum(axis=0)
    series = np.where(valid >= 0.6 * len(sites), np.nanmean(np.where(np.isfinite(per_site), per_site, np.nan), axis=0), np.nan)

    cells, ps = [], []
    for s, v in zip(sites, per_site):
        r = stats.analyze(years, v, per_year, months)
        cells.append([s["lat"], s["lon"], r["sen"]["slope"] * 10, float(np.nanmean(v))])
        ps.append(r["mk"]["p"])
    sig, _ = stats.bh_fdr(np.array(ps))
    cmap = {
        "kind": "sites",
        "km": modis.PRODUCTS[vid][2] * 2,
        "cells": [[c[0], c[1], rnd(c[2], meta["decimals"] + 2), rnd(p, 5), bool(sg), rnd(c[3], meta["decimals"])] for c, p, sg in zip(cells, ps, sig)],
        "n_sig": int(sig.sum()),
        "n_sig_raw": int((np.array(ps) < 0.05).sum()),
    }
    return years, months, series, cmap, per_year


# ---------------------------------------------------------------- station check

def station_check(rid: str, land_grid: dict) -> dict:
    bbox = REGIONS[rid]["bbox"]
    start, end = 1981, END_YEAR
    found = cdo.search(rid, bbox, start, end)
    cands = [s for s in found if int(s["ranges"]["TAVG"][0]) <= 1990 and int(s["ranges"]["TAVG"][1]) >= 2020]
    cands = cands[:80]
    recs = cdo.monthly([s["id"] for s in cands], start, end)
    years, months = month_axis(start)
    out = {}
    for vid, field in cdo.FIELDS.items():
        grid = regional(VARIABLES[vid]["power"], bbox)
        used, st_anoms, m2_anoms = [], [], []
        for s in cands:
            v = cdo.station_arrays(recs.get(s["id"], {}), field, start, end)
            cov = np.isfinite(v).mean()
            if cov < 0.7:
                continue
            k = int(np.argmin((grid["lat"] - s["lat"]) ** 2 + (grid["lon"] - s["lon"]) ** 2))
            m2 = grid["values"][k].copy()
            m2[~np.isfinite(v)] = np.nan  # compare like with like: same months only
            st_anoms.append(stats.deseasonalize(v, months) - np.nanmean(v))
            m2_anoms.append(stats.deseasonalize(m2, months) - np.nanmean(m2))
            used.append({"id": s["id"], "name": s["name"].title(), "lat": s["lat"], "lon": s["lon"], "coverage": rnd(cov, 3)})
        if len(used) == 0:
            out[vid] = {"stations": [], "note": "No station in NOAA Climate Data Online has at least 70% of months filled between 1981 and 2025 here."}
            continue
        with np.errstate(all="ignore"):
            st_comp = np.nanmean(np.array(st_anoms), axis=0)
            m2_comp = np.nanmean(np.array(m2_anoms), axis=0)
        ys, st_ann = stats.annual_means(st_comp, years)
        _, m2_ann = stats.annual_means(m2_comp, years)
        ok = np.isfinite(st_ann) & np.isfinite(m2_ann)
        t = ys + 0.5
        res = {}
        for name, a in (("station", st_ann), ("merra2", m2_ann)):
            mk = stats.mann_kendall(a[ok], t[ok])
            sen = stats.sen_slope(a[ok], t[ok], var_s=mk["var_corrected"])
            res[name] = {"slope": rnd(sen["slope"] * 10, 4), "low": rnd(sen["low"] * 10, 4), "high": rnd(sen["high"] * 10, 4), "p": rnd(mk["p"], 6)}
        r = float(np.corrcoef(st_ann[ok], m2_ann[ok])[0, 1])
        same_dir = np.sign(res["station"]["slope"]) == np.sign(res["merra2"]["slope"])
        both_sig = res["station"]["p"] < 0.05 and res["merra2"]["p"] < 0.05
        out[vid] = {
            "stations": used,
            "years": ys[ok].tolist(),
            "station": rlist(st_ann[ok], 3),
            "merra2": rlist(m2_ann[ok], 3),
            "trend": res,
            "r": rnd(r, 3),
            "same_direction": bool(same_dir),
            "both_significant": bool(both_sig),
        }
    return out


# ---------------------------------------------------------------- main

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "regions").mkdir(exist_ok=True)
    CSV_DIR.mkdir(exist_ok=True)
    catalog = {
        "generated": dt.date.today().isoformat(),
        "end_year": END_YEAR,
        "topics": TOPICS,
        "variables": {k: {kk: vv for kk, vv in v.items() if kk not in ("power",)} for k, v in VARIABLES.items()},
        "regions": {},
        "results": {},
    }
    for rid, reg in REGIONS.items():
        print("region", rid, flush=True)
        land_grid = regional("GWETROOT", reg["bbox"])
        land = np.isfinite(land_grid["values"]).mean(axis=1) > 0.9
        lat0, lat1, lon0, lon1 = reg["bbox"]
        catalog["regions"][rid] = {**reg, "bbox": list(reg["bbox"]), "center": [(lat0 + lat1) / 2, (lon0 + lon1) / 2], "land_cells": int(land.sum())}
        region_out = {"id": rid, "series": {}, "maps": {}}
        results = {}
        for vid, meta in VARIABLES.items():
            if "power" in meta:
                years, months, series, cmap = power_variable(rid, vid, land_grid, land)
                per_year = 12
            else:
                got = modis_variable(rid, vid)
                if got is None:
                    print("  skip", vid, "(no MODIS data yet)")
                    continue
                years, months, series, cmap, per_year = got
            # analyse exactly the numbers we publish, so anyone can reproduce every result
            series = np.array([np.nan if v is None else v for v in rlist(series, meta["decimals"] + 2)], dtype=float)
            coverage = float(np.isfinite(series).mean())
            n_valid_years = len(set(np.asarray(years)[np.isfinite(series)].tolist()))
            if n_valid_years < MIN_YEARS:
                print("  skip", vid, "too short")
                continue
            res = stats.analyze(years, series, per_year, months)
            s = summary(res, float(np.nanmean(series)), coverage, int(years[0]), int(years[-1]), per_year, meta["decimals"])
            results[vid] = s
            region_out["series"][vid] = {"start": int(years[0]), "per_year": per_year, "values": rlist(series, meta["decimals"] + 2)}
            region_out["maps"][vid] = cmap
            with open(CSV_DIR / f"{rid}_{vid}.csv", "w", newline="") as f:
                w = csv.writer(f)
                w.writerow(["year", "month", f"{vid}_{meta['unit']}", "deseasonalized"])
                for i, val in enumerate(series):
                    mo = int(months[i]) if months is not None else ""
                    w.writerow([int(years[i]), mo, rnd(val, meta["decimals"] + 2), rnd(res["deseasonalized"][i], meta["decimals"] + 2)])
            print(f"  {vid:6s} {s['slope']:+.4f}/dec p={s['p']:.4f} {s['verdict']}", flush=True)
        try:
            region_out["stations"] = station_check(rid, land_grid)
        except RuntimeError as e:
            print("  station check failed:", e)
            region_out["stations"] = {}
        catalog["results"][rid] = results
        (OUT / "regions" / f"{rid}.json").write_text(json.dumps(region_out, separators=(",", ":")))
    (OUT / "catalog.json").write_text(json.dumps(catalog, separators=(",", ":"), ensure_ascii=False))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
