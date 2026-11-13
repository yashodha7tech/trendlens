"""Write reference outputs of stats.py for the TypeScript tests (src/lib/stats.test.ts)."""
import json
from pathlib import Path

import numpy as np

import stats

rng = np.random.default_rng(2026)
cases = []
for k in range(40):
    n = int(rng.integers(8, 50))
    phi = float(rng.uniform(-0.2, 0.8))
    e = rng.normal(0, 1, n)
    x = np.empty(n)
    x[0] = e[0]
    for i in range(1, n):
        x[i] = phi * x[i - 1] + e[i]
    x = x + float(rng.normal(0, 0.05)) * np.arange(n)
    if k % 4 == 0:
        x = np.round(x, 1)  # ties
    if k % 7 == 0:
        x = np.full(n, 3.0)  # constant series
    t = np.arange(n) + 1990.5
    mk = stats.mann_kendall(x, t)
    mk0 = stats.mann_kendall(x, t, method="none")
    sen = stats.sen_slope(x, t, var_s=mk["var_corrected"])
    ols = stats.ols_trend(x, t) if np.std(x) > 0 else None
    cases.append({"x": x.tolist(), "t": t.tolist(), "mk": mk, "mk_none": mk0, "sen": sen, "ols": ols})

monthly = []
for k in range(6):
    years = np.repeat(np.arange(2001, 2026), 12)
    months = np.tile(np.arange(1, 13), 25)
    tt = years + (months - 0.5) / 12
    y = 0.4 * np.sin(2 * np.pi * months / 12) + 0.01 * k * (tt - 2001) + rng.normal(0, 0.2, len(tt))
    y = np.round(y, 4)
    if k == 3:
        y[rng.choice(len(y), 25, replace=False)] = np.nan
    res = stats.analyze(years, y, 12, months)
    monthly.append({"years": years.tolist(), "months": months.tolist(), "values": [None if not np.isfinite(v) else v for v in y],
                    "slope": res["sen"]["slope"], "low": res["sen"]["low"], "high": res["sen"]["high"], "p": res["mk"]["p"],
                    "t_p": res["ols"]["p"], "years_needed": res["years_needed"], "snr": res["snr"]})

p = rng.uniform(0, 1, 60).tolist() + rng.uniform(0, 0.002, 12).tolist()
sig, adj = stats.bh_fdr(np.array(p))
out = {"cases": cases, "monthly": monthly, "bh": {"p": p, "adj": adj.tolist(), "sig": sig.tolist()}}
path = Path(__file__).resolve().parent.parent / "src" / "lib" / "__fixtures__" / "stats_cases.json"
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(out, default=float))
print("wrote", path)
