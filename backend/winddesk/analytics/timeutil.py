"""Time handling (DATA §5.2). The one place that converts between UTC and UK local time.

Invariants:
- Every timestamp column is tz-aware UTC with a single unit, ``datetime64[ns, UTC]``.
  pandas 3 parses to microseconds by default, and ``merge_asof`` refuses mixed units, so
  everything goes through :func:`as_utc`.
- Delivery days, decision cutoffs and labels use Europe/London, so BST is handled correctly
  even though the January pilot is all GMT.
"""

from datetime import date, datetime, time, timedelta
from typing import Any, Final
from zoneinfo import ZoneInfo

import pandas as pd

LONDON = ZoneInfo("Europe/London")
UTC_DTYPE: Final = "datetime64[ns, UTC]"


def as_utc(values: Any) -> pd.Series:
    """Parse ISO strings or timestamps into a ``datetime64[ns, UTC]`` Series.

    Naive inputs are rejected rather than guessed: a timestamp without an offset has no
    defined meaning here.
    """
    series = values if isinstance(values, pd.Series) else pd.Series(values)
    if pd.api.types.is_datetime64_dtype(series) and getattr(series.dt, "tz", None) is None:
        raise ValueError("naive datetimes are not allowed; supply an explicit UTC offset")
    return pd.to_datetime(series, utc=True).astype(UTC_DTYPE)


def decision_cutoff_utc(delivery_date: date, cutoff_local: time) -> pd.Timestamp:
    """Gate closure for ``delivery_date``: ``cutoff_local`` UK time on the day before, in UTC.

    >>> decision_cutoff_utc(date(2026, 1, 15), time(9, 20))
    Timestamp('2026-01-14 09:20:00+0000', tz='UTC')
    """
    local = datetime.combine(delivery_date - timedelta(days=1), cutoff_local, tzinfo=LONDON)
    return pd.Timestamp(local).tz_convert("UTC").as_unit("ns")


def delivery_day_targets(delivery_date: date, freq: str = "1h") -> pd.DatetimeIndex:
    """Target times of one UK delivery day (00:00–24:00 local), as UTC.

    24 hourly / 48 half-hourly points, or 23/46 and 25/50 on clock-change days.
    """
    start = pd.Timestamp(datetime.combine(delivery_date, time(0), tzinfo=LONDON))
    end = pd.Timestamp(datetime.combine(delivery_date + timedelta(days=1), time(0), tzinfo=LONDON))
    return pd.date_range(start, end, freq=freq, inclusive="left").tz_convert("UTC").as_unit("ns")


def delivery_days(first: date, last: date) -> list[date]:
    """Every date from ``first`` to ``last``, both inclusive."""
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


def uk_date(times: pd.Series) -> pd.Series:
    """UK local calendar date of each UTC timestamp (the delivery/settlement day)."""
    return pd.Series(times.dt.tz_convert(LONDON).dt.date, index=times.index)


def uk_hour(times: pd.Series) -> pd.Series:
    """UK local hour (0–23) of each UTC timestamp."""
    return pd.Series(times.dt.tz_convert(LONDON).dt.hour, index=times.index)


def to_uk_label(ts: pd.Timestamp | datetime, *, with_time: bool = True) -> str:
    """UI/narrative label in UK time: ``Thu 15 Jan 18:00`` (or ``Thu 15 Jan``)."""
    local = pd.Timestamp(ts).tz_convert(LONDON)
    label = f"{local:%a} {local.day} {local:%b}"
    return f"{label} {local:%H:%M}" if with_time else label


def utc_iso(ts: pd.Timestamp) -> str:
    """ISO-8601 UTC with a ``Z`` suffix, as used by the API (``2026-01-15T09:00:00Z``)."""
    return pd.Timestamp(ts).tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")
