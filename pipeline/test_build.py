"""Checks on the build configuration (no downloads).

Run:  .venv/bin/python -m pytest -q
"""
import pytest

import build
from config import REGIONS, TOPICS, VARIABLES

REQUIRED = {"name", "short", "topic", "unit", "decimals", "definition", "source", "instrument", "start", "land_only", "agg"}


def test_skip_switch_defaults_to_nothing(monkeypatch):
    monkeypatch.delenv("TRENDLENS_SKIP", raising=False)
    assert build.skipped() == set()
    assert build.skipped("") == set()


def test_skip_switch_parses_a_list():
    assert build.skipped("ndvi") == {"ndvi"}
    assert build.skipped(" NDVI , tree ,") == {"ndvi", "tree"}


def test_skip_switch_reads_the_environment(monkeypatch):
    monkeypatch.setenv("TRENDLENS_SKIP", "ndvi")
    assert build.skipped() == {"ndvi"}


def test_skip_switch_rejects_unknown_ids():
    with pytest.raises(SystemExit):
        build.skipped("ndvi,greenness")


@pytest.mark.parametrize("vid", sorted(VARIABLES))
def test_variable_definitions_are_complete(vid):
    meta = VARIABLES[vid]
    assert REQUIRED <= set(meta), REQUIRED - set(meta)
    assert meta["topic"] in TOPICS
    assert meta["start"] <= 2005, "the plan asks for at least 20 years of data"
    assert meta["definition"].endswith(".")


def test_percent_variables_say_what_they_are_a_percent_of():
    # a bare "%" axis reads as "% of ground" (tree cover); other percentages need their own label
    for vid, meta in VARIABLES.items():
        if meta["unit"] == "%" and meta["topic"] != "vegetation":
            assert meta.get("axis", "").startswith("%"), vid


def test_ceres_variables_start_in_the_ceres_era():
    # before 2001 POWER fills CERES parameters from GEWEX SRB; splicing the two can fake a trend
    for vid, meta in VARIABLES.items():
        if "CERES" in meta["source"]:
            assert meta["start"] >= 2001, vid


def test_power_codes_are_unique():
    codes = [v["power"] for v in VARIABLES.values() if "power" in v]
    assert len(codes) == len(set(codes))


def test_regions_fit_power_limits():
    for reg in REGIONS.values():
        lat0, lat1, lon0, lon1 = reg["bbox"]
        assert 0 < lat1 - lat0 <= 10 and 0 < lon1 - lon0 <= 10
