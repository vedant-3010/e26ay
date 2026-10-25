"""Raw Elexon records → canonical tables (DATA §4) plus the counts validation reports on.

Cleaning rules (DATA §3 step 5):
- forecasts: drop exact duplicates on (publish_time, target_time) keeping the last record;
  drop ``lead_h < 0``; keep targets inside the pilot window.
- actuals: for a duplicated target_time keep the record with the latest publishTime; keep the
  window.
- Records with a null value are dropped and counted. Nothing is ever filled or interpolated:
  a gap stays a gap and is reported by validation.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import pandas as pd

from ..analytics.timeutil import as_utc
from .client import IngestError

FORECAST_FIELDS = ("publishTime", "startTime", "generation")
ACTUAL_FIELDS = ("publishTime", "startTime", "settlementDate", "settlementPeriod", "generation")


@dataclass(frozen=True)
class NormalizedForecasts:
    frame: pd.DataFrame  #: publish_time, target_time, forecast_mw, lead_h (sorted)
    rows_per_run: dict[pd.Timestamp, int]  #: after de-duplication, before any filter
    raw_rows: int
    duplicates_removed: int
    null_values: int
    negative_values: int
    dropped_negative_lead: int
    dropped_outside_window: int


@dataclass(frozen=True)
class NormalizedActuals:
    frame: pd.DataFrame  #: target_time, actual_mw, settlement_date, settlement_period (sorted)
    raw_rows: int
    duplicates_removed: int
    null_values: int
    negative_values: int
    dropped_outside_window: int


def _records_frame(
    records: Sequence[dict[str, Any]], fields: Sequence[str], dataset: str
) -> pd.DataFrame:
    if not records:
        raise IngestError(f"{dataset}: no records returned for the requested window")
    df = pd.DataFrame.from_records(records)
    missing = [f for f in fields if f not in df.columns]
    if missing:
        raise IngestError(f"{dataset}: schema mismatch, missing fields {missing}")
    return df.loc[:, list(fields)]


def normalize_forecasts(
    records: Sequence[dict[str, Any]], target_from: pd.Timestamp, target_to: pd.Timestamp
) -> NormalizedForecasts:
    """WINDFOR records → ``forecasts`` with ``lead_h = (target_time − publish_time)`` in hours.

    ``rows_per_run`` is counted before the lead and window filters, so it can be compared with
    the 73 points per run Elexon publishes (DATA §1.2).
    """
    raw = _records_frame(records, FORECAST_FIELDS, "WINDFOR")
    df = pd.DataFrame(
        {
            "publish_time": as_utc(raw["publishTime"]),
            "target_time": as_utc(raw["startTime"]),
            "forecast_mw": pd.to_numeric(raw["generation"], errors="coerce").astype("float64"),
        }
    )
    deduped = df.drop_duplicates(["publish_time", "target_time"], keep="last")
    sizes = deduped.groupby("publish_time").size()
    rows_per_run = {
        pd.Timestamp(t): int(n)
        for t, n in zip(pd.DatetimeIndex(sizes.index), sizes.to_list(), strict=True)
    }

    null_mask = deduped["forecast_mw"].isna()
    valid = deduped[~null_mask].copy()
    valid["lead_h"] = (valid["target_time"] - valid["publish_time"]).dt.total_seconds() / 3600

    lead_ok = valid["lead_h"] >= 0
    in_window = (valid["target_time"] >= target_from) & (valid["target_time"] < target_to)
    clean = (
        valid[lead_ok & in_window]
        .sort_values(["publish_time", "target_time"])
        .reset_index(drop=True)
    )
    return NormalizedForecasts(
        frame=clean,
        rows_per_run=rows_per_run,
        raw_rows=len(df),
        duplicates_removed=len(df) - len(deduped),
        null_values=int(null_mask.sum()),
        negative_values=int((valid["forecast_mw"] < 0).sum()),
        dropped_negative_lead=int((~lead_ok).sum()),
        dropped_outside_window=int((lead_ok & ~in_window).sum()),
    )


def normalize_actuals(
    records: Sequence[dict[str, Any]], target_from: pd.Timestamp, target_to: pd.Timestamp
) -> NormalizedActuals:
    """FUELHH (WIND) records → ``actuals``: one row per half-hour, latest publication wins."""
    raw = _records_frame(records, ACTUAL_FIELDS, "FUELHH")
    df = pd.DataFrame(
        {
            "publish_time": as_utc(raw["publishTime"]),
            "target_time": as_utc(raw["startTime"]),
            "actual_mw": pd.to_numeric(raw["generation"], errors="coerce").astype("float64"),
            "settlement_date": raw["settlementDate"].astype("string"),
            "settlement_period": pd.to_numeric(raw["settlementPeriod"]).astype("int16"),
        }
    )
    # Stable sort, so for equal publish times the record fetched last wins.
    deduped = df.sort_values("publish_time", kind="stable").drop_duplicates(
        "target_time", keep="last"
    )
    null_mask = deduped["actual_mw"].isna()
    valid = deduped[~null_mask]
    in_window = (valid["target_time"] >= target_from) & (valid["target_time"] < target_to)
    clean = (
        valid[in_window]
        .drop(columns="publish_time")
        .sort_values("target_time")
        .reset_index(drop=True)
    )
    return NormalizedActuals(
        frame=clean,
        raw_rows=len(df),
        duplicates_removed=len(df) - len(deduped),
        null_values=int(null_mask.sum()),
        negative_values=int((valid["actual_mw"] < 0).sum()),
        dropped_outside_window=int((~in_window).sum()),
    )
