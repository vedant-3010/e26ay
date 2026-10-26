"""``/api/live`` (PRD F8, Could; off unless ``WINDDESK_ENABLE_LIVE=true``): tomorrow as of now.

The latest WINDFOR runs are fetched from Elexon at request time, the one documented exception to
"never call Elexon at request time" (CLAUDE.md), and kept in memory for 10 minutes. The answer is
built by the Decision Desk pipeline unchanged:

- the delivery day D is tomorrow in UK time, and the "cutoff" is the fetch time on D−1, floored to
  15 minutes, so only runs published by then are used (no look-ahead);
- firm wind uses buffers fitted on the pilot snapshot's decision pairs for that same cutoff time,
  so the buffer matches the lead time;
- there are no actuals yet, so every outcome field is null.

Nothing fetched is written to disk or mixed into the snapshot.
"""

import logging
import threading
import time as clock
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, time, timedelta
from functools import lru_cache
from typing import Any

import httpx
import pandas as pd

from ..analytics.decision import decision_day
from ..analytics.timeutil import LONDON, delivery_day_targets
from ..api import schemas
from ..ingest.client import Chunk, IngestError, fetch_records, windfor_chunks
from ..ingest.normalize import normalize_forecasts
from ..store import DataStore
from .decision import to_response

log = logging.getLogger("winddesk")

TTL_S = 600.0  #: how long fetched runs are reused (PRD F8: cached 10 minutes)
CUTOFF_STEP_MIN = 15  #: the as-of cutoff is floored to the custom-cutoff step

_NO_ACTUALS = pd.DataFrame(
    {
        "target_time": pd.Series(dtype="datetime64[ns, UTC]"),
        "actual_mw": pd.Series(dtype="float64"),
    }
)


class LiveUnavailableError(RuntimeError):
    """Elexon could not be reached, or returned nothing usable for tomorrow."""


@dataclass(frozen=True)
class LiveFetch:
    fetched_at: pd.Timestamp  #: UTC
    delivery_date: date  #: tomorrow, UK
    cutoff_local: time  #: fetch time on D−1 (UK), floored to 15 minutes
    forecasts: pd.DataFrame  #: canonical WINDFOR rows with targets on day D


def as_of(now_utc: pd.Timestamp) -> tuple[date, time]:
    """Tomorrow's UK delivery day and today's UK time floored to 15 minutes.

    Nominal runs are published at hh:30, so flooring never hides one: a run published at 09:30
    is available to a 09:30 cutoff. An off-schedule run (such as 15 Jan's 12:25) can appear up
    to 15 minutes late. The step keeps the number of distinct calibration pools small.
    """
    local = now_utc.tz_convert(LONDON)
    minute = local.minute - local.minute % CUTOFF_STEP_MIN
    return local.date() + timedelta(days=1), time(local.hour, minute)


Fetcher = Callable[[Sequence[Chunk]], list[list[dict[str, Any]]]]


def fetch_live(now_utc: pd.Timestamp, fetch: Fetcher = fetch_records) -> LiveFetch:
    """Runs published on D−2 and D−1 (UTC publish days): every run that covers day D."""
    delivery, cutoff_local = as_of(now_utc)
    targets = delivery_day_targets(delivery)
    try:
        chunks = windfor_chunks(delivery - timedelta(days=2), delivery - timedelta(days=1))
        records = [r for part in fetch(chunks) for r in part]
        frame = normalize_forecasts(records, targets[0], targets[-1] + pd.Timedelta(hours=1)).frame
    except (IngestError, httpx.HTTPError) as exc:
        raise LiveUnavailableError(str(exc)) from exc
    log.info("live fetch", extra={"delivery_date": str(delivery), "rows": len(frame)})
    return LiveFetch(now_utc, delivery, cutoff_local, frame)


class LiveCache:
    """One fetch per ``ttl_s``, shared by every request; failures are not cached.

    The lock is held during the fetch, so concurrent requests wait for one Elexon call instead of
    each making their own.
    """

    def __init__(
        self,
        fetch: Callable[[pd.Timestamp], LiveFetch] = fetch_live,
        now: Callable[[], pd.Timestamp] = lambda: pd.Timestamp.now(tz="UTC"),
        monotonic: Callable[[], float] = clock.monotonic,
        ttl_s: float = TTL_S,
    ) -> None:
        self._fetch, self._now, self._monotonic, self._ttl_s = fetch, now, monotonic, ttl_s
        self._lock = threading.Lock()
        self._entry: LiveFetch | None = None
        self._at = 0.0

    def get(self) -> LiveFetch:
        with self._lock:
            if self._entry is None or self._monotonic() - self._at >= self._ttl_s:
                self._entry = self._fetch(self._now())
                self._at = self._monotonic()
            return self._entry


@lru_cache(maxsize=1)
def get_live_cache() -> LiveCache:
    return LiveCache()


def live(store: DataStore, confidence: float, cache: LiveCache) -> schemas.LiveResponse:
    fetched = cache.get()
    if fetched.forecasts.empty:
        raise LiveUnavailableError(f"no WINDFOR run covers {fetched.delivery_date} yet")
    day = decision_day(
        fetched.forecasts,
        _NO_ACTUALS,
        store.pool_for_cutoff(fetched.cutoff_local),
        fetched.delivery_date,
        auction="custom",
        cutoff_local=fetched.cutoff_local,
        confidence=confidence,
    )
    body = to_response(day, with_actual=False)
    return schemas.LiveResponse(
        **body.model_dump(),
        live=schemas.LiveInfo(
            fetched_at=fetched.fetched_at.to_pydatetime(),
            ttl_s=int(TTL_S),
            calibration_snapshot_id=store.snapshot_id,
        ),
    )
