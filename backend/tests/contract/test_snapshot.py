"""Data-contract tests on the committed snapshot (DATA §7 item 14). Run with `make test-contract`.

They pin down what the analytics may rely on, and record the one known deviation from Elexon's
nominal schedule (15 Jan 2026: the 11:30 run was published at 12:25 UTC).
"""

import hashlib
import json
from datetime import timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from winddesk.analytics.pilot import (
    AUCTIONS,
    DELIVERY_FROM,
    DELIVERY_TO,
    PUBLISH_FROM,
    PUBLISH_TO,
    TARGET_FROM_UTC,
    TARGET_TO_UTC,
)
from winddesk.analytics.timeutil import (
    UTC_DTYPE,
    decision_cutoff_utc,
    delivery_day_targets,
    delivery_days,
)
from winddesk.config import get_settings

pytestmark = pytest.mark.snapshot

SNAPSHOT = get_settings().data_path
KNOWN_OFF_SCHEDULE_RUNS = ["2026-01-15T12:25:00Z"]


@pytest.fixture(scope="module")
def forecasts() -> pd.DataFrame:
    return pd.read_parquet(SNAPSHOT / "forecasts.parquet")


@pytest.fixture(scope="module")
def actuals() -> pd.DataFrame:
    return pd.read_parquet(SNAPSHOT / "actuals.parquet")


def _json(name: str) -> dict[str, Any]:
    doc: dict[str, Any] = json.loads((SNAPSHOT / name).read_text(encoding="utf-8"))
    return doc


@pytest.fixture(scope="module")
def quality() -> dict[str, Any]:
    return _json("quality.json")


@pytest.fixture(scope="module")
def checks(quality: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {c["id"]: c for c in quality["checks"]}


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_manifest_matches_files(forecasts: pd.DataFrame, actuals: pd.DataFrame) -> None:
    manifest = _json("manifest.json")
    files = [SNAPSHOT / "actuals.parquet", SNAPSHOT / "forecasts.parquet"]
    combined = hashlib.sha256(b"".join(p.read_bytes() for p in files)).hexdigest()
    assert manifest["snapshot_id"] == combined[:12]
    assert manifest["files"] == {p.name: _sha(p) for p in files}
    assert manifest["rows"] == {"actuals": len(actuals), "forecasts": len(forecasts)}


def test_schema_and_timezones(forecasts: pd.DataFrame, actuals: pd.DataFrame) -> None:
    assert list(forecasts.columns) == ["publish_time", "target_time", "forecast_mw", "lead_h"]
    assert list(actuals.columns) == [
        "target_time",
        "actual_mw",
        "settlement_date",
        "settlement_period",
    ]
    for col in (forecasts["publish_time"], forecasts["target_time"], actuals["target_time"]):
        assert str(col.dtype) == UTC_DTYPE
    assert forecasts["forecast_mw"].notna().all()
    assert actuals["actual_mw"].notna().all()


def test_target_window(forecasts: pd.DataFrame, actuals: pd.DataFrame) -> None:
    for t in (forecasts["target_time"], actuals["target_time"]):
        assert t.min() >= TARGET_FROM_UTC
        assert t.max() < TARGET_TO_UTC


def test_no_duplicates(forecasts: pd.DataFrame, actuals: pd.DataFrame) -> None:
    assert not forecasts.duplicated(["publish_time", "target_time"]).any()
    assert not actuals["target_time"].duplicated().any()


def test_resolution(forecasts: pd.DataFrame, actuals: pd.DataFrame) -> None:
    # Forecast targets are on the hour; actuals are half-hour starts.
    assert (forecasts["target_time"].dt.minute == 0).all()
    assert actuals["target_time"].dt.minute.isin([0, 30]).all()


def test_lead_is_target_minus_publish_and_never_negative(forecasts: pd.DataFrame) -> None:
    expected = (forecasts["target_time"] - forecasts["publish_time"]).dt.total_seconds() / 3600
    assert (forecasts["lead_h"] == expected).all()
    assert (forecasts["lead_h"] >= 0).all()
    on_grid = (forecasts["lead_h"] - 0.5) % 1 == 0
    off_grid_runs = sorted(
        forecasts.loc[~on_grid, "publish_time"].dt.strftime("%Y-%m-%dT%H:%M:%SZ").unique()
    )
    assert off_grid_runs == KNOWN_OFF_SCHEDULE_RUNS


def test_eight_runs_on_every_publish_day(forecasts: pd.DataFrame) -> None:
    runs = pd.Series(forecasts["publish_time"].unique())
    per_day = runs.dt.date.value_counts()
    for day in delivery_days(PUBLISH_FROM, PUBLISH_TO):
        assert per_day.get(day, 0) == 8, day


def test_73_rows_per_run_before_filtering(checks: dict[str, dict[str, Any]]) -> None:
    # Filtering happens at ingest, so this comes from quality.json (DATA §7 item 14).
    rows = checks["rows_per_run"]
    assert rows["status"] == "ok"
    assert rows["details"]["histogram"] == {"73": 272}


def test_run_times_are_nominal_except_known_late_run(checks: dict[str, dict[str, Any]]) -> None:
    assert checks["run_times"]["details"]["off_schedule"] == KNOWN_OFF_SCHEDULE_RUNS


def test_48_periods_on_every_settlement_day(actuals: pd.DataFrame) -> None:
    present = set(actuals["target_time"])
    for day in delivery_days(TARGET_FROM_UTC.date(), (TARGET_TO_UTC - timedelta(days=1)).date()):
        expected = delivery_day_targets(day, freq="30min")
        assert len(expected) == 48
        assert all(t in present for t in expected), day
    periods = actuals.groupby("settlement_date")["settlement_period"].agg(["min", "max", "count"])
    assert (periods["min"] == 1).all() and (periods["max"] == 48).all()
    assert (periods["count"] == 48).all()


@pytest.mark.parametrize("preset", AUCTIONS, ids=lambda p: p.id)
def test_full_decision_coverage_for_every_in_scope_day(
    forecasts: pd.DataFrame, preset: Any
) -> None:
    runs = pd.Series(sorted(forecasts["publish_time"].unique()))
    for day in delivery_days(DELIVERY_FROM, DELIVERY_TO):
        cutoff = decision_cutoff_utc(day, preset.cutoff_local)
        run = runs[runs <= cutoff].iloc[-1]
        assert run <= cutoff  # no look-ahead
        covered = forecasts.loc[forecasts["publish_time"] == run, "target_time"]
        assert delivery_day_targets(day).isin(covered).all(), (preset.id, day)


def test_quality_status_reflects_only_the_documented_deviation(
    quality: dict[str, Any], checks: dict[str, dict[str, Any]]
) -> None:
    warnings = sorted(cid for cid, c in checks.items() if c["status"] != "ok")
    assert warnings == ["run_times"]
    assert quality["status"] == "warn"
