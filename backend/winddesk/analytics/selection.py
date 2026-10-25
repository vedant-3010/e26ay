"""Which forecast counts for which target (DATA §5.1, §5.3, §5.4, §5.10), and pairing with actuals.

No-look-ahead invariant: a forecast may inform a decision only if ``publish_time ≤ cutoff``. Every
selection here filters on that condition *before* choosing a run.

Frames used throughout (DATA §4):
- ``forecasts``: publish_time, target_time, forecast_mw, lead_h (hourly targets)
- ``actuals``:   target_time, actual_mw, … (half-hourly targets)
- ``pairs``:     a forecast joined to the actual of the settlement period *starting* at the same
  time (ADR-0004), with ``error_mw = forecast_mw − actual_mw``, ``abs_error_mw``,
  ``delivery_date`` (UK date of the target) and ``hour_uk``.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, time

import numpy as np
import pandas as pd

from .timeutil import UTC_DTYPE, decision_cutoff_utc, delivery_day_targets, uk_date, uk_hour

PAIR_COLUMNS = [
    "publish_time",
    "target_time",
    "lead_h",
    "forecast_mw",
    "actual_mw",
    "error_mw",
    "abs_error_mw",
    "delivery_date",
    "hour_uk",
]


def hourly_targets(start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
    """Hourly target times on the hour in ``[start, end)``."""
    index = pd.date_range(start.ceil("h"), end, freq="1h", inclusive="left")
    return pd.Series(index.tz_convert("UTC").as_unit("ns"), name="target_time")


def select_at_horizon(
    forecasts: pd.DataFrame, targets: pd.Series, horizon_h: float
) -> pd.DataFrame:
    """For each target ``t``, the latest forecast with ``publish_time ≤ t − horizon_h`` (§5.1).

    Returns one row per target: target_time, publish_time, forecast_mw, lead_h. Where no run
    qualifies (expected for evening hours beyond ~43.5 h), the forecast columns are null.

    Invariant: ``lead_h ≥ horizon_h`` on every non-null row. A run published exactly at
    ``t − horizon_h`` is eligible.
    """
    left = pd.DataFrame({"target_time": pd.Series(targets, dtype=UTC_DTYPE).to_numpy()})
    if left.empty:
        return pd.DataFrame(
            {
                "target_time": pd.Series(dtype=UTC_DTYPE),
                "publish_time": pd.Series(dtype=UTC_DTYPE),
                "forecast_mw": pd.Series(dtype="float64"),
                "lead_h": pd.Series(dtype="float64"),
            }
        )
    left["cutoff"] = left["target_time"] - pd.to_timedelta(horizon_h, unit="h")
    left = left.sort_values("cutoff")
    right = forecasts.sort_values("publish_time")[["target_time", "publish_time", "forecast_mw"]]
    out = pd.merge_asof(
        left,
        right,
        left_on="cutoff",
        right_on="publish_time",
        by="target_time",
        direction="backward",
        allow_exact_matches=True,
    )
    out["lead_h"] = (out["target_time"] - out["publish_time"]).dt.total_seconds() / 3600
    out = out.sort_values("target_time").reset_index(drop=True)
    return out[["target_time", "publish_time", "forecast_mw", "lead_h"]]


@dataclass(frozen=True)
class Coverage:
    target_hours: int
    with_forecast: int

    @property
    def pct(self) -> float | None:
        return 100 * self.with_forecast / self.target_hours if self.target_hours else None


def coverage(selected: pd.DataFrame) -> Coverage:
    """How many hourly targets of a selection have a forecast (Monitor coverage, PRD F2.6)."""
    return Coverage(len(selected), int(selected["forecast_mw"].notna().sum()))


@dataclass(frozen=True)
class DecisionRun:
    """The single run a desk could have used for ``delivery_date`` at ``cutoff_utc`` (§5.3)."""

    delivery_date: date
    cutoff_utc: pd.Timestamp
    publish_time: pd.Timestamp | None
    #: One row per hourly target of the day: target_time, forecast_mw, lead_h (null = gap).
    points: pd.DataFrame
    missing_hours: tuple[pd.Timestamp, ...]

    @property
    def partial(self) -> bool:
        return bool(self.missing_hours)

    @property
    def lead_min_h(self) -> float | None:
        lead = self.points["lead_h"].dropna()
        return float(lead.min()) if not lead.empty else None

    @property
    def lead_max_h(self) -> float | None:
        lead = self.points["lead_h"].dropna()
        return float(lead.max()) if not lead.empty else None


def select_decision_run(
    forecasts: pd.DataFrame, delivery_date: date, cutoff_utc: pd.Timestamp
) -> DecisionRun:
    """The latest run with ``publish_time ≤ cutoff_utc``, restricted to the day's hours.

    Hours that run does not cover come back null and are listed in ``missing_hours``. Another
    run is never substituted, even if one covers those hours.
    """
    targets = pd.DataFrame({"target_time": delivery_day_targets(delivery_date)})
    eligible = forecasts.loc[forecasts["publish_time"] <= cutoff_utc]  # no look-ahead
    if eligible.empty:
        points = targets.assign(forecast_mw=np.nan, lead_h=np.nan)
        return DecisionRun(delivery_date, cutoff_utc, None, points, tuple(points["target_time"]))

    run = pd.Timestamp(eligible["publish_time"].max())
    rows = eligible.loc[eligible["publish_time"] == run, ["target_time", "forecast_mw", "lead_h"]]
    points = targets.merge(rows, on="target_time", how="left")
    missing = tuple(points.loc[points["forecast_mw"].isna(), "target_time"])
    return DecisionRun(delivery_date, cutoff_utc, run, points, missing)


def make_pairs(selected: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    """Join forecasts to actuals on ``target_time`` (inner), dropping null forecasts.

    ``selected`` needs target_time, forecast_mw, publish_time and lead_h. An hourly forecast at
    H meets the settlement period starting at H; the H:30 period is not used (ADR-0004).
    """
    fc = selected.dropna(subset=["forecast_mw"])
    pairs = fc[["publish_time", "target_time", "lead_h", "forecast_mw"]].merge(
        actuals[["target_time", "actual_mw"]], on="target_time", how="inner"
    )
    pairs["error_mw"] = pairs["forecast_mw"] - pairs["actual_mw"]
    pairs["abs_error_mw"] = pairs["error_mw"].abs()
    pairs["delivery_date"] = uk_date(pairs["target_time"])
    pairs["hour_uk"] = uk_hour(pairs["target_time"])
    return pairs.sort_values(["target_time", "publish_time"]).reset_index(drop=True)[PAIR_COLUMNS]


def decision_pool(
    forecasts: pd.DataFrame, actuals: pd.DataFrame, days: Iterable[date], cutoff_local: time
) -> pd.DataFrame:
    """Decision pairs for a cutoff: each day's decision run joined to actuals (§5.4)."""
    frames = []
    for day in days:
        run = select_decision_run(forecasts, day, decision_cutoff_utc(day, cutoff_local))
        if run.publish_time is not None:
            frames.append(run.points.assign(publish_time=run.publish_time))
    if not frames:
        return pd.DataFrame(columns=PAIR_COLUMNS)
    return make_pairs(pd.concat(frames, ignore_index=True), actuals)


@dataclass(frozen=True)
class Vintage:
    """One run's forecast for a delivery day (forecast evolution, §5.10)."""

    publish_time: pd.Timestamp
    is_decision_run: bool
    after_cutoff: bool  #: published after the cutoff: not available at decision time
    points: pd.DataFrame  #: target_time, forecast_mw


def vintages_for_day(
    forecasts: pd.DataFrame,
    delivery_date: date,
    cutoff_utc: pd.Timestamp,
    decision_publish_time: pd.Timestamp | None,
) -> list[Vintage]:
    """Every run published in ``[D_start − 48 h, D_start)`` that covers at least one hour of D.

    ``D_start`` is midnight UK time. Runs published after the cutoff are included but flagged
    ``after_cutoff``; they never feed the decision values.
    """
    targets = delivery_day_targets(delivery_date)
    day_start = targets[0]
    window = forecasts[
        (forecasts["publish_time"] >= day_start - pd.Timedelta(hours=48))
        & (forecasts["publish_time"] < day_start)
        & forecasts["target_time"].isin(targets)
    ]
    vintages = []
    for run, group in window.groupby("publish_time", sort=True):
        ts = pd.Timestamp(str(run))
        vintages.append(
            Vintage(
                publish_time=ts,
                is_decision_run=decision_publish_time is not None and ts == decision_publish_time,
                after_cutoff=bool(ts > cutoff_utc),
                points=group[["target_time", "forecast_mw"]].reset_index(drop=True),
            )
        )
    return vintages
