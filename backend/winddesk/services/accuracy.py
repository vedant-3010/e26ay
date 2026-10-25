"""``/api/accuracy``: the Accuracy Lab payload (DATA §5.5–5.12, PRD F3).

Two populations:
- ``decision``: the decision pairs of one auction (what the desk actually had at the cutoff).
- ``horizon``: for every delivery hour, the latest forecast at least ``horizon_h`` ahead.

The ``start``/``end`` range selects the *evaluated* delivery days. LODO buffers for the
calibration are still fitted on every other pilot day (precomputed in the store).
"""

from datetime import date
from functools import lru_cache
from typing import Literal

import pandas as pd

from ..analytics import accuracy as acc
from ..analytics.buffers import Calibration, shortfall_buffer
from ..analytics.metrics import compute_metrics
from ..analytics.narrative import TakeawayInputs, accuracy_takeaways
from ..analytics.pilot import DELIVERY_FROM, DELIVERY_TO, AuctionId
from ..analytics.selection import make_pairs, select_at_horizon
from ..analytics.timeutil import delivery_day_targets, delivery_days
from ..api import schemas
from ..store import DataStore
from .convert import metrics, num

Population = Literal["decision", "horizon"]
_SHORTFALL_COLUMN = {0.8: "p80_shortfall_mw", 0.9: "p90_shortfall_mw", 0.95: "p95_shortfall_mw"}


def horizon_pool(store: DataStore, horizon_h: float, start: date, end: date) -> pd.DataFrame:
    """Pairs for the fixed-horizon population over the delivery days ``[start, end]``."""
    targets = pd.Series([t for d in delivery_days(start, end) for t in delivery_day_targets(d)])
    return make_pairs(select_at_horizon(store.forecasts, targets, horizon_h), store.actuals)


@lru_cache(maxsize=256)
def accuracy(
    store: DataStore,
    population: Population,
    auction: AuctionId,
    horizon_h: float,
    start: date,
    end: date,
    confidence: float,
) -> schemas.AccuracyResponse:
    calibration: Calibration | None = None
    if population == "decision":
        pool = acc.in_days(store.pools[auction], start, end)
        full = store.calibrations[(auction, confidence)]
        hours = full.hours[
            (full.hours["delivery_date"] >= start) & (full.hours["delivery_date"] <= end)
        ]
        calibration = Calibration(full.confidence, full.method, hours)
        label = f"At the {store.auctions[auction].label} decision point"
    else:
        pool = horizon_pool(store, horizon_h, start, end)
        label = f"At a {horizon_h:g} h horizon"

    headline = compute_metrics(pool)
    window = acc.lead_window(pool)
    if window is not None and population == "decision":
        label += f" ({window[0]:g}–{window[1]:g} h ahead)"
    levels = acc.by_level(pool, calibration) if not pool.empty else pd.DataFrame()
    buffer_mw = shortfall_buffer(pool["error_mw"], confidence) if not pool.empty else None
    high_wind = None
    if not levels.empty and num(levels.iloc[-1][_SHORTFALL_COLUMN[confidence]]) is not None:
        top = levels.iloc[-1]
        high_wind = (float(top["forecast_from_mw"]), float(top[_SHORTFALL_COLUMN[confidence]]))

    full_range = (start, end) == (DELIVERY_FROM, DELIVERY_TO)
    lead = (
        store.lead_curves[1.0]
        if full_range
        else acc.lead_curve(acc.in_days(store.pairs_all, start, end))
    )
    dist = acc.error_distribution(pool["error_mw"])
    comparison = acc.auction_comparison(
        acc.in_days(store.pools["epex"], start, end), acc.in_days(store.pools["n2ex"], start, end)
    )
    value = acc.forecast_value(calibration) if calibration is not None else None

    return schemas.AccuracyResponse(
        params=schemas.AccuracyParams(
            population=population,
            auction=auction,
            horizon_h=horizon_h,
            start=start,
            end=end,
            confidence=confidence,
        ),
        headline=metrics(headline),
        takeaways=accuracy_takeaways(
            TakeawayInputs(label, headline, confidence, buffer_mw, high_wind)
        ),
        lead_curve=[
            schemas.LeadBin(
                lead_h=r.lead_h,
                n=r.n,
                mae_mw=num(r.mae_mw),
                rmse_mw=num(r.rmse_mw),
                bias_mw=num(r.bias_mw),
                p50_abs_mw=num(r.p50_abs_mw),
                p90_abs_mw=num(r.p90_abs_mw),
                p99_abs_mw=num(r.p99_abs_mw),
            )
            for r in lead.itertuples(index=False)
        ],
        decision_lead_window_h=list(window) if window is not None else None,
        distribution=schemas.Distribution(
            bin_edges_mw=dist.bin_edges_mw,
            counts=dist.counts,
            p10_mw=dist.p10_mw,
            p50_mw=dist.p50_mw,
            p90_mw=dist.p90_mw,
        ),
        by_hour=[
            schemas.HourStats(
                hour_uk=r.hour_uk,
                n=r.n,
                mae_mw=num(r.mae_mw),
                bias_mw=num(r.bias_mw),
                p90_shortfall_mw=num(r.p90_shortfall_mw),
            )
            for r in acc.by_hour(pool).itertuples(index=False)
        ],
        by_level=[
            schemas.LevelStats(
                forecast_from_mw=r.forecast_from_mw,
                forecast_to_mw=num(r.forecast_to_mw),
                n=r.n,
                mae_mw=num(r.mae_mw),
                bias_mw=num(r.bias_mw),
                p80_shortfall_mw=num(r.p80_shortfall_mw),
                p90_shortfall_mw=num(r.p90_shortfall_mw),
                p95_shortfall_mw=num(r.p95_shortfall_mw),
                achieved_pct=num(r.achieved_pct),
            )
            for r in levels.itertuples(index=False)
        ],
        calibration=(
            schemas.Calibration(
                target_pct=calibration.target_pct,
                achieved_pct=calibration.achieved_pct,
                method=calibration.method,
            )
            if calibration is not None
            else None
        ),
        daily=[
            schemas.DailyStats(
                delivery_date=r.delivery_date,
                mae_mw=num(r.mae_mw),
                bias_mw=num(r.bias_mw),
                max_shortfall_mw=num(r.max_shortfall_mw),
            )
            for r in acc.daily(pool).itertuples(index=False)
        ],
        worst=[
            schemas.WorstHour(
                t=r.target_time,
                delivery_date=r.delivery_date,
                forecast_mw=r.forecast_mw,
                actual_mw=r.actual_mw,
                error_mw=r.error_mw,
                publish_time=r.publish_time,
                lead_h=r.lead_h,
            )
            for r in acc.worst_hours(pool, 10).itertuples(index=False)
        ],
        auction_comparison=schemas.AuctionComparison(
            epex=metrics(comparison.epex),
            n2ex=metrics(comparison.n2ex),
            mae_change_pct=comparison.mae_change_pct,
        ),
        forecast_value=(
            schemas.ForecastValue(
                confidence=value.confidence,
                unconditional_firm_mw=value.unconditional_firm_mw,
                avg_forecast_firm_mw=value.avg_forecast_firm_mw,
                gain_mw=value.gain_mw,
            )
            if value is not None
            else None
        ),
    )
