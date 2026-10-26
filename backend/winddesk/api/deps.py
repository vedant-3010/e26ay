"""Request dependencies: the data store and validated, normalised query parameters.

Every query is normalised to primitive values (dates, ``time``, canonical floats) so the service
``lru_cache`` and the ETag see one key per distinct request. Rule violations raise
``InvalidParamsError`` → 422 with the error envelope.
"""

import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Annotated, Literal

from fastapi import HTTPException, Query

from ..analytics import pilot
from ..config import get_settings
from ..services.live import LiveCache, get_live_cache
from ..store import DataStore, get_store


class InvalidParamsError(Exception):
    def __init__(self, message: str, details: list[dict[str, object]] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or []


def store_dep() -> DataStore:
    """The process-wide store (overridden in tests with a synthetic one)."""
    return get_store()


def _confidence(value: float) -> float:
    for c in pilot.CONFIDENCES:
        if math.isclose(value, c):
            return c
    raise InvalidParamsError(
        f"confidence must be one of {', '.join(f'{c:g}' for c in pilot.CONFIDENCES)}",
        [{"param": "confidence", "value": value}],
    )


def _horizon(value: float) -> float:
    if not pilot.HORIZON_MIN_H <= value <= pilot.HORIZON_MAX_H or not (value * 2).is_integer():
        raise InvalidParamsError(
            f"horizon_h must be between {pilot.HORIZON_MIN_H:g} and {pilot.HORIZON_MAX_H:g} "
            f"in {pilot.HORIZON_STEP_H:g} h steps",
            [{"param": "horizon_h", "value": value}],
        )
    return float(value)


def _delivery_day(value: date, param: str) -> date:
    if not pilot.DELIVERY_FROM <= value <= pilot.DELIVERY_TO:
        raise InvalidParamsError(
            f"{param} must be between {pilot.DELIVERY_FROM} and {pilot.DELIVERY_TO}",
            [{"param": param, "value": value.isoformat()}],
        )
    return value


def _utc(value: datetime, param: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise InvalidParamsError(
            f"{param} must include a UTC offset, e.g. 2026-01-02T00:00:00Z",
            [{"param": param, "value": value.isoformat()}],
        )
    return value.astimezone(pilot.TARGET_FROM_UTC.tzinfo)


Confidence = Annotated[float, Query(description="Firm-wind confidence: 0.8, 0.9 or 0.95.")]
_MONITOR_START = pilot.DEFAULT_MONITOR_START_UTC.to_pydatetime()
_MONITOR_END = pilot.DEFAULT_MONITOR_END_UTC.to_pydatetime()
HorizonH = Annotated[float, Query(description="Horizon in hours, 0–48 in 0.5 h steps.")]


# ---------------------------------------------------------------- /monitor


@dataclass(frozen=True)
class MonitorQuery:
    start: datetime
    end: datetime
    horizon_h: float

    @property
    def key(self) -> str:
        return f"monitor|{self.start.isoformat()}|{self.end.isoformat()}|{self.horizon_h:g}"


def monitor_params(
    start: Annotated[
        datetime, Query(description="Window start, UTC ISO-8601 (inclusive).")
    ] = _MONITOR_START,
    end: Annotated[
        datetime, Query(description="Window end, UTC ISO-8601 (exclusive); span ≤ 35 days.")
    ] = _MONITOR_END,
    horizon_h: HorizonH = pilot.HORIZON_DEFAULT_H,
) -> MonitorQuery:
    s, e = _utc(start, "start"), _utc(end, "end")
    lo, hi = pilot.TARGET_FROM_UTC.to_pydatetime(), pilot.TARGET_TO_UTC.to_pydatetime()
    if s < lo or e > hi:
        raise InvalidParamsError(
            f"start and end must lie within {lo.isoformat()} … {hi.isoformat()}",
            [{"param": "start", "value": s.isoformat()}, {"param": "end", "value": e.isoformat()}],
        )
    if e <= s:
        raise InvalidParamsError("end must be after start")
    if e - s > timedelta(days=pilot.MONITOR_MAX_SPAN_DAYS):
        raise InvalidParamsError(f"the window may span at most {pilot.MONITOR_MAX_SPAN_DAYS} days")
    return MonitorQuery(s, e, _horizon(horizon_h))


# ---------------------------------------------------------------- /decision


@dataclass(frozen=True)
class DecisionQuery:
    delivery_date: date
    auction: Literal["epex", "n2ex", "custom"]
    cutoff_local: time
    confidence: float

    @property
    def key(self) -> str:
        return (
            f"decision|{self.delivery_date}|{self.auction}|{self.cutoff_local:%H:%M}|"
            f"{self.confidence:g}"
        )


def decision_params(
    delivery_date: Annotated[
        date, Query(description="UK delivery day, 2026-01-02 … 2026-02-01.")
    ] = pilot.DEFAULT_DELIVERY_DATE,
    auction: Annotated[
        Literal["epex", "n2ex", "custom"], Query(description="Auction preset, or custom cutoff.")
    ] = pilot.DEFAULT_AUCTION,
    cutoff: Annotated[
        str | None,
        Query(
            description="Custom gate closure on D−1, UK time HH:MM in 15-minute steps. "
            "Required when auction=custom; ignored otherwise.",
            pattern=r"^\d{2}:\d{2}$",
        ),
    ] = None,
    confidence: Confidence = pilot.DEFAULT_CONFIDENCE,
) -> DecisionQuery:
    day = _delivery_day(delivery_date, "delivery_date")
    if auction == "custom":
        if cutoff is None:
            raise InvalidParamsError("cutoff (HH:MM) is required when auction=custom")
        hh, mm = (int(x) for x in cutoff.split(":"))
        if hh > 23 or mm not in (0, 15, 30, 45):
            raise InvalidParamsError(
                "cutoff must be a UK time HH:MM in 15-minute steps, e.g. 09:45",
                [{"param": "cutoff", "value": cutoff}],
            )
        cutoff_local = time(hh, mm)
    else:
        cutoff_local = next(a.cutoff_local for a in pilot.AUCTIONS if a.id == auction)
    return DecisionQuery(day, auction, cutoff_local, _confidence(confidence))


# ---------------------------------------------------------------- /accuracy


@dataclass(frozen=True)
class AccuracyQuery:
    population: Literal["decision", "horizon"]
    auction: pilot.AuctionId
    horizon_h: float
    start: date
    end: date
    confidence: float

    @property
    def key(self) -> str:
        return (
            f"accuracy|{self.population}|{self.auction}|{self.horizon_h:g}|{self.start}|"
            f"{self.end}|{self.confidence:g}"
        )


def accuracy_params(
    population: Annotated[
        Literal["decision", "horizon"],
        Query(description="decision = what the desk had at the cutoff; horizon = fixed H."),
    ] = "decision",
    auction: Annotated[
        pilot.AuctionId, Query(description="Auction for population=decision.")
    ] = pilot.DEFAULT_AUCTION,
    horizon_h: HorizonH = pilot.HORIZON_DEFAULT_H,
    start: Annotated[date, Query(description="First delivery day.")] = pilot.DELIVERY_FROM,
    end: Annotated[date, Query(description="Last delivery day (inclusive).")] = pilot.DELIVERY_TO,
    confidence: Confidence = pilot.DEFAULT_CONFIDENCE,
) -> AccuracyQuery:
    first, last = _delivery_day(start, "start"), _delivery_day(end, "end")
    if last < first:
        raise InvalidParamsError("end must not be before start")
    # Parameters that do not apply to the population are normalised, so they don't split the
    # cache or the ETag.
    h = _horizon(horizon_h) if population == "horizon" else pilot.HORIZON_DEFAULT_H
    a: pilot.AuctionId = auction if population == "decision" else pilot.DEFAULT_AUCTION
    return AccuracyQuery(population, a, h, first, last, _confidence(confidence))


# ---------------------------------------------------------------- /live (Could, PRD F8)


def require_live() -> None:
    """Live mode is a Could-have behind a flag (PRD F8): 404 unless WINDDESK_ENABLE_LIVE=true."""
    if not get_settings().enable_live:
        raise HTTPException(404, "Live mode is disabled (set WINDDESK_ENABLE_LIVE=true)")


def live_params(confidence: Confidence = pilot.DEFAULT_CONFIDENCE) -> float:
    return _confidence(confidence)


def live_cache_dep() -> LiveCache:
    """The process-wide live cache (overridden in tests with a fake fetch and clock)."""
    return get_live_cache()
