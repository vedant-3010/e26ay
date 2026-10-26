"""Plain-English text built from the numbers on screen, by tested templates (DATA §5.13).

No language model is involved: every sentence below is a template with thresholds, and each
branch has a unit test.
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

import pandas as pd

from .decision import DecisionDay
from .metrics import Metrics
from .timeutil import LONDON, to_uk_label

NO_BIAS_MW = 100.0  #: |bias| below this reads as "no material bias"
IN_LINE_PCT = 1.0  #: |energy error| below this reads as "in line with the forecast"


def display_round(value: float, places: int) -> float:
    """Round like the UI does: first to the API's 1 decimal, then half away from zero.

    Python's own rounding is half-to-even, and rounding the raw value once can differ from the
    UI's two steps (2,022.47 → API 2,022.5 → "2,023 MW"). Every number written for people
    (narratives, INSIGHTS.md) goes through this so it matches what the app shows.
    """
    one_dp = Decimal(str(round(value, 1)))
    return float(one_dp.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP))


def fmt_mw(mw: float) -> str:
    return f"{display_round(mw, 0):,.0f} MW"


def fmt_gw(mw: float) -> str:
    return f"{display_round(mw / 1000, 1):,.1f} GW"


def fmt_gwh(mwh: float) -> str:
    return f"{display_round(mwh / 1000, 0):,.0f} GWh"


def fmt_pct(pct: float) -> str:
    return f"{display_round(pct, 0):.0f}%"


def _uk_time(ts: pd.Timestamp) -> str:
    return f"{ts.tz_convert(LONDON):%H:%M}"


def decision_summary(day: DecisionDay, *, hindsight: bool = True) -> str:
    """One paragraph for the Decision Desk. ``hindsight=False`` omits everything that depends
    on actuals (the Trader view must not leak the outcome)."""
    cutoff = f"{day.cutoff_local:%H:%M} on {to_uk_label(day.cutoff_utc, with_time=False)}"
    target_day = to_uk_label(pd.Timestamp(day.run.points["target_time"].iloc[0]), with_time=False)
    k, run = day.kpis, day.run
    confidence = fmt_pct(100 * day.confidence)

    if run.publish_time is None:
        return f"By {cutoff}, no forecast run covering {target_day} had been published."

    if run.partial:
        hours = len(run.points)
        covered = hours - len(run.missing_hours)
        parts = [
            f"At {cutoff}, the latest forecast (published {_uk_time(run.publish_time)}) covered "
            f"only {covered} of {hours} hours of {target_day}; the missing hours are left as gaps."
        ]
        if k.avg_firm_mw is not None:
            parts.append(
                f"Over the covered hours, at {confidence} confidence you could count on an "
                f"average of {fmt_gw(k.avg_firm_mw)}."
            )
    else:
        assert k.forecast_mwh is not None  # a complete run always has an energy total
        parts = [
            f"At {cutoff}, the latest forecast expected {fmt_gwh(k.forecast_mwh)} of wind for "
            f"{target_day}."
        ]
        if k.avg_firm_mw is not None:
            parts.append(
                f"At {confidence} confidence you could count on an average of "
                f"{fmt_gw(k.avg_firm_mw)}."
            )

    if hindsight and k.actual_mwh is not None:
        parts.append(_outcome_sentence(day))
    return " ".join(parts)


def _outcome_sentence(day: DecisionDay) -> str:
    k = day.kpis
    assert k.actual_mwh is not None
    delivered = f"Wind delivered {fmt_gwh(k.actual_mwh)}"
    pct = k.energy_error_pct
    if pct is None:
        energy = delivered
    elif abs(pct) < IN_LINE_PCT:
        energy = f"{delivered}, in line with the forecast (within {IN_LINE_PCT:.0f}%)"
    elif pct > 0:
        energy = f"{delivered}, {fmt_pct(pct)} below forecast"
    else:
        energy = f"{delivered}, {fmt_pct(-pct)} above forecast"

    if k.max_shortfall_mw and k.max_shortfall_at is not None:
        shortfall = (
            f", with the largest shortfall of {fmt_gw(k.max_shortfall_mw)} at "
            f"{_uk_time(k.max_shortfall_at)}."
        )
    else:
        shortfall = ", and never fell short of the forecast in any hour."
    held = (
        f" Firm wind held in {k.firm_hours_kept} of {k.firm_hours_total} hours."
        if k.firm_hours_total
        else ""
    )
    return energy + shortfall + held


@dataclass(frozen=True)
class TakeawayInputs:
    #: e.g. "At the day-ahead decision point (16.5–39.5 h ahead)" or "At a 24 h horizon"
    population_label: str
    headline: Metrics
    confidence: float
    buffer_mw: float | None  #: pool-wide shortfall quantile at ``confidence``
    #: (lower bound of the highest forecast-level bin, its buffer), if there is such a bin
    high_wind: tuple[float, float] | None


def accuracy_takeaways(inputs: TakeawayInputs) -> list[str]:
    """Three sentences: typical error, bias, buffer guidance (incl. the high-wind bin)."""
    m = inputs.headline
    if m.n == 0 or m.mae_mw is None or m.bias_mw is None:
        return ["There are no forecast and actual pairs for this selection."]

    typical = (
        f"{inputs.population_label}, the forecast is typically off by {fmt_mw(m.mae_mw)} "
        f"(mean absolute error)"
    )
    typical += f", {m.wape_pct:.1f}% of actual wind." if m.wape_pct is not None else "."

    bias = m.bias_mw
    if abs(bias) < NO_BIAS_MW:
        bias_text = (
            f"There is no material bias: on average the forecast is within "
            f"{fmt_mw(NO_BIAS_MW)} of actual."
        )
    elif bias > 0:
        bias_text = (
            f"The forecast tends to run high, by {fmt_mw(bias)} on average, so shortfalls are "
            f"more common than surpluses."
        )
    else:
        bias_text = (
            f"The forecast tends to run low, by {fmt_mw(-bias)} on average, so surpluses are "
            f"more common than shortfalls."
        )

    confidence = fmt_pct(100 * inputs.confidence)
    if inputs.buffer_mw is None:
        buffer_text = "There is not enough data to size a buffer."
    else:
        buffer_text = f"Holding back {fmt_mw(inputs.buffer_mw)} covers {confidence} of shortfalls"
        if inputs.high_wind is not None and inputs.high_wind[1] > inputs.buffer_mw:
            from_mw, high_buffer = inputs.high_wind
            buffer_text += (
                f"; when the forecast is above {fmt_mw(from_mw)}, hold {fmt_mw(high_buffer)}"
            )
        buffer_text += "."
    return [typical, bias_text, buffer_text]
