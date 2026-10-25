"""One delivery day on the Decision Desk (DATA §5.3, §5.7, §5.9, §5.10).

Everything shown as "what you knew" comes from the decision run (published ≤ cutoff) and from
buffers fitted on *other* days. Actuals are attached for the hindsight view only.
"""

from dataclasses import dataclass
from datetime import date, time

import numpy as np
import pandas as pd

from .buffers import BufferModel, Method, firm_wind, lodo_buffer_model
from .metrics import compute_metrics
from .selection import (
    DecisionRun,
    Vintage,
    make_pairs,
    select_decision_run,
    vintages_for_day,
)
from .timeutil import decision_cutoff_utc, delivery_day_targets


def energy_mwh(power_mw: pd.Series, step_h: float) -> float:
    """Energy of a power series sampled every ``step_h`` hours, each value an average over its
    interval: Σ power × step (24 × 1 h for hourly forecasts, 48 × 0.5 h for actuals)."""
    return float(power_mw.sum()) * step_h


@dataclass(frozen=True)
class DecisionKpis:
    forecast_mwh: float | None  #: null if the decision run is partial
    actual_mwh: float | None  #: null if any settlement period is missing
    #: 100 × (forecast − actual) / forecast energy; positive = wind fell short of the forecast.
    energy_error_pct: float | None
    avg_firm_mw: float | None
    avg_buffer_mw: float | None  #: mean of (forecast − firm)
    mae_mw: float | None
    bias_mw: float | None
    max_shortfall_mw: float | None
    max_shortfall_at: pd.Timestamp | None
    firm_hours_kept: int  #: hours where actual ≥ firm
    firm_hours_total: int  #: hours with both a firm value and an actual


@dataclass(frozen=True)
class DecisionDay:
    delivery_date: date
    auction: str
    cutoff_local: time
    cutoff_utc: pd.Timestamp
    confidence: float
    run: DecisionRun
    #: One row per hour: target_time, forecast_mw, firm_mw, lead_h (null where the run has a gap).
    points: pd.DataFrame
    #: One row per settlement period of the day: target_time, actual_mw.
    actual: pd.DataFrame
    kpis: DecisionKpis
    buffers: BufferModel
    vintages: list[Vintage]


def decision_day(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    pool: pd.DataFrame,
    delivery_date: date,
    *,
    auction: str,
    cutoff_local: time,
    confidence: float,
    method: Method = "conditional_lodo",
) -> DecisionDay:
    """Assemble the Decision Desk result for one day.

    ``pool`` is the decision population for the *same* cutoff (all in-scope days); the buffer is
    fitted on its other days only (LODO).
    """
    cutoff_utc = decision_cutoff_utc(delivery_date, cutoff_local)
    run = select_decision_run(forecasts, delivery_date, cutoff_utc)
    model = lodo_buffer_model(pool, delivery_date, confidence, method)

    points = run.points.copy()
    points["firm_mw"] = firm_wind(points["forecast_mw"], model)
    points = points[["target_time", "forecast_mw", "firm_mw", "lead_h"]]

    half_hours = pd.DataFrame({"target_time": delivery_day_targets(delivery_date, freq="30min")})
    actual = half_hours.merge(actuals[["target_time", "actual_mw"]], on="target_time", how="left")

    day_pairs = make_pairs(points.assign(publish_time=run.publish_time), actuals)
    day_pairs = day_pairs.merge(points[["target_time", "firm_mw"]], on="target_time")
    m = compute_metrics(day_pairs)

    forecast_mwh = None if run.partial else energy_mwh(points["forecast_mw"], 1.0)
    actual_mwh = None if actual["actual_mw"].isna().any() else energy_mwh(actual["actual_mw"], 0.5)
    energy_error_pct = None
    if forecast_mwh and actual_mwh is not None:
        energy_error_pct = 100 * (forecast_mwh - actual_mwh) / forecast_mwh

    has_firm = points["firm_mw"].notna()
    kpis = DecisionKpis(
        forecast_mwh=forecast_mwh,
        actual_mwh=actual_mwh,
        energy_error_pct=energy_error_pct,
        avg_firm_mw=float(points.loc[has_firm, "firm_mw"].mean()) if has_firm.any() else None,
        avg_buffer_mw=(
            float((points["forecast_mw"] - points["firm_mw"])[has_firm].mean())
            if has_firm.any()
            else None
        ),
        mae_mw=m.mae_mw,
        bias_mw=m.bias_mw,
        max_shortfall_mw=m.max_shortfall_mw,
        max_shortfall_at=m.max_shortfall_at,
        firm_hours_kept=int(np.sum(day_pairs["actual_mw"] >= day_pairs["firm_mw"])),
        firm_hours_total=len(day_pairs),
    )
    return DecisionDay(
        delivery_date=delivery_date,
        auction=auction,
        cutoff_local=cutoff_local,
        cutoff_utc=cutoff_utc,
        confidence=confidence,
        run=run,
        points=points,
        actual=actual,
        kpis=kpis,
        buffers=model,
        vintages=vintages_for_day(forecasts, delivery_date, cutoff_utc, run.publish_time),
    )
