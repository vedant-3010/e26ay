"""Analytics invariants on the real snapshot (marker `snapshot`, run with `make test-contract`)."""

from datetime import time

import numpy as np
import pandas as pd
import pytest

from winddesk.analytics.decision import decision_day
from winddesk.analytics.pilot import AUCTIONS, CONFIDENCES, DELIVERY_FROM, DELIVERY_TO
from winddesk.analytics.selection import coverage, select_at_horizon
from winddesk.analytics.timeutil import delivery_day_targets
from winddesk.store import DataStore, get_store

pytestmark = pytest.mark.snapshot


@pytest.fixture(scope="module")
def store() -> DataStore:
    return get_store()


@pytest.fixture(scope="module")
def delivery_targets() -> pd.Series:
    days = pd.date_range(DELIVERY_FROM.isoformat(), DELIVERY_TO.isoformat(), freq="D")
    return pd.Series([t for d in days for t in delivery_day_targets(d.date())])


@pytest.mark.parametrize("horizon_h", np.arange(0, 48.5, 0.5))
def test_lead_never_below_horizon(
    store: DataStore, delivery_targets: pd.Series, horizon_h: float
) -> None:
    out = select_at_horizon(store.forecasts, delivery_targets, horizon_h).dropna(
        subset=["forecast_mw"]
    )
    assert (out["lead_h"] >= horizon_h).all()


@pytest.mark.parametrize("horizon_h", [0.0, 12.0, 24.0, 36.0, 43.5])
def test_full_coverage_up_to_43_5h(
    store: DataStore, delivery_targets: pd.Series, horizon_h: float
) -> None:
    assert coverage(select_at_horizon(store.forecasts, delivery_targets, horizon_h)).pct == 100


def test_coverage_gaps_beyond_43_5h_are_exactly_the_late_evening_hours(
    store: DataStore, delivery_targets: pd.Series
) -> None:
    # DATA §5.1: the earliest run reaching 22:00 is the 02:30 run of the day before (43.5 h);
    # for 23:00 it is 44.5 h.
    def missing_hours(h: float) -> set[int]:
        out = select_at_horizon(store.forecasts, delivery_targets, h)
        return set(out.loc[out["forecast_mw"].isna(), "target_time"].dt.hour)

    assert missing_hours(44.0) == {22}
    assert missing_hours(45.0) == {22, 23}


@pytest.mark.parametrize(
    "cutoff", [a.cutoff_local for a in AUCTIONS] + [time(0, 0), time(9, 0), time(12, 45)]
)
def test_no_look_ahead_for_every_day(store: DataStore, cutoff: time) -> None:
    pool = store.pool_for_cutoff(cutoff)
    for day in store.delivery_days:
        result = decision_day(
            store.forecasts,
            store.actuals,
            pool,
            day,
            auction="custom",
            cutoff_local=cutoff,
            confidence=0.9,
        )
        assert result.run.publish_time is not None
        assert result.run.publish_time <= result.cutoff_utc
        for v in result.vintages:
            assert v.after_cutoff == (v.publish_time > result.cutoff_utc)
            assert v.is_decision_run == (v.publish_time == result.run.publish_time)
        assert (result.points["firm_mw"].dropna() <= result.points["forecast_mw"].dropna()).all()


@pytest.mark.parametrize("auction", [a.id for a in AUCTIONS])
@pytest.mark.parametrize("confidence", CONFIDENCES)
def test_calibration_within_five_points_of_target(
    store: DataStore, auction: str, confidence: float
) -> None:
    # PRD §3 success criterion, measured without look-ahead (LODO).
    cal = store.calibrations[(auction, confidence)]
    assert cal.achieved_pct is not None
    assert abs(cal.achieved_pct - cal.target_pct) <= 5


def test_decision_pools_are_complete(store: DataStore) -> None:
    for auction in store.pools.values():
        assert len(auction) == 31 * 24
        assert auction["delivery_date"].nunique() == 31
