from datetime import time
from pathlib import Path

import pytest

from winddesk.analytics.pilot import CONFIDENCES
from winddesk.store import DataStore, SnapshotMissingError

from .conftest import D1, D2, D3, EPEX, SYNTHETIC_SNAPSHOT_ID


def test_loads_and_precomputes(synthetic_store: DataStore) -> None:
    store = synthetic_store
    assert store.snapshot_id == SYNTHETIC_SNAPSHOT_ID
    assert set(store.pools) == {"epex", "n2ex"}
    # Only D1–D3 have runs and actuals; the other in-scope days contribute no pairs.
    assert set(store.pools["epex"]["delivery_date"]) == {D1, D2, D3}
    assert len(store.pools["epex"]) == 72
    assert set(store.calibrations) == {(a, c) for a in ("epex", "n2ex") for c in CONFIDENCES}
    assert set(store.lead_curves) == {1.0, 3.0}
    assert int(store.lead_curves[1.0]["n"].sum()) == len(store.pairs_all) == 216
    assert store.load_ms > 0


def test_custom_cutoffs_are_computed_once(synthetic_store: DataStore) -> None:
    store = synthetic_store
    assert store.pool_for_cutoff(EPEX) is store.pools["epex"]
    custom = store.pool_for_cutoff(time(10, 0))  # after the 09:30 run → same as N2EX
    assert custom.equals(store.pools["n2ex"])
    assert store.pool_for_cutoff(time(10, 0)) is custom


def test_missing_snapshot_is_reported(tmp_path: Path) -> None:
    with pytest.raises(SnapshotMissingError, match="make ingest"):
        DataStore(tmp_path)
