"""Buffers, firm wind and calibration (DATA §5.7–5.8), always leave-one-day-out (LODO).

- Buffer at confidence c: the c-quantile of over-forecast error (``forecast − actual``) in the
  training pool, clamped at 0. Firm wind = ``max(forecast − buffer, 0)``, so firm wind is never
  above the forecast and never negative.
- Simple: one buffer for every hour. Conditional: one buffer per forecast-level bin (quintiles of
  the training forecasts); a bin with fewer than 30 training hours falls back to the simple buffer.
- LODO: the buffer used on day D is fitted on every other day, so D's own outcome can never
  inform D's buffer.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Literal

import numpy as np
import pandas as pd

from .metrics import quantile

Method = Literal["simple_lodo", "conditional_lodo"]

MIN_BIN_N = 30
LEVEL_QUANTILES = (0.2, 0.4, 0.6, 0.8)  # quintiles → up to 5 bins


def shortfall_buffer(errors: pd.Series | np.ndarray, confidence: float) -> float:
    """``max(quantile_c(error), 0)``: the over-forecast covered in a fraction c of hours."""
    return max(quantile(errors, confidence), 0.0)


def level_edges(forecast_mw: pd.Series) -> tuple[float, ...]:
    """Inner edges between forecast-level bins: quintiles rounded to 100 MW, de-duplicated.

    Edges at or below the minimum, or above the maximum, are dropped so that no bin is empty.
    """
    values = forecast_mw.dropna().to_numpy(dtype="float64")
    if values.size == 0:
        return ()
    rounded = sorted({float(np.round(q, -2)) for q in np.quantile(values, LEVEL_QUANTILES)})
    lo, hi = float(values.min()), float(values.max())
    return tuple(e for e in rounded if lo < e <= hi)


def level_bin(forecast_mw: pd.Series, edges: Sequence[float]) -> np.ndarray:
    """Bin index per value: bin i is ``[edges[i−1], edges[i])``; the first bin is open below and
    the last open above."""
    return np.searchsorted(np.asarray(edges, dtype="float64"), forecast_mw.to_numpy(), side="right")


@dataclass(frozen=True)
class LevelBin:
    index: int
    forecast_from_mw: float  #: 0 for the first bin (wind forecasts are never negative)
    forecast_to_mw: float | None  #: None = open-ended (last bin)


def level_bins(edges: Sequence[float]) -> list[LevelBin]:
    bounds: list[float | None] = [0.0, *edges, None]
    return [LevelBin(i, float(bounds[i] or 0.0), bounds[i + 1]) for i in range(len(edges) + 1)]


@dataclass(frozen=True)
class BufferBin:
    level: LevelBin
    n: int  #: training hours in the bin
    buffer_mw: float
    fallback: bool  #: True when n < 30 and the simple buffer is used instead


@dataclass(frozen=True)
class BufferModel:
    method: Method
    confidence: float
    simple_buffer_mw: float
    edges: tuple[float, ...]
    bins: tuple[BufferBin, ...]

    def buffer_for(self, forecast_mw: pd.Series) -> pd.Series:
        """Buffer (MW) for each forecast value."""
        if self.method == "simple_lodo" or not self.bins:
            return pd.Series(self.simple_buffer_mw, index=forecast_mw.index, dtype="float64")
        per_bin = np.array([b.buffer_mw for b in self.bins], dtype="float64")
        return pd.Series(per_bin[level_bin(forecast_mw, self.edges)], index=forecast_mw.index)


def fit_buffer_model(
    train: pd.DataFrame, confidence: float, method: Method = "conditional_lodo"
) -> BufferModel:
    """Fit buffers on ``train`` (pairs with forecast_mw and error_mw)."""
    if train.empty:
        raise ValueError("cannot fit a buffer on an empty training pool")
    simple = shortfall_buffer(train["error_mw"], confidence)
    if method == "simple_lodo":
        return BufferModel(method, confidence, simple, (), ())

    edges = level_edges(train["forecast_mw"])
    idx = level_bin(train["forecast_mw"], edges)
    bins = []
    for level in level_bins(edges):
        errors = train["error_mw"].to_numpy()[idx == level.index]
        fallback = len(errors) < MIN_BIN_N
        buffer = simple if fallback else shortfall_buffer(errors, confidence)
        bins.append(BufferBin(level, len(errors), buffer, fallback))
    return BufferModel(method, confidence, simple, edges, tuple(bins))


def lodo_buffer_model(
    pool: pd.DataFrame, delivery_date: date, confidence: float, method: Method = "conditional_lodo"
) -> BufferModel:
    """Buffers for ``delivery_date``, fitted on every *other* day of the pool."""
    return fit_buffer_model(pool[pool["delivery_date"] != delivery_date], confidence, method)


def firm_wind(forecast_mw: pd.Series, model: BufferModel) -> pd.Series:
    """``max(forecast − buffer, 0)``. A missing forecast stays missing (gaps stay gaps)."""
    return (forecast_mw - model.buffer_for(forecast_mw)).clip(lower=0.0)


@dataclass(frozen=True)
class Calibration:
    """LODO backtest of the firm-wind band over a decision pool (§5.8)."""

    confidence: float
    method: Method
    #: One row per decision hour: delivery_date, target_time, forecast_mw, actual_mw,
    #: buffer_mw, firm_mw, kept (actual ≥ firm).
    hours: pd.DataFrame

    @property
    def target_pct(self) -> float:
        return 100 * self.confidence

    @property
    def achieved_pct(self) -> float | None:
        return 100 * float(self.hours["kept"].mean()) if not self.hours.empty else None


def calibrate(
    pool: pd.DataFrame, confidence: float, method: Method = "conditional_lodo"
) -> Calibration:
    """For every day D: fit on the other days, compute D's firm wind, record whether it held."""
    frames = []
    for day in sorted(pool["delivery_date"].unique()):
        model = lodo_buffer_model(pool, day, confidence, method)
        hours = pool.loc[pool["delivery_date"] == day, ["delivery_date", "target_time"]].copy()
        forecast = pool.loc[hours.index, "forecast_mw"]
        hours["forecast_mw"] = forecast
        hours["actual_mw"] = pool.loc[hours.index, "actual_mw"]
        hours["buffer_mw"] = model.buffer_for(forecast)
        hours["firm_mw"] = firm_wind(forecast, model)
        hours["kept"] = hours["actual_mw"] >= hours["firm_mw"]
        frames.append(hours)
    columns = [
        "delivery_date",
        "target_time",
        "forecast_mw",
        "actual_mw",
        "buffer_mw",
        "firm_mw",
        "kept",
    ]
    hours_all = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=columns)
    return Calibration(confidence, method, hours_all[columns])
