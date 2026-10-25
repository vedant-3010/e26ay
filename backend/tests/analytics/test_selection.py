"""Selection, pairing and vintages on the synthetic dataset (values derived in conftest.py)."""

import numpy as np
import pandas as pd
import pytest

from winddesk.analytics.selection import (
    PAIR_COLUMNS,
    coverage,
    decision_pool,
    hourly_mean_actuals,
    hourly_targets,
    make_pairs,
    select_at_horizon,
    select_decision_run,
    vintages_for_day,
)
from winddesk.analytics.timeutil import decision_cutoff_utc, delivery_day_targets

from ..conftest import D1, D2, D3, DAYS, EPEX, N2EX, utc


def targets(*ts: pd.Timestamp) -> pd.Series:
    return pd.Series(list(ts))


class TestHourlyTargets:
    def test_half_open_and_on_the_hour(self) -> None:
        t = hourly_targets(utc(D1, 0, 30), utc(D1, 3))
        assert list(t) == [utc(D1, 1), utc(D1, 2)]

    def test_empty_range(self) -> None:
        assert hourly_targets(utc(D1, 3), utc(D1, 3)).empty


class TestSelectAtHorizon:
    def test_exact_boundary_is_included(self, forecasts: pd.DataFrame) -> None:
        # D1 00:00 − 14.5 h = 1 Jan 09:30, exactly the 09:30 run's publish time → eligible.
        row = select_at_horizon(forecasts, targets(utc(D1, 0)), 14.5).iloc[0]
        assert row["publish_time"] == utc(D1 - pd.Timedelta(days=1), 9, 30)
        assert row["forecast_mw"] == 11_000
        assert row["lead_h"] == 14.5

    def test_picks_the_latest_eligible_run(self, forecasts: pd.DataFrame) -> None:
        # − 14.6 h = 09:24 → the 09:30 run is not yet out; latest eligible is 07:30 (lead 16.5).
        row = select_at_horizon(forecasts, targets(utc(D1, 0)), 14.6).iloc[0]
        assert (row["forecast_mw"], row["lead_h"]) == (10_000, 16.5)
        # − 12 h = 12:00 → the 11:30 run (lead 12.5).
        row = select_at_horizon(forecasts, targets(utc(D1, 0)), 12.0).iloc[0]
        assert (row["forecast_mw"], row["lead_h"]) == (12_000, 12.5)

    def test_null_when_no_run_qualifies_and_coverage(self, forecasts: pd.DataFrame) -> None:
        # H = 17: target D1 h:00 → cutoff 1 Jan (h+7):00. For h = 0 (07:00) no run exists yet;
        # for h ≥ 1 the 07:30 run (or later) qualifies → 23 of 24 hours covered.
        out = select_at_horizon(forecasts, pd.Series(delivery_day_targets(D1)), 17.0)
        assert np.isnan(out.loc[0, "forecast_mw"])
        assert pd.isna(out.loc[0, "publish_time"])
        assert out.loc[1, "lead_h"] == 17.5  # 07:30 run, h = 1
        cov = coverage(out)
        assert (cov.target_hours, cov.with_forecast) == (24, 23)
        assert cov.pct == pytest.approx(100 * 23 / 24)

    @pytest.mark.parametrize("horizon_h", np.arange(0, 48.5, 0.5))
    def test_lead_is_never_below_the_horizon(
        self, forecasts: pd.DataFrame, horizon_h: float
    ) -> None:
        all_targets = pd.Series([t for d in DAYS for t in delivery_day_targets(d)])
        out = select_at_horizon(forecasts, all_targets, horizon_h).dropna(subset=["forecast_mw"])
        assert (out["lead_h"] >= horizon_h).all()

    def test_output_is_one_row_per_target_in_time_order(self, forecasts: pd.DataFrame) -> None:
        t = targets(utc(D2, 5), utc(D1, 3), utc(D2, 1))
        out = select_at_horizon(forecasts, t, 20.0)
        assert list(out["target_time"]) == sorted(t)
        assert list(out.columns) == ["target_time", "publish_time", "forecast_mw", "lead_h"]

    def test_empty_targets(self, forecasts: pd.DataFrame) -> None:
        out = select_at_horizon(forecasts, pd.Series([], dtype="datetime64[ns, UTC]"), 24.0)
        assert out.empty
        assert coverage(out).pct is None


class TestDecisionRun:
    def test_uses_latest_run_before_cutoff(self, forecasts: pd.DataFrame) -> None:
        run = select_decision_run(forecasts, D1, decision_cutoff_utc(D1, EPEX))
        assert run.publish_time == utc(D1 - pd.Timedelta(days=1), 7, 30)
        assert (run.lead_min_h, run.lead_max_h) == (16.5, 39.5)
        assert not run.partial
        assert list(run.points["forecast_mw"]) == [10_000 + 10 * h for h in range(24)]

    def test_no_look_ahead_one_minute_after_cutoff_is_ignored(
        self, forecasts: pd.DataFrame
    ) -> None:
        cutoff = decision_cutoff_utc(D1, EPEX)  # 1 Jan 09:20
        late = forecasts[forecasts["publish_time"] == utc(D1 - pd.Timedelta(days=1), 7, 30)].copy()
        late["publish_time"] = cutoff + pd.Timedelta(minutes=1)
        late["forecast_mw"] = 99_999.0
        run = select_decision_run(pd.concat([forecasts, late]), D1, cutoff)
        assert run.publish_time == utc(D1 - pd.Timedelta(days=1), 7, 30)
        assert 99_999.0 not in set(run.points["forecast_mw"])

    def test_a_run_published_exactly_at_the_cutoff_is_used(self, forecasts: pd.DataFrame) -> None:
        cutoff = decision_cutoff_utc(D1, EPEX)
        exact = forecasts[forecasts["publish_time"] == utc(D1 - pd.Timedelta(days=1), 7, 30)].copy()
        exact["publish_time"] = cutoff
        exact["forecast_mw"] = 5_000.0
        run = select_decision_run(pd.concat([forecasts, exact]), D1, cutoff)
        assert run.publish_time == cutoff
        assert set(run.points["forecast_mw"]) == {5_000.0}

    def test_partial_run_leaves_gaps_and_never_substitutes(self, forecasts: pd.DataFrame) -> None:
        run_0730 = utc(D1 - pd.Timedelta(days=1), 7, 30)
        gappy = forecasts[
            ~(
                (forecasts["publish_time"] == run_0730)
                & forecasts["target_time"].isin([utc(D1, 22), utc(D1, 23)])
            )
        ]
        run = select_decision_run(gappy, D1, decision_cutoff_utc(D1, EPEX))
        assert run.partial
        assert run.missing_hours == (utc(D1, 22), utc(D1, 23))
        # The 09:30 run covers 22:00/23:00, but it was not available at 09:20: still gaps.
        assert run.points["forecast_mw"].iloc[-2:].isna().all()
        assert len(run.points) == 24
        assert run.lead_max_h == 37.5  # 16.5 + 21

    def test_no_run_at_all(self, forecasts: pd.DataFrame) -> None:
        run = select_decision_run(forecasts, D1, utc(D1 - pd.Timedelta(days=1), 6, 0))
        assert run.publish_time is None
        assert len(run.missing_hours) == 24
        assert run.lead_min_h is None and run.lead_max_h is None


class TestPairs:
    def test_error_sign_alignment_and_derived_columns(
        self, forecasts: pd.DataFrame, actuals: pd.DataFrame
    ) -> None:
        pairs = make_pairs(forecasts, actuals)
        assert list(pairs.columns) == PAIR_COLUMNS
        assert len(pairs) == 3 * 3 * 24  # every run × target has an actual
        first = pairs.iloc[0]  # D1 00:00, the 07:30 run: 10 000 − 9 800 (the 00:00 period)
        assert first["error_mw"] == 200.0  # forecast − actual; positive = over-forecast
        assert first["abs_error_mw"] == 200.0
        assert first["delivery_date"] == D1
        assert first["hour_uk"] == 0

    def test_null_forecasts_and_targets_without_actuals_are_dropped(
        self, actuals: pd.DataFrame
    ) -> None:
        selected = pd.DataFrame(
            {
                "publish_time": [utc(D1, 0)] * 3,
                "target_time": [utc(D1, 1), utc(D1, 2), utc(D3 + pd.Timedelta(days=5), 0)],
                "forecast_mw": [1.0, np.nan, 2.0],
                "lead_h": [1.0, 2.0, 3.0],
            }
        )
        assert list(make_pairs(selected, actuals)["target_time"]) == [utc(D1, 1)]

    def test_decision_pools_hold_one_pair_per_decision_hour(
        self, epex_pool: pd.DataFrame, n2ex_pool: pd.DataFrame
    ) -> None:
        assert len(epex_pool) == len(n2ex_pool) == 72
        assert epex_pool.groupby("delivery_date")["error_mw"].unique().map(list).to_dict() == {
            D1: [200.0],
            D2: [100.0],
            D3: [0.0],
        }
        assert set(n2ex_pool["error_mw"]) == {1_200.0, 1_100.0, 1_000.0}

    def test_hourly_mean_alignment(self, forecasts: pd.DataFrame, actuals: pd.DataFrame) -> None:
        # Hour h on day i: mean of (9 800 + 10h + 100i) and that + 100 → + 50 vs the h:00 period.
        hourly = hourly_mean_actuals(actuals)
        assert len(hourly) == 72
        assert hourly.iloc[0]["actual_mw"] == 9_850
        pool = decision_pool(forecasts, hourly, DAYS, EPEX)
        assert set(pool.loc[pool["delivery_date"] == D1, "error_mw"]) == {150.0}  # 200 − 50

    def test_hourly_mean_drops_incomplete_hours(self, actuals: pd.DataFrame) -> None:
        gappy = actuals[actuals["target_time"] != utc(D1, 5, 30)]
        assert utc(D1, 5) not in set(hourly_mean_actuals(gappy)["target_time"])

    def test_decision_pool_skips_days_without_a_run(
        self, forecasts: pd.DataFrame, actuals: pd.DataFrame
    ) -> None:
        early = forecasts[forecasts["publish_time"] > utc(D1, 0)]  # drop every 1 Jan run
        pool = decision_pool(early, actuals, [D1], EPEX)
        assert pool.empty


class TestVintages:
    def test_runs_in_the_48h_before_the_day_with_flags(self, forecasts: pd.DataFrame) -> None:
        cutoff = decision_cutoff_utc(D2, EPEX)  # 2 Jan 09:20
        run = select_decision_run(forecasts, D2, cutoff)
        vintages = vintages_for_day(forecasts, D2, cutoff, run.publish_time)
        # 1 Jan runs only cover D1, so they carry no points for D2 and are left out.
        assert [f"{v.publish_time:%d %H:%M}" for v in vintages] == [
            "02 07:30",
            "02 09:30",
            "02 11:30",
        ]
        assert [v.is_decision_run for v in vintages] == [True, False, False]
        assert [v.after_cutoff for v in vintages] == [False, True, True]
        assert all(len(v.points) == 24 for v in vintages)

    def test_n2ex_cutoff_moves_the_after_cutoff_flag(self, forecasts: pd.DataFrame) -> None:
        cutoff = decision_cutoff_utc(D2, N2EX)
        run = select_decision_run(forecasts, D2, cutoff)
        vintages = vintages_for_day(forecasts, D2, cutoff, run.publish_time)
        assert [v.after_cutoff for v in vintages] == [False, False, True]
        assert [v.is_decision_run for v in vintages] == [False, True, False]
