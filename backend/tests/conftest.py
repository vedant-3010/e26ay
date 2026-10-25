"""Shared fixtures, including the synthetic, hand-computable dataset of DATA §7.

Synthetic dataset (all UTC; January, so UK time = UTC):

- Delivery days D1 = Fri 2 Jan, D2 = Sat 3 Jan, D3 = Sun 4 Jan 2026 (day index i = 0, 1, 2).
- Runs: on each publish day P ∈ {1, 2, 3 Jan} at 07:30, 09:30 and 11:30. Each run covers the 24
  hourly targets of day P + 1 (hour h = 0…23), with
      forecast_mw = LEVEL[run] + 10·h,   LEVEL = {07:30: 10 000, 09:30: 11 000, 11:30: 12 000}
      lead_h      = 16.5 + h, 14.5 + h, 12.5 + h respectively.
- Actuals for D1–D3, half-hourly:
      actual(h:00) = 9 800 + 10·h + 100·i,   actual(h:30) = actual(h:00) + 100.
  The h:30 periods differ on purpose: pairing must use the period *starting* at h (ADR-0004).

Hand-computed consequences used across the tests:
- EPEX (cutoff 09:20 on D−1) uses the 07:30 run → error = 200 − 100·i: D1 200, D2 100, D3 0 MW.
- N2EX (cutoff 09:50 on D−1) uses the 09:30 run → error = 1 200 − 100·i: 1 200, 1 100, 1 000 MW.
"""

import json
from collections.abc import Iterator
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from winddesk.analytics.selection import decision_pool
from winddesk.analytics.timeutil import UTC_DTYPE
from winddesk.api.deps import store_dep
from winddesk.main import create_app
from winddesk.store import DataStore

D1, D2, D3 = date(2026, 1, 2), date(2026, 1, 3), date(2026, 1, 4)
DAYS = (D1, D2, D3)
RUN_LEVELS = {time(7, 30): 10_000.0, time(9, 30): 11_000.0, time(11, 30): 12_000.0}
EPEX, N2EX = time(9, 20), time(9, 50)


def utc(day: date, hour: int, minute: int = 0) -> pd.Timestamp:
    return pd.Timestamp(datetime.combine(day, time(hour, minute), tzinfo=UTC)).as_unit("ns")


def synthetic_forecasts() -> pd.DataFrame:
    rows = []
    for day in DAYS:
        publish_day = day - timedelta(days=1)
        for run, level in RUN_LEVELS.items():
            publish = utc(publish_day, run.hour, run.minute)
            for h in range(24):
                target = utc(day, h)
                rows.append(
                    {
                        "publish_time": publish,
                        "target_time": target,
                        "forecast_mw": level + 10 * h,
                        "lead_h": (target - publish).total_seconds() / 3600,
                    }
                )
    df = pd.DataFrame(rows)
    for col in ("publish_time", "target_time"):
        df[col] = df[col].astype(UTC_DTYPE)
    return df.sort_values(["publish_time", "target_time"]).reset_index(drop=True)


def synthetic_actuals() -> pd.DataFrame:
    rows = []
    for i, day in enumerate(DAYS):
        for h in range(24):
            on_hour = 9_800.0 + 10 * h + 100 * i
            for minute, value in ((0, on_hour), (30, on_hour + 100)):
                rows.append(
                    {
                        "target_time": utc(day, h, minute),
                        "actual_mw": value,
                        "settlement_date": day.isoformat(),
                        "settlement_period": 2 * h + minute // 30 + 1,
                    }
                )
    df = pd.DataFrame(rows)
    df["target_time"] = df["target_time"].astype(UTC_DTYPE)
    df["settlement_period"] = df["settlement_period"].astype("int16")
    return df


@pytest.fixture
def forecasts() -> pd.DataFrame:
    return synthetic_forecasts()


@pytest.fixture
def actuals() -> pd.DataFrame:
    return synthetic_actuals()


@pytest.fixture
def epex_pool(forecasts: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    return decision_pool(forecasts, actuals, DAYS, EPEX)


@pytest.fixture
def n2ex_pool(forecasts: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    return decision_pool(forecasts, actuals, DAYS, N2EX)


SYNTHETIC_SNAPSHOT_ID = "0123456789ab"


@pytest.fixture
def synthetic_snapshot_dir(tmp_path: Path) -> Path:
    """A snapshot directory holding the synthetic dataset, laid out like data/snapshot."""
    synthetic_forecasts().to_parquet(tmp_path / "forecasts.parquet", index=False)
    synthetic_actuals().to_parquet(tmp_path / "actuals.parquet", index=False)
    manifest = {"snapshot_id": SYNTHETIC_SNAPSHOT_ID, "created_at": "2026-10-26T00:00:00Z"}
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    quality = {
        "status": "warn",
        "summary": {
            "forecast_runs": 9,
            "forecast_rows": 216,
            "forecast_duplicates_removed": 0,
            "actual_rows": 144,
            "actual_duplicates_removed": 0,
        },
        "checks": [
            {"id": "runs_per_day", "status": "warn", "message": "3 runs per day", "details": {}},
            {
                "id": "run_times",
                "status": "ok",
                "message": "nominal",
                "details": {"off_schedule": ["2026-01-02T12:25:00Z"]},
            },
            {
                "id": "periods_per_day",
                "status": "ok",
                "message": "all present",
                "details": {"missing_periods": []},
            },
        ],
    }
    (tmp_path / "quality.json").write_text(json.dumps(quality))
    return tmp_path


@pytest.fixture
def synthetic_store(synthetic_snapshot_dir: Path) -> DataStore:
    return DataStore(synthetic_snapshot_dir)


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture
def api(synthetic_store: DataStore) -> Iterator[TestClient]:
    """A client whose data endpoints read the synthetic store."""
    app = create_app()
    app.dependency_overrides[store_dep] = lambda: synthetic_store
    with TestClient(app) as c:
        yield c
