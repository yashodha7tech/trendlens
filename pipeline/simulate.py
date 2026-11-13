"""Monte Carlo validation shown on the Method page (public/data/validation.json).

  1. False-alarm rate with no trend, for three versions of the Mann-Kendall test,
     under increasing year-to-year memory (AR(1) noise).
  2. Power to detect a real trend in the same setting.
  3. Slope recovery and 95% interval coverage on synthetic monthly data with seasons.
  4. Agreement with pymannkendall and scipy on random series.
"""
import json
from pathlib import Path

import numpy as np
import pymannkendall as pmk
from scipy import stats as sps

import stats

RUNS = 2000
OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "validation.json"


def ar1(n, phi, rng):
    e = rng.normal(0, 1, n)
    out = np.empty(n)
    out[0] = e[0] / np.sqrt(1 - phi**2)
    for i in range(1, n):
        out[i] = phi * out[i - 1] + e[i]
    return out


def rates(n, phi, slope, rng):
    hits = {"none": 0, "hamed_rao": 0, "ar1": 0}
    for _ in range(RUNS):
        x = slope * np.arange(n) + ar1(n, phi, rng)
        for m in hits:
            hits[m] += stats.mann_kendall(x, method=m)["p"] < 0.05
    return {m: round(h / RUNS, 4) for m, h in hits.items()}


def main():
    rng = np.random.default_rng(1998)
    false_alarm, power = [], []
    for n in (25, 45):
        for phi in (0.0, 0.2, 0.4, 0.6):
            false_alarm.append({"n": n, "phi": phi, **rates(n, phi, 0.0, rng)})
            power.append({"n": n, "phi": phi, "slope": 0.04, **rates(n, phi, 0.04, rng)})
            print("done", n, phi, flush=True)

    # slope recovery on seasonal monthly data
    years = np.repeat(np.arange(1981, 2026), 12)
    months = np.tile(np.arange(1, 13), 45)
    tt = years + (months - 0.5) / 12
    true = 0.03
    slopes, covered = [], 0
    for _ in range(500):
        y = 15 + 8 * np.sin(2 * np.pi * (months - 4) / 12) + true * (tt - 1981) + ar1(len(tt), 0.5, rng) * 0.6
        r = stats.analyze(years, y, 12, months)
        slopes.append(r["sen"]["slope"])
        covered += r["sen"]["low"] <= true <= r["sen"]["high"]

    # library agreement
    d_p, d_hr, d_slope, d_ci = 0.0, 0.0, 0.0, 0.0
    for _ in range(300):
        n = int(rng.integers(15, 50))
        x = 0.02 * np.arange(n) + ar1(n, rng.uniform(-0.2, 0.7), rng)
        ref = pmk.original_test(x)
        d_p = max(d_p, abs(stats.mann_kendall(x, method="none")["p"] - ref.p))
        d_hr = max(d_hr, abs(stats.mann_kendall(x, method="hamed_rao")["p"] - pmk.hamed_rao_modification_test(x).p))
        d_slope = max(d_slope, abs(stats.sen_slope(x)["slope"] - ref.slope))
        ts = sps.theilslopes(x, np.arange(n), alpha=0.95)
        s = stats.sen_slope(x)
        d_ci = max(d_ci, abs(s["low"] - ts.low_slope), abs(s["high"] - ts.high_slope))

    out = {
        "runs": RUNS,
        "false_alarm": false_alarm,
        "power": power,
        "recovery": {
            "true_per_decade": true * 10,
            "mean_per_decade": round(float(np.mean(slopes)) * 10, 4),
            "coverage": round(covered / 500, 3),
            "runs": 500,
        },
        "agreement": {
            "series": 300,
            "max_diff_p_original": d_p,
            "max_diff_p_hamed_rao": d_hr,
            "max_diff_sen_slope": d_slope,
            "max_diff_sen_interval": d_ci,
        },
    }
    OUT.write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
