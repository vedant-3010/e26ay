"""Synthetic Elexon records shaped exactly like the live API (DATA §1.1–1.2)."""

from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

RUN_TIMES_UTC = (
    time(2, 30),
    time(4, 30),
    time(7, 30),
    time(9, 30),
    time(11, 30),
    time(15, 30),
    time(18, 30),
    time(22, 30),
)
UTC = ZoneInfo("UTC")


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def forecast_value(publish: datetime, target: datetime) -> int:
    """Deterministic MW value, so tests can predict it: 10 000 + lead hours (rounded down)."""
    return 10_000 + int((target - publish).total_seconds() // 3600)


def windfor_day(day: date, run_times: tuple[time, ...] = RUN_TIMES_UTC) -> list[dict[str, Any]]:
    """Every run published on ``day``: 73 hourly points from (P−1) 21:00 to (P+2) 21:00 UTC."""
    first_target = datetime.combine(day - timedelta(days=1), time(21), tzinfo=UTC)
    records = []
    for run in run_times:
        publish = datetime.combine(day, run, tzinfo=UTC)
        for h in range(73):
            target = first_target + timedelta(hours=h)
            records.append(
                {
                    "dataset": "WINDFOR",
                    "publishTime": iso(publish),
                    "startTime": iso(target),
                    "generation": forecast_value(publish, target),
                }
            )
    return records


def actual_value(period: int) -> int:
    return 9_000 + period


def fuelhh_day(day: date) -> list[dict[str, Any]]:
    """48 half-hourly WIND records for a GMT settlement day, newest first like the API."""
    start = datetime.combine(day, time(0), tzinfo=UTC)
    records = []
    for sp in range(1, 49):
        t = start + timedelta(minutes=30 * (sp - 1))
        records.append(
            {
                "dataset": "FUELHH",
                "publishTime": iso(t + timedelta(minutes=30)),
                "startTime": iso(t),
                "settlementDate": day.isoformat(),
                "settlementPeriod": sp,
                "fuelType": "WIND",
                "generation": actual_value(sp),
            }
        )
    return list(reversed(records))
