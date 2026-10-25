"""Buffers, firm wind and LODO calibration. Synthetic EPEX errors: D1 200, D2 100, D3 0 MW."""

import numpy as np
import pandas as pd
import pytest

from winddesk.analytics.buffers import (
    MIN_BIN_N,
    calibrate,
    firm_wind,
    fit_buffer_model,
    level_bin,
    level_bins,
    level_edges,
    lodo_buffer_model,
    shortfall_buffer,
)
from winddesk.analytics.selection import decision_pool

from ..conftest import D1, D2, D3, DAYS, EPEX


def graded_pool() -> pd.DataFrame:
    """200 hours, forecast_mw = 100·i and error_mw = 10·i (i = 0…199): error grows with level."""
    i = np.arange(200)
    return pd.DataFrame({"forecast_mw": 100.0 * i, "error_mw": 10.0 * i, "delivery_date": D1})


class TestShortfallBuffer:
    def test_is_the_quantile_of_over_forecast_error(self) -> None:
        assert shortfall_buffer(pd.Series([0.0, 100.0, 200.0]), 0.9) == pytest.approx(180)

    def test_is_clamped_at_zero(self) -> None:
        assert shortfall_buffer(pd.Series([-300.0, -100.0]), 0.9) == 0.0


class TestLevelBins:
    def test_quintile_edges_rounded_to_100_mw(self) -> None:
        # Quintiles of 0, 100, …, 19 900 (positions 39.8, 79.6, 119.4, 159.2):
        # 3 980, 7 960, 11 940, 15 920 → 4 000, 8 000, 11 900, 15 900.
        assert level_edges(graded_pool()["forecast_mw"]) == (4_000, 8_000, 11_900, 15_900)

    def test_duplicate_and_out_of_range_edges_are_dropped(self) -> None:
        # 10 000 + 10·h, h = 0…23: quintiles 10 046, 10 092, 10 138, 10 184 → rounded
        # {10 000, 10 100, 10 200}; 10 000 is the minimum (it would make an empty bin) → dropped.
        values = pd.Series(10_000.0 + 10 * np.arange(24))
        assert level_edges(values) == (10_100, 10_200)

    def test_value_on_an_edge_belongs_to_the_upper_bin(self) -> None:
        idx = level_bin(pd.Series([3_999.0, 4_000.0, 20_000.0]), (4_000, 8_000))
        assert list(idx) == [0, 1, 2]

    def test_bin_bounds(self) -> None:
        bins = level_bins((4_000, 8_000))
        assert [(b.forecast_from_mw, b.forecast_to_mw) for b in bins] == [
            (0.0, 4_000),
            (4_000, 8_000),
            (8_000, None),
        ]

    def test_empty_input(self) -> None:
        assert level_edges(pd.Series([], dtype="float64")) == ()


class TestFit:
    def test_conditional_buffers_per_bin(self) -> None:
        model = fit_buffer_model(graded_pool(), 0.9, "conditional_lodo")
        # Simple: errors 0…1 990 (n = 200), position 179.1 → 1 790 + 0.1 × 10 = 1 791.
        assert model.simple_buffer_mw == pytest.approx(1_791)
        assert [b.n for b in model.bins] == [40, 40, 39, 40, 41]
        assert not any(b.fallback for b in model.bins)
        # Bin 0: errors 0…390 (n = 40), position 35.1 → 351.
        assert model.bins[0].buffer_mw == pytest.approx(351)
        # Bin 4: errors 1 590…1 990 (n = 41), position 36 → 1 950.
        assert model.bins[4].buffer_mw == pytest.approx(1_950)
        buffers = model.buffer_for(pd.Series([1_000.0, 19_000.0]))
        assert list(buffers) == pytest.approx([351, 1_950])

    def test_simple_method_ignores_levels(self) -> None:
        model = fit_buffer_model(graded_pool(), 0.9, "simple_lodo")
        assert model.bins == ()
        assert list(model.buffer_for(pd.Series([0.0, 19_000.0]))) == pytest.approx([1_791] * 2)

    def test_small_bins_fall_back_to_the_simple_buffer(self, epex_pool: pd.DataFrame) -> None:
        # Training for D1 = D2 + D3 (48 hours). Edges (10 100, 10 200) → bins of 20, 20 and 8
        # hours, all below 30 → every bin uses the simple buffer. Errors: 24 × 100, 24 × 0;
        # position 0.9 × 47 = 42.3 → between two 100s → 100.
        model = lodo_buffer_model(epex_pool, D1, 0.9)
        assert [b.n for b in model.bins] == [20, 20, 8]
        assert all(b.n < MIN_BIN_N and b.fallback for b in model.bins)
        assert {b.buffer_mw for b in model.bins} == {100.0}

    def test_empty_training_pool_is_an_error(self) -> None:
        with pytest.raises(ValueError, match="empty"):
            fit_buffer_model(graded_pool().iloc[:0], 0.9)


class TestLodo:
    def test_hand_computed_buffers_per_day(self, epex_pool: pd.DataFrame) -> None:
        # D1: train D2 + D3 → 100 (see above). D2: train D1 (200) + D3 (0) → 200.
        # D3: train D1 (200) + D2 (100) → 200.
        assert lodo_buffer_model(epex_pool, D1, 0.9).simple_buffer_mw == 100
        assert lodo_buffer_model(epex_pool, D2, 0.9).simple_buffer_mw == 200
        assert lodo_buffer_model(epex_pool, D3, 0.9).simple_buffer_mw == 200

    def test_a_days_own_actuals_never_change_its_buffer(
        self, forecasts: pd.DataFrame, actuals: pd.DataFrame
    ) -> None:
        before = decision_pool(forecasts, actuals, DAYS, EPEX)
        changed = actuals.copy()
        on_d1 = changed["target_time"].dt.date == D1
        changed.loc[on_d1, "actual_mw"] -= 5_000  # D1 now has huge shortfalls
        after = decision_pool(forecasts, changed, DAYS, EPEX)

        for method in ("simple_lodo", "conditional_lodo"):
            assert lodo_buffer_model(after, D1, 0.9, method) == lodo_buffer_model(
                before, D1, 0.9, method
            )
        # …while other days' buffers do learn from D1.
        assert lodo_buffer_model(after, D2, 0.9).simple_buffer_mw > 200


class TestFirmWind:
    def test_never_negative_never_above_forecast_and_gaps_stay_gaps(self) -> None:
        model = fit_buffer_model(pd.DataFrame({"forecast_mw": [0.0], "error_mw": [100.0]}), 0.9)
        firm = firm_wind(pd.Series([0.0, 50.0, 500.0, np.nan]), model)
        assert list(firm[:3]) == [0.0, 0.0, 400.0]  # max(f − 100, 0)
        assert np.isnan(firm.iloc[3])

    @pytest.mark.parametrize("confidence", [0.8, 0.9, 0.95])
    def test_bounds_hold_on_a_realistic_pool(self, confidence: float) -> None:
        rng = np.random.default_rng(7)
        f = rng.uniform(0, 20_000, 500)
        pool = pd.DataFrame({"forecast_mw": f, "error_mw": rng.normal(500, 1_500, 500)})
        firm = firm_wind(pd.Series(f), fit_buffer_model(pool, confidence))
        assert (firm >= 0).all()
        assert (firm <= f + 1e-9).all()


class TestCalibration:
    def test_hand_computed_achieved_coverage(self, epex_pool: pd.DataFrame) -> None:
        # Firm = forecast − buffer; actual = forecast − error.
        # D1: buffer 100 < error 200 → actual below firm every hour → 0 of 24 kept.
        # D2: buffer 200 ≥ error 100 → kept 24; D3: buffer 200 ≥ error 0 → kept 24.
        cal = calibrate(epex_pool, 0.9)
        assert cal.hours.groupby("delivery_date")["kept"].sum().to_dict() == {D1: 0, D2: 24, D3: 24}
        assert cal.achieved_pct == pytest.approx(100 * 48 / 72)
        assert cal.target_pct == 90
        assert list(cal.hours.columns) == [
            "delivery_date",
            "target_time",
            "forecast_mw",
            "actual_mw",
            "buffer_mw",
            "firm_mw",
            "kept",
        ]

    def test_empty_pool(self, epex_pool: pd.DataFrame) -> None:
        cal = calibrate(epex_pool.iloc[:0], 0.9)
        assert cal.hours.empty
        assert cal.achieved_pct is None
