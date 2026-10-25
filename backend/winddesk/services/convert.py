"""Conversions from analytics values (numpy/pandas) to plain Python for the response models."""

import math
from datetime import datetime
from typing import Any

import pandas as pd

from ..analytics.metrics import Metrics
from ..api import schemas


def num(value: Any) -> float | None:
    """A finite float, or ``None`` for missing values (None, NaN, NaT)."""
    if value is None or pd.isna(value):
        return None
    f = float(value)
    return f if math.isfinite(f) else None


def when(value: Any) -> datetime | None:
    """A tz-aware ``datetime``, or ``None`` for missing values."""
    if value is None or pd.isna(value):
        return None
    ts: datetime = pd.Timestamp(value).to_pydatetime()
    return ts


def metrics(m: Metrics) -> schemas.Metrics:
    return schemas.Metrics(
        n=m.n,
        mae_mw=m.mae_mw,
        rmse_mw=m.rmse_mw,
        bias_mw=m.bias_mw,
        wape_pct=m.wape_pct,
        p50_abs_mw=m.p50_abs_mw,
        p90_abs_mw=m.p90_abs_mw,
        p99_abs_mw=m.p99_abs_mw,
        p90_shortfall_mw=m.p90_shortfall_mw,
        max_shortfall_mw=m.max_shortfall_mw,
        max_shortfall_at=when(m.max_shortfall_at),
    )
