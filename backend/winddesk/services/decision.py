"""``/api/decision``: one delivery day on the Decision Desk (DATA §5.2–5.10, §5.13, PRD F1)."""

from datetime import date, time
from functools import lru_cache
from typing import Literal

from ..analytics.decision import decision_day
from ..analytics.narrative import decision_summary
from ..api import schemas
from ..store import DataStore
from .convert import num, when


@lru_cache(maxsize=256)
def decision(
    store: DataStore,
    delivery_date: date,
    auction: Literal["epex", "n2ex", "custom"],
    cutoff_local: time,
    confidence: float,
) -> schemas.DecisionResponse:
    day = decision_day(
        store.forecasts,
        store.actuals,
        store.pool_for_cutoff(cutoff_local),
        delivery_date,
        auction=auction,
        cutoff_local=cutoff_local,
        confidence=confidence,
    )
    run, k, model = day.run, day.kpis, day.buffers
    return schemas.DecisionResponse(
        delivery_date=delivery_date,
        cutoff=schemas.Cutoff(
            local=f"{cutoff_local:%H:%M}", utc=day.cutoff_utc.to_pydatetime(), auction=auction
        ),
        run=schemas.DecisionRunInfo(
            publish_time=when(run.publish_time),
            lead_min_h=run.lead_min_h,
            lead_max_h=run.lead_max_h,
            partial=run.partial,
            missing_hours=[t.to_pydatetime() for t in run.missing_hours],
        ),
        forecast=[
            schemas.DecisionForecastPoint(
                t=r.target_time, mw=num(r.forecast_mw), firm_mw=num(r.firm_mw), lead_h=num(r.lead_h)
            )
            for r in day.points.itertuples(index=False)
        ],
        actual=[
            schemas.TimeValue(t=r.target_time, mw=num(r.actual_mw))
            for r in day.actual.itertuples(index=False)
        ],
        kpis=schemas.DecisionKpis(
            forecast_mwh=k.forecast_mwh,
            actual_mwh=k.actual_mwh,
            energy_error_pct=k.energy_error_pct,
            avg_firm_mw=k.avg_firm_mw,
            avg_buffer_mw=k.avg_buffer_mw,
            mae_mw=k.mae_mw,
            bias_mw=k.bias_mw,
            max_shortfall_mw=k.max_shortfall_mw,
            max_shortfall_at=when(k.max_shortfall_at),
            firm_hours_kept=k.firm_hours_kept,
            firm_hours_total=k.firm_hours_total,
        ),
        buffers=schemas.Buffers(
            method=model.method,
            confidence=model.confidence,
            simple_buffer_mw=model.simple_buffer_mw,
            bins=[
                schemas.BufferBin(
                    forecast_from_mw=b.level.forecast_from_mw,
                    forecast_to_mw=b.level.forecast_to_mw,
                    buffer_mw=b.buffer_mw,
                    n=b.n,
                    fallback=b.fallback,
                )
                for b in model.bins
            ],
        ),
        vintages=[
            schemas.Vintage(
                publish_time=v.publish_time.to_pydatetime(),
                is_decision_run=v.is_decision_run,
                after_cutoff=v.after_cutoff,
                points=[
                    schemas.VintagePoint(t=p.target_time, mw=p.forecast_mw)
                    for p in v.points.itertuples(index=False)
                ],
            )
            for v in day.vintages
        ],
        summary=decision_summary(day),
        summary_trader=decision_summary(day, hindsight=False),
    )
