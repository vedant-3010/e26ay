"""Accuracy Lab statistics (DATA §5.6, §5.11, §5.12). Pure functions over pairs.

Unless stated otherwise, inputs are decision pairs (one per decision hour) or all pairs, with the
columns produced by :func:`winddesk.analytics.selection.make_pairs`.
"""

from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

from .buffers import Calibration, level_bin, level_bins, level_edges, shortfall_buffer
from .metrics import Metrics, compute_metrics, quantile

HISTOGRAM_BIN_MW = 250.0


def in_days(pairs: pd.DataFrame, first: date, last: date) -> pd.DataFrame:
    """Rows whose delivery date is in ``[first, last]``."""
    return pairs[(pairs["delivery_date"] >= first) & (pairs["delivery_date"] <= last)]


def lead_curve(pairs: pd.DataFrame, bin_h: float = 1.0, max_lead_h: float = 48.0) -> pd.DataFrame:
    """Error by *actual* lead time over all pairs with ``0 ≤ lead_h < max_lead_h`` (§5.6).

    Bin k is ``[k·bin_h, (k+1)·bin_h)`` and is labelled by its midpoint (0.5, 1.5, … for 1 h
    bins). Grouping is by ``floor``, not by exact lead, so off-schedule runs (leads k + 0.58 h)
    land in the right bin. Only bins with data are returned.
    """
    p = pairs[(pairs["lead_h"] >= 0) & (pairs["lead_h"] < max_lead_h)]
    k = np.floor(p["lead_h"] / bin_h).astype(int)
    rows = []
    for b, group in p.groupby(k, sort=True):
        m = compute_metrics(group)
        lo = int(str(b)) * bin_h
        rows.append(
            {
                "lead_h": lo + bin_h / 2,
                "lead_from_h": lo,
                "lead_to_h": lo + bin_h,
                "n": m.n,
                "mae_mw": m.mae_mw,
                "rmse_mw": m.rmse_mw,
                "bias_mw": m.bias_mw,
                "p50_abs_mw": m.p50_abs_mw,
                "p90_abs_mw": m.p90_abs_mw,
                "p99_abs_mw": m.p99_abs_mw,
            }
        )
    return pd.DataFrame(
        rows,
        columns=[
            "lead_h",
            "lead_from_h",
            "lead_to_h",
            "n",
            "mae_mw",
            "rmse_mw",
            "bias_mw",
            "p50_abs_mw",
            "p90_abs_mw",
            "p99_abs_mw",
        ],
    )


def lead_window(pool: pd.DataFrame) -> tuple[float, float] | None:
    """Range of lead times in a decision pool, e.g. (16.5, 39.5) for EPEX."""
    if pool.empty:
        return None
    return float(pool["lead_h"].min()), float(pool["lead_h"].max())


@dataclass(frozen=True)
class Distribution:
    bin_edges_mw: list[float]  #: len(counts) + 1 edges; bins are [a, b), the last is [a, b]
    counts: list[int]
    p10_mw: float | None
    p50_mw: float | None
    p90_mw: float | None


def error_distribution(errors: pd.Series, bin_mw: float = HISTOGRAM_BIN_MW) -> Distribution:
    """Histogram of signed error in fixed ``bin_mw`` bins, aligned to multiples of ``bin_mw``."""
    e = errors.dropna().to_numpy(dtype="float64")
    if e.size == 0:
        return Distribution([], [], None, None, None)
    lo = np.floor(e.min() / bin_mw) * bin_mw
    hi = np.ceil(e.max() / bin_mw) * bin_mw
    if hi == lo:
        hi = lo + bin_mw
    edges = np.arange(lo, hi + bin_mw / 2, bin_mw)
    counts, _ = np.histogram(e, bins=edges)
    return Distribution(
        bin_edges_mw=[float(x) for x in edges],
        counts=[int(c) for c in counts],
        p10_mw=quantile(e, 0.1),
        p50_mw=quantile(e, 0.5),
        p90_mw=quantile(e, 0.9),
    )


def by_hour(pairs: pd.DataFrame) -> pd.DataFrame:
    """Per UK hour of day: n, MAE, bias and P90 shortfall."""
    rows = []
    for hour, group in pairs.groupby("hour_uk", sort=True):
        m = compute_metrics(group)
        rows.append(
            {
                "hour_uk": int(str(hour)),
                "n": m.n,
                "mae_mw": m.mae_mw,
                "bias_mw": m.bias_mw,
                "p90_shortfall_mw": m.p90_shortfall_mw,
            }
        )
    return pd.DataFrame(rows, columns=["hour_uk", "n", "mae_mw", "bias_mw", "p90_shortfall_mw"])


def by_level(pool: pd.DataFrame, calibration: Calibration | None = None) -> pd.DataFrame:
    """Error and buffers per forecast-level bin (quintiles of the *whole* pool; descriptive).

    ``achieved_pct`` is the share of decision hours in the bin where the LODO firm wind held
    (from ``calibration``); null when no calibration is given.
    """
    edges = level_edges(pool["forecast_mw"])
    idx = level_bin(pool["forecast_mw"], edges)
    kept_idx = (
        level_bin(calibration.hours["forecast_mw"], edges) if calibration is not None else None
    )
    rows = []
    for level in level_bins(edges):
        group = pool[idx == level.index]
        e = group["error_mw"]
        m = compute_metrics(group)
        achieved = None
        if calibration is not None and kept_idx is not None:
            kept = calibration.hours.loc[kept_idx == level.index, "kept"]
            achieved = 100 * float(kept.mean()) if not kept.empty else None
        rows.append(
            {
                "forecast_from_mw": level.forecast_from_mw,
                "forecast_to_mw": level.forecast_to_mw,
                "n": m.n,
                "mae_mw": m.mae_mw,
                "bias_mw": m.bias_mw,
                "p80_shortfall_mw": shortfall_buffer(e, 0.8) if m.n else None,
                "p90_shortfall_mw": shortfall_buffer(e, 0.9) if m.n else None,
                "p95_shortfall_mw": shortfall_buffer(e, 0.95) if m.n else None,
                "achieved_pct": achieved,
            }
        )
    return pd.DataFrame(rows)


def daily(pairs: pd.DataFrame) -> pd.DataFrame:
    """Per delivery day: n, MAE, bias and the largest shortfall."""
    rows = []
    for day, group in pairs.groupby("delivery_date", sort=True):
        m = compute_metrics(group)
        rows.append(
            {
                "delivery_date": day,
                "n": m.n,
                "mae_mw": m.mae_mw,
                "bias_mw": m.bias_mw,
                "max_shortfall_mw": m.max_shortfall_mw,
            }
        )
    return pd.DataFrame(
        rows, columns=["delivery_date", "n", "mae_mw", "bias_mw", "max_shortfall_mw"]
    )


def worst_hours(pairs: pd.DataFrame, n: int = 10) -> pd.DataFrame:
    """The ``n`` largest absolute errors (ties broken by earlier target time)."""
    ranked = pairs.sort_values(["abs_error_mw", "target_time"], ascending=[False, True])
    return ranked.head(n)[
        [
            "target_time",
            "delivery_date",
            "forecast_mw",
            "actual_mw",
            "error_mw",
            "publish_time",
            "lead_h",
        ]
    ].reset_index(drop=True)


@dataclass(frozen=True)
class AuctionComparison:
    epex: Metrics
    n2ex: Metrics
    #: 100 × (MAE_n2ex − MAE_epex) / MAE_epex; negative = the later N2EX cutoff is more accurate.
    mae_change_pct: float | None


def auction_comparison(epex_pool: pd.DataFrame, n2ex_pool: pd.DataFrame) -> AuctionComparison:
    epex, n2ex = compute_metrics(epex_pool), compute_metrics(n2ex_pool)
    change = None
    if epex.mae_mw and n2ex.mae_mw is not None:
        change = 100 * (n2ex.mae_mw - epex.mae_mw) / epex.mae_mw
    return AuctionComparison(epex, n2ex, change)


@dataclass(frozen=True)
class ForecastValue:
    confidence: float
    #: What you could bank with no forecast: the (1 − c) quantile of actual wind.
    unconditional_firm_mw: float | None
    #: What you can bank with the forecast: mean LODO firm wind.
    avg_forecast_firm_mw: float | None
    gain_mw: float | None


def forecast_value(calibration: Calibration) -> ForecastValue:
    """Value of the forecast at confidence c, over the same decision hours (§5.12)."""
    hours = calibration.hours.dropna(subset=["actual_mw", "firm_mw"])
    if hours.empty:
        return ForecastValue(calibration.confidence, None, None, None)
    unconditional = quantile(hours["actual_mw"], 1 - calibration.confidence)
    with_forecast = float(hours["firm_mw"].mean())
    return ForecastValue(
        calibration.confidence, unconditional, with_forecast, with_forecast - unconditional
    )
