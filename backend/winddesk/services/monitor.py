"""``/api/monitor``: actual vs forecast at a fixed horizon (DATA §5.1, PRD F2)."""

from datetime import datetime
from functools import lru_cache

import pandas as pd

from ..analytics.metrics import compute_metrics
from ..analytics.selection import coverage, hourly_targets, make_pairs, select_at_horizon
from ..api import schemas
from ..store import DataStore
from .convert import metrics, num, when


@lru_cache(maxsize=256)
def monitor(
    store: DataStore, start: datetime, end: datetime, horizon_h: float
) -> schemas.MonitorResponse:
    """``start``/``end`` are tz-aware UTC; the window is ``[start, end)``."""
    t0, t1 = pd.Timestamp(start).as_unit("ns"), pd.Timestamp(end).as_unit("ns")
    selected = select_at_horizon(store.forecasts, hourly_targets(t0, t1), horizon_h)
    actual = store.actuals[
        (store.actuals["target_time"] >= t0) & (store.actuals["target_time"] < t1)
    ]
    cov = coverage(selected)
    return schemas.MonitorResponse(
        params=schemas.MonitorParams(start=start, end=end, horizon_h=horizon_h),
        actual=[
            schemas.TimeValue(t=r.target_time, mw=num(r.actual_mw))
            for r in actual.itertuples(index=False)
        ],
        forecast=[
            schemas.MonitorForecastPoint(
                t=r.target_time,
                mw=num(r.forecast_mw),
                publish_time=when(r.publish_time),
                lead_h=num(r.lead_h),
            )
            for r in selected.itertuples(index=False)
        ],
        metrics=metrics(compute_metrics(make_pairs(selected, store.actuals))),
        coverage=schemas.Coverage(
            target_hours=cov.target_hours, with_forecast=cov.with_forecast, pct=cov.pct
        ),
    )
