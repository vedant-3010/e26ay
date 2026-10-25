"""Error metrics on any set of pairs (DATA §5.5).

``e = forecast_mw − actual_mw``: positive means over-forecast, i.e. a wind shortfall. Quantiles
use ``numpy.quantile(..., method="linear")``. Values are unrounded; rounding happens only at the
API boundary.
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Metrics:
    n: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None  #: mean error; positive = over-forecast
    wape_pct: float | None  #: 100 × Σ|e| / Σ actual
    p50_abs_mw: float | None
    p90_abs_mw: float | None
    p99_abs_mw: float | None
    p90_shortfall_mw: float | None  #: max(quantile₀.₉(e), 0)
    max_shortfall_mw: float | None  #: max(max(e), 0)
    max_shortfall_at: pd.Timestamp | None  #: target time of the largest shortfall, if any


EMPTY_METRICS = Metrics(0, None, None, None, None, None, None, None, None, None, None)


def quantile(values: pd.Series | np.ndarray, q: float) -> float:
    return float(np.quantile(np.asarray(values, dtype="float64"), q, method="linear"))


def compute_metrics(pairs: pd.DataFrame) -> Metrics:
    """Metrics over rows that have both a forecast and an actual.

    ``pairs`` needs error_mw, actual_mw and target_time. Returns all-null metrics when n = 0.
    """
    valid = pairs.dropna(subset=["error_mw", "actual_mw"]).sort_values("target_time")
    n = len(valid)
    if n == 0:
        return EMPTY_METRICS
    e = valid["error_mw"].to_numpy(dtype="float64")
    abs_e = np.abs(e)
    actual_total = float(valid["actual_mw"].sum())

    max_e = float(e.max())
    max_at = (
        pd.Timestamp(valid["target_time"].iloc[int(np.argmax(e))]) if max_e > 0 else None
    )  # argmax returns the earliest of tied maxima (rows are sorted by time)
    return Metrics(
        n=n,
        mae_mw=float(abs_e.mean()),
        rmse_mw=float(np.sqrt(np.mean(e**2))),
        bias_mw=float(e.mean()),
        wape_pct=100 * float(abs_e.sum()) / actual_total if actual_total > 0 else None,
        p50_abs_mw=quantile(abs_e, 0.5),
        p90_abs_mw=quantile(abs_e, 0.9),
        p99_abs_mw=quantile(abs_e, 0.99),
        p90_shortfall_mw=max(quantile(e, 0.9), 0.0),
        max_shortfall_mw=max(max_e, 0.0),
        max_shortfall_at=max_at,
    )
