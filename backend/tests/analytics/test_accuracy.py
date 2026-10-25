"""Accuracy Lab statistics on the synthetic dataset (see conftest.py for the derivations)."""

import numpy as np
import pandas as pd
import pytest

from winddesk.analytics.accuracy import (
    auction_comparison,
    by_hour,
    by_level,
    daily,
    error_distribution,
    forecast_value,
    in_days,
    lead_curve,
    lead_window,
    worst_hours,
)
from winddesk.analytics.buffers import calibrate
from winddesk.analytics.selection import make_pairs

from ..conftest import D1, D2, D3, utc


@pytest.fixture
def pairs_all(forecasts: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    return make_pairs(forecasts, actuals)


class TestLeadCurve:
    def test_counts_per_one_hour_bin(self, pairs_all: pd.DataFrame) -> None:
        # Leads: 11:30 run → 12.5 + h, 09:30 → 14.5 + h, 07:30 → 16.5 + h (h = 0…23), × 3 days.
        # A lead L gets 3 pairs per run that reaches it: L = 12.5, 13.5 → 1 run; 14.5, 15.5 → 2;
        # 16.5 … 35.5 → 3; 36.5, 37.5 → 2; 38.5, 39.5 → 1. Total 216.
        curve = lead_curve(pairs_all)
        n = dict(zip(curve["lead_h"], curve["n"], strict=True))
        assert n[12.5] == n[13.5] == 3
        assert n[14.5] == n[15.5] == 6
        assert all(n[16.5 + k] == 9 for k in range(20))
        assert n[36.5] == n[37.5] == 6
        assert n[38.5] == n[39.5] == 3
        assert sum(n.values()) == 216
        assert list(curve["lead_h"]) == [12.5 + k for k in range(28)]

    def test_bin_metrics(self, pairs_all: pd.DataFrame) -> None:
        # Lead 12.5 = the 11:30 run at h = 0:
        # error = 12 000 − (9 800 + 100·i) = 2 200, 2 100, 2 000.
        row = lead_curve(pairs_all).iloc[0]
        assert (row["lead_from_h"], row["lead_to_h"]) == (12.0, 13.0)
        assert row["mae_mw"] == pytest.approx(2_100)
        assert row["bias_mw"] == pytest.approx(2_100)

    def test_three_hour_bins(self, pairs_all: pd.DataFrame) -> None:
        curve = lead_curve(pairs_all, bin_h=3.0)
        n = dict(zip(curve["lead_from_h"], curve["n"], strict=True))
        assert n[12.0] == 3 + 3 + 6  # 12.5, 13.5, 14.5
        assert n[36.0] == 6 + 6 + 3  # 36.5, 37.5, 38.5
        assert n[39.0] == 3  # 39.5
        assert curve.iloc[0]["lead_h"] == 13.5  # bin midpoint

    def test_off_grid_leads_fall_in_the_floor_bin_and_48h_is_excluded(self) -> None:
        df = pd.DataFrame(
            {
                "lead_h": [12.5, 12.0 + 35 / 60, 47.9, 48.0],
                "error_mw": [10.0, 30.0, 5.0, 999.0],
                "actual_mw": [1.0, 1.0, 1.0, 1.0],
                "target_time": [utc(D1, h) for h in range(4)],
            }
        )
        curve = lead_curve(df)
        assert list(curve["lead_h"]) == [12.5, 47.5]
        assert list(curve["n"]) == [2, 1]
        assert curve.iloc[0]["mae_mw"] == 20.0


class TestDistribution:
    def test_fixed_250_mw_bins_and_percentiles(self) -> None:
        # Edges from floor(−260/250)·250 = −500 to ceil(260/250)·250 = 500.
        d = error_distribution(pd.Series([-260.0, -10.0, 0.0, 240.0, 260.0]))
        assert d.bin_edges_mw == [-500, -250, 0, 250, 500]
        assert d.counts == [1, 1, 2, 1]
        # Sorted [−260, −10, 0, 240, 260]: P10 at position 0.4 → −260 + 0.4 × 250 = −160;
        # P90 at 3.6 → 240 + 0.6 × 20 = 252.
        assert d.p10_mw == pytest.approx(-160)
        assert d.p50_mw == 0
        assert d.p90_mw == pytest.approx(252)

    def test_constant_errors_still_get_one_bin(self) -> None:
        d = error_distribution(pd.Series([0.0, 0.0]))
        assert d.bin_edges_mw == [0, 250]
        assert d.counts == [2]

    def test_empty(self) -> None:
        d = error_distribution(pd.Series([], dtype="float64"))
        assert d.counts == [] and d.p50_mw is None


class TestSlices:
    def test_by_hour(self, epex_pool: pd.DataFrame) -> None:
        # Every hour has errors 200, 100, 0 (D1–D3): MAE 100, bias 100,
        # P90 shortfall at position 1.8 of [0, 100, 200] → 180.
        hours = by_hour(epex_pool)
        assert list(hours["hour_uk"]) == list(range(24))
        assert set(hours["n"]) == {3}
        assert hours.iloc[0][["mae_mw", "bias_mw", "p90_shortfall_mw"]].tolist() == pytest.approx(
            [100, 100, 180]
        )

    def test_by_level_with_calibration(self, epex_pool: pd.DataFrame) -> None:
        # Pool forecasts are 10 000 + 10·h for each day → edges (10 100, 10 200) → bins of
        # h 0–9, 10–19, 20–23 (× 3 days = 30, 30, 12). Firm wind held on D2 and D3 only → 2/3.
        levels = by_level(epex_pool, calibrate(epex_pool, 0.9))
        assert list(levels["n"]) == [30, 30, 12]
        assert list(levels["forecast_from_mw"]) == [0.0, 10_100, 10_200]
        assert levels["forecast_to_mw"].tolist()[:2] == [10_100, 10_200]
        assert pd.isna(levels["forecast_to_mw"].iloc[2])
        assert levels["mae_mw"].tolist() == pytest.approx([100, 100, 100])
        assert levels["achieved_pct"].tolist() == pytest.approx([100 * 2 / 3] * 3)
        # P90 of 10×200, 10×100, 10×0 (n = 30): position 26.1 → 200.
        assert levels["p90_shortfall_mw"].iloc[0] == pytest.approx(200)

    def test_by_level_without_calibration(self, epex_pool: pd.DataFrame) -> None:
        assert by_level(epex_pool)["achieved_pct"].isna().all()

    def test_daily(self, epex_pool: pd.DataFrame) -> None:
        days = daily(epex_pool)
        assert list(days["delivery_date"]) == [D1, D2, D3]
        assert days["mae_mw"].tolist() == [200, 100, 0]
        assert days["max_shortfall_mw"].tolist() == [200, 100, 0]

    def test_worst_hours_break_ties_by_time(self, epex_pool: pd.DataFrame) -> None:
        worst = worst_hours(epex_pool, n=2)
        assert list(worst["target_time"]) == [utc(D1, 0), utc(D1, 1)]
        assert list(worst["error_mw"]) == [200, 200]
        assert list(worst.columns) == [
            "target_time",
            "delivery_date",
            "forecast_mw",
            "actual_mw",
            "error_mw",
            "publish_time",
            "lead_h",
        ]

    def test_in_days(self, epex_pool: pd.DataFrame) -> None:
        assert set(in_days(epex_pool, D2, D3)["delivery_date"]) == {D2, D3}


class TestComparisonAndValue:
    def test_auction_comparison(self, epex_pool: pd.DataFrame, n2ex_pool: pd.DataFrame) -> None:
        # EPEX MAE = (200 + 100 + 0) / 3 = 100; N2EX = (1 200 + 1 100 + 1 000) / 3 = 1 100.
        cmp = auction_comparison(epex_pool, n2ex_pool)
        assert cmp.epex.mae_mw == pytest.approx(100)
        assert cmp.n2ex.mae_mw == pytest.approx(1_100)
        assert cmp.mae_change_pct == pytest.approx(1_000)  # 100 × (1 100 − 100) / 100

    def test_auction_comparison_without_epex_error(self, epex_pool: pd.DataFrame) -> None:
        perfect = epex_pool.assign(error_mw=0.0)
        assert auction_comparison(perfect, epex_pool).mae_change_pct is None

    def test_forecast_value(self, epex_pool: pd.DataFrame) -> None:
        # Without a forecast: P10 of the 72 actual values 9 800 + 10·h + 100·i. The 8 smallest
        # are 9 800…9 870 (D1, h 0–7), the 9th 9 880; position 0.1 × 71 = 7.1 → 9 871.
        # With it: mean firm = mean forecast (10 115) − buffer: D1 100, D2 200, D3 200.
        value = forecast_value(calibrate(epex_pool, 0.9))
        assert value.unconditional_firm_mw == pytest.approx(9_871)
        assert value.avg_forecast_firm_mw == pytest.approx((10_015 + 9_915 + 9_915) / 3)
        assert value.gain_mw == pytest.approx((10_015 + 9_915 + 9_915) / 3 - 9_871)

    def test_forecast_value_of_nothing(self, epex_pool: pd.DataFrame) -> None:
        value = forecast_value(calibrate(epex_pool.iloc[:0], 0.9))
        assert value.gain_mw is None

    def test_lead_window(self, epex_pool: pd.DataFrame, n2ex_pool: pd.DataFrame) -> None:
        assert lead_window(epex_pool) == (16.5, 39.5)
        assert lead_window(n2ex_pool) == (14.5, 37.5)
        assert lead_window(epex_pool.iloc[:0]) is None


def test_error_sign_is_forecast_minus_actual(pairs_all: pd.DataFrame) -> None:
    expected = pairs_all["forecast_mw"] - pairs_all["actual_mw"]
    assert np.array_equal(pairs_all["error_mw"].to_numpy(), expected.to_numpy())
