"""Validation of the trend statistics.

1. Agreement with trusted libraries (pymannkendall, scipy).
2. Recovery of a known slope from synthetic data.
3. False-alarm rate close to 5% when there is no trend, even with autocorrelated noise.

Run:  .venv/bin/python -m pytest -q
"""
import numpy as np
import pymannkendall as pmk
import pytest
from scipy import stats as sps

import stats as tl


def ar1(n, phi, rng, sigma=1.0):
    e = rng.normal(0, sigma, n)
    out = np.empty(n)
    out[0] = e[0] / np.sqrt(1 - phi**2)
    for i in range(1, n):
        out[i] = phi * out[i - 1] + e[i]
    return out


@pytest.mark.parametrize("seed", range(25))
def test_matches_pymannkendall(seed):
    rng = np.random.default_rng(seed)
    n = int(rng.integers(15, 60))
    x = 0.02 * np.arange(n) + ar1(n, rng.uniform(-0.3, 0.8), rng)
    if seed % 5 == 0:  # include ties
        x = np.round(x, 1)
    ref = pmk.original_test(x)
    ours = tl.mann_kendall(x, method="none")
    assert ours["s"] == ref.s
    assert ours["var_s"] == pytest.approx(ref.var_s, rel=1e-12)
    assert ours["z"] == pytest.approx(ref.z, rel=1e-10)
    assert ours["p"] == pytest.approx(ref.p, rel=1e-9, abs=1e-12)
    assert ours["tau"] == pytest.approx(ref.Tau, rel=1e-12)

    sen = tl.sen_slope(x)
    assert sen["slope"] == pytest.approx(ref.slope, rel=1e-12)
    assert sen["intercept"] == pytest.approx(ref.intercept, rel=1e-9, abs=1e-12)

    hr = pmk.hamed_rao_modification_test(x)
    ours_hr = tl.mann_kendall(x, method="hamed_rao")
    assert ours_hr["z"] == pytest.approx(hr.z, rel=1e-9)
    assert ours_hr["p"] == pytest.approx(hr.p, rel=1e-8, abs=1e-12)

    yw = pmk.yue_wang_modification_test(x, lag=1)
    ours_yw = tl.mann_kendall(x, method="yue_wang1")
    assert ours_yw["var_corrected"] == pytest.approx(yw.var_s, rel=1e-9)
    assert ours_yw["p"] == pytest.approx(yw.p, rel=1e-8, abs=1e-12)


@pytest.mark.parametrize("seed", range(10))
def test_sen_interval_matches_scipy(seed):
    rng = np.random.default_rng(100 + seed)
    n = int(rng.integers(12, 50))
    x = rng.normal(0, 1, n) + 0.05 * np.arange(n)
    t = np.arange(n) + 1981.5
    ref = sps.theilslopes(x, t, alpha=0.95)
    ours = tl.sen_slope(x, t)
    assert ours["slope"] == pytest.approx(ref.slope, rel=1e-12)
    assert ours["low"] == pytest.approx(ref.low_slope, rel=1e-12)
    assert ours["high"] == pytest.approx(ref.high_slope, rel=1e-12)


def test_ols_matches_linregress_without_autocorrelation():
    rng = np.random.default_rng(7)
    for _ in range(50):
        n = 30
        t = np.arange(n) + 1990.5
        x = 0.1 * t + rng.normal(0, 1, n)
        ours = tl.ols_trend(x, t)
        ref = sps.linregress(t, x)
        assert ours["slope"] == pytest.approx(ref.slope, rel=1e-10)
        if ours["r1"] <= 0:
            assert ours["p"] == pytest.approx(ref.pvalue, rel=1e-8, abs=1e-14)


def test_bh_matches_scipy():
    rng = np.random.default_rng(3)
    p = np.concatenate([rng.uniform(0, 1, 200), rng.uniform(0, 0.001, 30)])
    sig, adj = tl.bh_fdr(p)
    ref = sps.false_discovery_control(p, method="bh")
    assert np.allclose(adj, ref)
    assert (sig == (ref <= 0.05)).all()


def test_recovers_known_slope_from_monthly_data():
    """40 years of monthly data with a seasonal cycle, AR(1) noise and +0.3 units/decade."""
    rng = np.random.default_rng(42)
    years = np.repeat(np.arange(1981, 2021), 12)
    months = np.tile(np.arange(1, 13), 40)
    tt = years + (months - 0.5) / 12
    true = 0.03
    covered = 0
    slopes = []
    for _ in range(300):
        y = 15 + 8 * np.sin(2 * np.pi * (months - 4) / 12) + true * (tt - 1981) + ar1(len(tt), 0.5, rng, 0.6)
        res = tl.analyze(years, y, 12, months)
        slopes.append(res["sen"]["slope"])
        covered += res["sen"]["low"] <= true <= res["sen"]["high"]
    assert abs(np.mean(slopes) - true) < 0.002
    assert covered / 300 >= 0.92  # nominal 95% interval


@pytest.mark.parametrize("n", [25, 40])
@pytest.mark.parametrize("phi", [0.0, 0.2, 0.4])
def test_false_alarm_rate_without_trend(phi, n):
    """With no trend the test should flag roughly 5% of series, even with year-to-year memory.
    (The Hamed-Rao correction flags 15% at phi=0.4 in the same setting.)"""
    rng = np.random.default_rng(int(phi * 10) + n)
    hits = sum(tl.mann_kendall(ar1(n, phi, rng))["p"] < 0.05 for _ in range(2000))
    assert hits / 2000 < 0.08


def test_t_test_false_alarm_rate():
    rng = np.random.default_rng(11)
    t = np.arange(40) + 1985.5
    hits = sum(tl.ols_trend(ar1(40, 0.4, rng), t)["p"] < 0.05 for _ in range(2000))
    assert hits / 2000 < 0.09


def test_years_needed_is_consistent():
    """A larger trend needs fewer years; noise with memory needs more."""
    rng = np.random.default_rng(1)
    noise = rng.normal(0, 1, 480)
    a = tl.years_needed(noise, 0.05, 12)
    b = tl.years_needed(noise, 0.10, 12)
    assert b < a
    red = ar1(480, 0.6, rng)
    red = red / red.std()
    assert tl.years_needed(red, 0.05, 12) > a
