import json
from pathlib import Path

import pytest

from winddesk.analytics.pilot import CONFIDENCES
from winddesk.store import DataStore, SnapshotMissingError

from .conftest import D1, D2, D3, EPEX, synthetic_actuals, synthetic_forecasts


@pytest.fixture
def snapshot_dir(tmp_path: Path) -> Path:
    synthetic_forecasts().to_parquet(tmp_path / "forecasts.parquet", index=False)
    synthetic_actuals().to_parquet(tmp_path / "actuals.parquet", index=False)
    (tmp_path / "manifest.json").write_text(json.dumps({"snapshot_id": "0123456789ab"}))
    (tmp_path / "quality.json").write_text(json.dumps({"status": "ok", "checks": []}))
    return tmp_path


def test_loads_and_precomputes(snapshot_dir: Path) -> None:
    store = DataStore(snapshot_dir)
    assert store.snapshot_id == "0123456789ab"
    assert set(store.pools) == {"epex", "n2ex"}
    # Only D1–D3 have runs and actuals; the other in-scope days contribute no pairs.
    assert set(store.pools["epex"]["delivery_date"]) == {D1, D2, D3}
    assert len(store.pools["epex"]) == 72
    assert set(store.calibrations) == {(a, c) for a in ("epex", "n2ex") for c in CONFIDENCES}
    assert set(store.lead_curves) == {1.0, 3.0}
    assert int(store.lead_curves[1.0]["n"].sum()) == len(store.pairs_all) == 216
    assert store.load_ms > 0


def test_custom_cutoffs_are_computed_once(snapshot_dir: Path) -> None:
    store = DataStore(snapshot_dir)
    assert store.pool_for_cutoff(EPEX) is store.pools["epex"]
    from datetime import time

    custom = store.pool_for_cutoff(time(10, 0))  # after the 09:30 run → same as N2EX
    assert custom.equals(store.pools["n2ex"])
    assert store.pool_for_cutoff(time(10, 0)) is custom


def test_missing_snapshot_is_reported(tmp_path: Path) -> None:
    with pytest.raises(SnapshotMissingError, match="make ingest"):
        DataStore(tmp_path)
