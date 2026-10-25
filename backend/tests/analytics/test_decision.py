"""One Decision Desk day on the synthetic dataset (derivations in conftest.py)."""

import pandas as pd
import pytest

from winddesk.analytics.decision import DecisionDay, decision_day, energy_mwh
from winddesk.analytics.selection import decision_pool
from winddesk.analytics.timeutil import decision_cutoff_utc

from ..conftest import D1, D2, DAYS, EPEX, utc

# Σ_h (10 000 + 10·h) over h = 0…23 = 240 000 + 10 × 276.
FORECAST_MWH = 242_760.0


def day(forecasts: pd.DataFrame, actuals: pd.DataFrame, d: object = D2) -> DecisionDay:
    pool = decision_pool(forecasts, actuals, DAYS, EPEX)
    return decision_day(
        forecasts, actuals, pool, d, auction="epex", cutoff_local=EPEX, confidence=0.9
    )


def test_energy_integration() -> None:
    assert energy_mwh(pd.Series([100.0] * 24), 1.0) == 2_400  # 24 × 1 h
    assert energy_mwh(pd.Series([100.0] * 48), 0.5) == 2_400  # 48 × 0.5 h


def test_hand_computed_day(forecasts: pd.DataFrame, actuals: pd.DataFrame) -> None:
    result = day(forecasts, actuals)
    k = result.kpis
    assert result.cutoff_utc == decision_cutoff_utc(D2, EPEX)
    assert result.run.publish_time == utc(D1, 7, 30)  # D−1 07:30
    assert (result.run.lead_min_h, result.run.lead_max_h) == (16.5, 39.5)

    # Buffer for D2 = 200 (LODO: D1 and D3 errors); firm = forecast − 200 every hour.
    assert result.buffers.simple_buffer_mw == 200
    assert (result.points["forecast_mw"] - result.points["firm_mw"]).eq(200).all()
    assert k.avg_firm_mw == pytest.approx(10_115 - 200)  # mean forecast 10 000 + 10 × 11.5
    assert k.avg_buffer_mw == pytest.approx(200)

    assert k.forecast_mwh == FORECAST_MWH
    # Actuals on D2: h:00 = 9 900 + 10h, h:30 = 10 000 + 10h → Σ 0.5 × (19 900 + 20h)
    # = Σ (9 950 + 10h) = 238 800 + 2 760.
    assert k.actual_mwh == 241_560
    assert k.energy_error_pct == pytest.approx(100 * (FORECAST_MWH - 241_560) / FORECAST_MWH)

    # Pairs use the h:00 period: error 100 every hour.
    assert (k.mae_mw, k.bias_mw, k.max_shortfall_mw) == (100, 100, 100)
    assert k.max_shortfall_at == utc(D2, 0)
    # Actual (forecast − 100) ≥ firm (forecast − 200) in every hour.
    assert (k.firm_hours_kept, k.firm_hours_total) == (24, 24)

    assert len(result.actual) == 48
    assert list(result.points.columns) == ["target_time", "forecast_mw", "firm_mw", "lead_h"]
    assert [v.is_decision_run for v in result.vintages] == [True, False, False]


def test_d1_energy(forecasts: pd.DataFrame, actuals: pd.DataFrame) -> None:
    # D1 actuals: Σ (9 850 + 10h) = 236 400 + 2 760 = 239 160 MWh. Buffer 100 < error 200 → 0 kept.
    k = day(forecasts, actuals, D1).kpis
    assert k.actual_mwh == 239_160
    assert k.firm_hours_kept == 0


def test_no_look_ahead_through_the_whole_day(
    forecasts: pd.DataFrame, actuals: pd.DataFrame
) -> None:
    before = day(forecasts, actuals)
    late = forecasts[forecasts["publish_time"] == utc(D1, 7, 30)].copy()
    late["publish_time"] = decision_cutoff_utc(D2, EPEX) + pd.Timedelta(minutes=1)
    late["forecast_mw"] = 50_000.0
    after = day(pd.concat([forecasts, late]).reset_index(drop=True), actuals)
    pd.testing.assert_frame_equal(before.points, after.points)
    assert after.kpis == before.kpis
    late_vintage = next(v for v in after.vintages if v.publish_time == late["publish_time"].iloc[0])
    assert late_vintage.after_cutoff and not late_vintage.is_decision_run


def test_partial_run_and_missing_actuals(forecasts: pd.DataFrame, actuals: pd.DataFrame) -> None:
    gappy = forecasts[
        ~((forecasts["publish_time"] == utc(D1, 7, 30)) & (forecasts["target_time"] == utc(D2, 23)))
    ]
    missing_period = actuals[actuals["target_time"] != utc(D2, 12, 30)]
    result = day(gappy, missing_period)
    assert result.run.partial
    assert result.kpis.forecast_mwh is None
    assert result.kpis.actual_mwh is None
    assert result.kpis.energy_error_pct is None
    assert pd.isna(result.points["firm_mw"].iloc[-1])  # a gap stays a gap
    assert result.kpis.firm_hours_total == 23
