"""Trend statistics used everywhere in TrendLens.

The web app runs a line-for-line TypeScript port of this module
(src/lib/stats.ts); tests in both languages check the two against each other
and against pymannkendall / scipy.

Method, in order:
  1. deseasonalize  - subtract each calendar month's mean, add back the overall mean
  2. annual_means   - average the deseasonalized months of each year
  3. mann_kendall   - Mann-Kendall test with an AR(1) effective-sample-size correction
                      for autocorrelation (Yue & Wang 2004) that can only make it stricter
  4. sen_slope      - Theil-Sen slope with the Sen (1968) 95% confidence interval,
                      using the same (corrected) variance as the test
  5. ols_trend      - least-squares slope and t-test with a lag-1 effective sample
                      size (Santer et al. 2000), as a second opinion
  6. bh_fdr         - Benjamini-Hochberg false-discovery control for maps
  7. years_needed   - Weatherhead et al. (1998) years to detect a trend of this size
"""
from __future__ import annotations

import math

import numpy as np
from scipy.stats import norm, rankdata, t as student_t

ALPHA = 0.05


# ---------------------------------------------------------------- preparation

def deseasonalize(values: np.ndarray, months: np.ndarray) -> np.ndarray:
    """values[k] observed in calendar month months[k] (1-12). NaN = missing."""
    values = np.asarray(values, dtype=float)
    out = np.full_like(values, np.nan)
    overall = np.nanmean(values)
    for m in range(1, 13):
        sel = months == m
        if np.isfinite(values[sel]).sum() == 0:
            continue
        out[sel] = values[sel] - np.nanmean(values[sel]) + overall
    return out


def annual_means(values: np.ndarray, years: np.ndarray, min_months: int = 9) -> tuple[np.ndarray, np.ndarray]:
    ys = np.unique(years)
    means = np.array(
        [np.nanmean(values[years == y]) if np.isfinite(values[years == y]).sum() >= min_months else np.nan for y in ys]
    )
    return ys, means


# ---------------------------------------------------------------- Mann-Kendall

def _s_and_var(x: np.ndarray) -> tuple[float, float]:
    n = len(x)
    s = 0.0
    for k in range(n - 1):
        s += np.sign(x[k + 1 :] - x[k]).sum()
    _, counts = np.unique(x, return_counts=True)
    ties = counts[counts > 1]
    var_s = (n * (n - 1) * (2 * n + 5) - np.sum(ties * (ties - 1) * (2 * ties + 5))) / 18.0
    return float(s), float(var_s)


def _acf(x: np.ndarray, nlags: int) -> np.ndarray:
    y = x - x.mean()
    n = len(x)
    acov = np.correlate(y, y, "full")[n - 1 :] / n
    if acov[0] <= 0:  # constant series: no autocorrelation to speak of
        out = np.zeros(nlags + 1)
        out[0] = 1.0
        return out
    return acov[: nlags + 1] / acov[0]


def _z(s: float, var_s: float) -> float:
    if s > 0:
        return (s - 1) / math.sqrt(var_s)
    if s < 0:
        return (s + 1) / math.sqrt(var_s)
    return 0.0


def lag1(resid: np.ndarray, bias_correct: bool = True) -> float:
    """Lag-1 autocorrelation. Short samples underestimate it, so by default we apply
    the Marriott & Pope (1954) bias correction r' = (n r + 1) / (n - 4)."""
    n = len(resid)
    r = float(_acf(resid, 1)[1])
    if bias_correct and n > 5:
        r = (n * r + 1) / (n - 4)
    return r


def mann_kendall(x: np.ndarray, t: np.ndarray | None = None, method: str = "ar1") -> dict:
    """Mann-Kendall trend test on a series with NaNs removed.

    method:
      "ar1"       (default) variance inflated for autocorrelation with the effective
                  sample size of Yue & Wang (2004), assuming AR(1) memory
                  (rho_k = r^k, Matalas & Langbein 1962) and a bias-corrected,
                  non-negative lag-1 estimate. The factor is always >= 1, so
                  autocorrelation can only widen the uncertainty.
      "none"      original test, no correction
      "hamed_rao" Hamed & Rao (1998), as in pymannkendall (used for cross-checks)
      "yue_wang1" Yue & Wang (2004) with lag 1 only, as in pymannkendall
    In simulations "ar1" keeps false alarms near 5% where the others reach 15-35%
    (see test_stats.py).
    """
    x = np.asarray(x, dtype=float)
    t = np.arange(len(x), dtype=float) if t is None else np.asarray(t, dtype=float)
    ok = np.isfinite(x)
    x, t = x[ok], t[ok]
    n = len(x)
    s, var_s = _s_and_var(x)
    tau = s / (0.5 * n * (n - 1))
    factor = 1.0
    r1 = 0.0
    if method != "none" and n >= 6:
        slope = sen_slope(x, t)["slope"]
        detrended = x - (t - t[0] + 1) * slope
        if method == "ar1":
            r1 = min(max(lag1(detrended), 0.0), 0.95)
            k = np.arange(1, n)
            factor = 1 + 2 * float(np.sum((1 - k / n) * r1**k))
        elif method == "yue_wang1":
            r1 = float(_acf(detrended, 1)[1])
            factor = 1 + 2 * (1 - 1 / n) * r1
        elif method == "hamed_rao":
            acf = _acf(rankdata(detrended), n - 1)
            bound = norm.ppf(1 - ALPHA / 2) / math.sqrt(n)
            total = 0.0
            for i in range(1, n):
                if abs(acf[i]) > bound:
                    total += (n - i) * (n - i - 1) * (n - i - 2) * acf[i]
            factor = 1 + 2 / (n * (n - 1) * (n - 2)) * total
        else:
            raise ValueError(method)
    var_c = var_s * factor
    z = _z(s, var_c) if var_c > 0 else 0.0
    p = 2 * (1 - norm.cdf(abs(z)))
    return {"n": n, "s": s, "var_s": var_s, "var_corrected": var_c, "factor": factor, "r1": r1, "tau": tau, "z": z, "p": p}


# ---------------------------------------------------------------- Theil-Sen

def sen_slope(x: np.ndarray, t: np.ndarray | None = None, var_s: float | None = None, alpha: float = ALPHA) -> dict:
    """Median of pairwise slopes, intercept = median(x) - slope * median(t).

    The confidence interval follows Sen (1968) as implemented in
    scipy.stats.theilslopes; pass var_s to use an autocorrelation-corrected variance.
    """
    x = np.asarray(x, dtype=float)
    t = np.arange(len(x), dtype=float) if t is None else np.asarray(t, dtype=float)
    ok = np.isfinite(x)
    x, t = x[ok], t[ok]
    n = len(x)
    i, j = np.triu_indices(n, 1)
    dt = t[j] - t[i]
    keep = dt != 0
    slopes = np.sort((x[j] - x[i])[keep] / dt[keep])
    slope = float(np.median(slopes))
    intercept = float(np.median(x) - slope * np.median(t))
    if var_s is None:
        _, var_s = _s_and_var(x)
        # scipy also removes ties in t; our t never repeats
    z = norm.ppf(1 - alpha / 2)
    nt = len(slopes)
    sigma = math.sqrt(var_s)
    ru = min(int(round((nt + z * sigma) / 2.0)), nt - 1)
    rl = max(int(round((nt - z * sigma) / 2.0)) - 1, 0)
    return {"slope": slope, "intercept": intercept, "low": float(slopes[rl]), "high": float(slopes[ru])}


# ---------------------------------------------------------------- t-test

def ols_trend(x: np.ndarray, t: np.ndarray, alpha: float = ALPHA) -> dict:
    x = np.asarray(x, dtype=float)
    t = np.asarray(t, dtype=float)
    ok = np.isfinite(x)
    x, t = x[ok], t[ok]
    n = len(x)
    tm, xm = t.mean(), x.mean()
    sxx = np.sum((t - tm) ** 2)
    b = np.sum((t - tm) * (x - xm)) / sxx
    a = xm - b * tm
    resid = x - (a + b * t)
    r1 = min(lag1(resid), 0.95) if n > 5 else 0.0
    n_eff = n * (1 - r1) / (1 + r1) if r1 > 0 else float(n)
    n_eff = max(n_eff, 3.0)
    se = math.sqrt(np.sum(resid**2) / (n_eff - 2) / sxx)
    tstat = b / se if se > 0 else 0.0
    df = n_eff - 2
    p = 2 * (1 - student_t.cdf(abs(tstat), df))
    tc = student_t.ppf(1 - alpha / 2, df)
    return {"slope": b, "intercept": a, "se": se, "t": tstat, "df": df, "p": p, "low": b - tc * se, "high": b + tc * se, "r1": r1, "n_eff": n_eff}


# ---------------------------------------------------------------- maps

def bh_fdr(p: np.ndarray, q: float = ALPHA) -> tuple[np.ndarray, np.ndarray]:
    """Benjamini-Hochberg. Returns (significant flags, adjusted p-values). NaN p stays NaN/False."""
    p = np.asarray(p, dtype=float)
    out_sig = np.zeros(p.shape, dtype=bool)
    out_adj = np.full(p.shape, np.nan)
    ok = np.isfinite(p)
    pv = p[ok]
    m = len(pv)
    if m == 0:
        return out_sig, out_adj
    order = np.argsort(pv)
    ranked = pv[order] * m / np.arange(1, m + 1)
    adj_sorted = np.minimum.accumulate(ranked[::-1])[::-1]
    adj = np.empty(m)
    adj[order] = np.minimum(adj_sorted, 1.0)
    out_adj[ok] = adj
    out_sig[ok] = adj <= q
    return out_sig, out_adj


# ---------------------------------------------------------------- detection time

def years_needed(resid: np.ndarray, slope_per_year: float, per_year: int) -> float | None:
    """Weatherhead et al. (1998): years of data needed to detect a trend of this size
    (95% confidence, 90% probability), given the noise level and its lag-1 autocorrelation."""
    r = np.asarray(resid, dtype=float)
    r = r[np.isfinite(r)]
    if len(r) < 10 or slope_per_year == 0:
        return None
    sigma = float(np.std(r, ddof=1))
    phi = float(_acf(r, 1)[1])
    phi = min(max(phi, -0.95), 0.95)
    n = (3.3 * sigma * math.sqrt(12 / per_year) / abs(slope_per_year) * math.sqrt((1 + phi) / (1 - phi))) ** (2 / 3)
    return float(n)


# ---------------------------------------------------------------- full analysis

def analyze(years: np.ndarray, values: np.ndarray, per_year: int = 12, months: np.ndarray | None = None) -> dict:
    """Run the whole pipeline on one series.

    For monthly data pass per_year=12 and months (1-12); values are deseasonalized
    and averaged per year. For yearly data pass per_year=1.
    Annual points are placed at mid-year (year + 0.5).
    """
    years = np.asarray(years)
    values = np.asarray(values, dtype=float)
    if per_year == 12:
        des = deseasonalize(values, months)
        ys, ann = annual_means(des, years)
    else:
        des = values.copy()
        ys, ann = years.astype(int), values.copy()
    t = ys + 0.5
    ok = np.isfinite(ann)
    mk = mann_kendall(ann[ok], t[ok])
    sen = sen_slope(ann[ok], t[ok], var_s=mk["var_corrected"])
    ols = ols_trend(ann[ok], t[ok])
    tmonth = (years + ((months - 0.5) / 12 if per_year == 12 else 0.5)).astype(float)
    line = sen["intercept"] + sen["slope"] * tmonth
    resid = des - line
    detrended_ann = ann[ok] - (sen["intercept"] + sen["slope"] * t[ok])
    noise = float(np.std(detrended_ann, ddof=1))
    span = float(t[ok][-1] - t[ok][0])
    return {
        "n_years": int(ok.sum()),
        "mk": mk,
        "sen": sen,
        "ols": ols,
        "years_needed": years_needed(resid, sen["slope"], per_year),
        "noise": noise,
        "snr": abs(sen["slope"]) * span / noise if noise > 0 else 0.0,
        "annual_years": ys.tolist(),
        "annual": ann.tolist(),
        "deseasonalized": des.tolist(),
    }
