"""Every branch of the narrative templates (DATA §5.13, DATA §7 item 13)."""

from datetime import date

import pandas as pd
import pytest

from winddesk.analytics.decision import DecisionDay, decision_day
from winddesk.analytics.metrics import EMPTY_METRICS, Metrics
from winddesk.analytics.narrative import (
    TakeawayInputs,
    accuracy_takeaways,
    decision_summary,
    fmt_gw,
    fmt_gwh,
    fmt_mw,
)
from winddesk.analytics.selection import decision_pool

from ..conftest import D1, D2, D3, DAYS, EPEX, utc


def make_day(forecasts: pd.DataFrame, actuals: pd.DataFrame, d: date) -> DecisionDay:
    pool = decision_pool(forecasts, actuals, DAYS, EPEX)
    return decision_day(
        forecasts, actuals, pool, d, auction="epex", cutoff_local=EPEX, confidence=0.9
    )


def test_formatters() -> None:
    assert fmt_mw(1_234.4) == "1,234 MW"
    assert fmt_mw(1_234.6) == "1,235 MW"
    assert fmt_gw(13_100) == "13.1 GW"
    assert fmt_gwh(412_000) == "412 GWh"


class TestDecisionSummary:
    def test_full_day_in_line_with_forecast(
        self, forecasts: pd.DataFrame, actuals: pd.DataFrame
    ) -> None:
        # D2: forecast 242 760 MWh, actual 241 560 MWh → 0.49% → "in line"; shortfall 100 MW at
        # 00:00; firm held 24/24; avg firm 9 915 MW → 9.9 GW.
        text = decision_summary(make_day(forecasts, actuals, D2))
        assert text == (
            "At 09:20 on Fri 2 Jan, the latest forecast expected 243 GWh of wind for Sat 3 Jan. "
            "At 90% confidence you could count on an average of 9.9 GW. "
            "Wind delivered 242 GWh, in line with the forecast (within 1%), with the largest "
            "shortfall of 0.1 GW at 00:00. Firm wind held in 24 of 24 hours."
        )

    def test_trader_view_never_mentions_the_outcome(
        self, forecasts: pd.DataFrame, actuals: pd.DataFrame
    ) -> None:
        text = decision_summary(make_day(forecasts, actuals, D2), hindsight=False)
        assert "delivered" not in text and "held" not in text
        assert text.endswith("average of 9.9 GW.")

    def test_below_forecast(self, forecasts: pd.DataFrame, actuals: pd.DataFrame) -> None:
        low = actuals.assign(actual_mw=actuals["actual_mw"] - 2_000)
        text = decision_summary(make_day(forecasts, low, D2))
        # Actual 241 560 − 48 × 0.5 × 2 000 = 193 560 MWh → (242 760 − 193 560) / 242 760 = 20%.
        assert "Wind delivered 194 GWh, 20% below forecast" in text

    def test_above_forecast_and_no_shortfall(
        self, forecasts: pd.DataFrame, actuals: pd.DataFrame
    ) -> None:
        high = actuals.assign(actual_mw=actuals["actual_mw"] + 2_000)
        text = decision_summary(make_day(forecasts, high, D3))
        assert "above forecast" in text
        assert "never fell short of the forecast in any hour" in text

    def test_partial_day(self, forecasts: pd.DataFrame, actuals: pd.DataFrame) -> None:
        gappy = forecasts[
            ~(
                (forecasts["publish_time"] == utc(D1, 7, 30))
                & forecasts["target_time"].isin([utc(D2, 22), utc(D2, 23)])
            )
        ]
        text = decision_summary(make_day(gappy, actuals, D2))
        assert "covered only 22 of 24 hours of Sat 3 Jan" in text
        assert "published 07:30" in text
        assert "Over the covered hours" in text
        assert "GWh of wind for" not in text  # no daily total for a partial day

    def test_no_run_published_yet(self, forecasts: pd.DataFrame, actuals: pd.DataFrame) -> None:
        only_late = forecasts[forecasts["publish_time"] > utc(D1, 12, 0)]
        result = make_day(only_late, actuals, D2)
        assert decision_summary(result) == (
            "By 09:20 on Fri 2 Jan, no forecast run covering Sat 3 Jan had been published."
        )


def metrics(bias: float, n: int = 744) -> Metrics:
    return Metrics(n, 1_234.4, 1_650.0, bias, 9.84, 950.0, 2_600.0, 4_300.0, 2_100.0, 5_200.0, None)


def takeaways(bias: float, high_wind: tuple[float, float] | None = None) -> list[str]:
    return accuracy_takeaways(
        TakeawayInputs(
            population_label="At the day-ahead decision point (16.5–39.5 h ahead)",
            headline=metrics(bias),
            confidence=0.9,
            buffer_mw=2_100.0,
            high_wind=high_wind,
        )
    )


class TestAccuracyTakeaways:
    def test_typical_error_sentence(self) -> None:
        assert takeaways(0)[0] == (
            "At the day-ahead decision point (16.5–39.5 h ahead), the forecast is typically off "
            "by 1,234 MW (mean absolute error), 9.8% of actual wind."
        )

    @pytest.mark.parametrize(
        ("bias", "expected"),
        [
            (99.0, "There is no material bias"),
            (-99.0, "There is no material bias"),
            (210.0, "The forecast tends to run high, by 210 MW on average, so shortfalls"),
            (-150.0, "The forecast tends to run low, by 150 MW on average, so surpluses"),
        ],
    )
    def test_bias_branches(self, bias: float, expected: str) -> None:
        assert takeaways(bias)[1].startswith(expected)

    def test_buffer_guidance_with_high_wind_bin(self) -> None:
        assert takeaways(0, high_wind=(18_100.0, 5_400.0))[2] == (
            "Holding back 2,100 MW covers 90% of shortfalls; when the forecast is above "
            "18,100 MW, hold 5,400 MW."
        )

    def test_high_wind_clause_only_when_it_needs_more(self) -> None:
        assert takeaways(0, high_wind=(18_100.0, 1_000.0))[2] == (
            "Holding back 2,100 MW covers 90% of shortfalls."
        )

    def test_no_buffer(self) -> None:
        text = accuracy_takeaways(TakeawayInputs("At a 24 h horizon", metrics(0), 0.9, None, None))
        assert text[2] == "There is not enough data to size a buffer."

    def test_empty_selection(self) -> None:
        text = accuracy_takeaways(TakeawayInputs("At a 24 h horizon", EMPTY_METRICS, 0.9, 1, None))
        assert text == ["There are no forecast and actual pairs for this selection."]

    def test_missing_wape(self) -> None:
        m = Metrics(10, 100.0, 1.0, 0.0, None, 1.0, 1.0, 1.0, 1.0, 1.0, None)
        text = accuracy_takeaways(TakeawayInputs("At a 24 h horizon", m, 0.9, 1.0, None))
        assert text[0].endswith("(mean absolute error).")
