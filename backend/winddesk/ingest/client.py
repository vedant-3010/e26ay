"""Elexon BMRS client: chunked fetches, retries, bounded concurrency and a raw cache (DATA §3).

Each chunk's response body is cached verbatim at ``data/raw/{dataset}/{chunk}.json``. Re-runs
read the cache unless ``refresh`` is set; ``offline`` never touches the network.
``fetch_records`` is the cache-free variant used by live mode (PRD F8) at request time.
"""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable, Sequence
from contextlib import AsyncExitStack
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx

log = logging.getLogger("winddesk.ingest")

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
USER_AGENT = "WindDesk-pilot/1.0"
TIMEOUT_S = 30.0
MAX_CONCURRENCY = 4
BACKOFF_S = (1.0, 2.0, 4.0, 8.0)  # waits between attempts; 5 attempts in total
LIVE_TIMEOUT_S = 10.0
LIVE_BACKOFF_S = (1.0,)  # at request time: one quick retry, then report the failure
RETRY_STATUS = frozenset({429, 500, 502, 503, 504})
FUELHH_DAYS_PER_REQUEST = 7


class IngestError(RuntimeError):
    """A structural problem: the run must stop (network failure, schema mismatch, no data)."""


@dataclass(frozen=True)
class Chunk:
    """One request: a dataset, a cache file name and the query parameters."""

    dataset: str
    name: str
    params: tuple[tuple[str, str], ...]

    @property
    def path(self) -> str:
        return f"/datasets/{self.dataset}/stream"

    @property
    def url(self) -> str:
        return f"{BASE_URL}{self.path}?{urlencode(self.params)}"

    def cache_file(self, raw_dir: Path) -> Path:
        return raw_dir / self.dataset / f"{self.name}.json"


def windfor_chunks(first_day: date, last_day: date) -> list[Chunk]:
    """One chunk per publish day: ``publishDateTimeFrom = day 00:00Z``, ``To = day+1 00:00Z``.

    Elexon treats ``publishDateTimeTo`` as inclusive (verified 2026-10-26). Runs publish at
    hh:30, so no run sits on a boundary; ingest de-duplicates regardless.
    """
    chunks = []
    day = first_day
    while day <= last_day:
        nxt = day + timedelta(days=1)
        params = (
            ("publishDateTimeFrom", f"{day.isoformat()}T00:00:00Z"),
            ("publishDateTimeTo", f"{nxt.isoformat()}T00:00:00Z"),
        )
        chunks.append(Chunk("WINDFOR", day.isoformat(), params))
        day = nxt
    return chunks


def fuelhh_chunks(
    first_day: date, last_day: date, days_per_request: int = FUELHH_DAYS_PER_REQUEST
) -> list[Chunk]:
    """Settlement-date chunks of up to ``days_per_request`` days (both bounds inclusive)."""
    chunks = []
    start = first_day
    while start <= last_day:
        end = min(start + timedelta(days=days_per_request - 1), last_day)
        params = (
            ("settlementDateFrom", start.isoformat()),
            ("settlementDateTo", end.isoformat()),
            ("fuelType", "WIND"),
        )
        chunks.append(Chunk("FUELHH", f"{start.isoformat()}_{end.isoformat()}", params))
        start = end + timedelta(days=1)
    return chunks


def parse_records(payload: bytes, source: str) -> list[dict[str, Any]]:
    """Accept both a bare JSON array and a ``{"data": [...]}`` envelope (DATA §3 step 3)."""
    try:
        body = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise IngestError(f"{source}: response is not JSON ({exc})") from exc
    records = body.get("data") if isinstance(body, dict) else body
    if not isinstance(records, list) or not all(isinstance(r, dict) for r in records):
        raise IngestError(f"{source}: expected a JSON array of records")
    return records


Sleep = Callable[[float], Awaitable[None]]


async def _get_with_retries(
    client: httpx.AsyncClient,
    chunk: Chunk,
    sleep: Sleep,
    backoff: Sequence[float] = BACKOFF_S,
) -> bytes:
    last_error = ""
    for attempt in range(len(backoff) + 1):
        try:
            response = await client.get(chunk.path, params=list(chunk.params))
        except httpx.TransportError as exc:  # includes timeouts
            last_error = f"{type(exc).__name__}: {exc}"
        else:
            if response.status_code == 200:
                return response.content
            if response.status_code not in RETRY_STATUS:
                raise IngestError(f"{chunk.url}: HTTP {response.status_code}")
            last_error = f"HTTP {response.status_code}"
        if attempt < len(backoff):
            log.warning("retrying", extra={"chunk": chunk.url, "error": last_error})
            await sleep(backoff[attempt])
    raise IngestError(f"{chunk.url}: giving up after {len(backoff) + 1} attempts ({last_error})")


async def _fetch_one(
    client: httpx.AsyncClient | None,
    chunk: Chunk,
    raw_dir: Path,
    *,
    offline: bool,
    refresh: bool,
    semaphore: asyncio.Semaphore,
    sleep: Sleep,
) -> list[dict[str, Any]]:
    cache = chunk.cache_file(raw_dir)
    if cache.is_file() and (offline or not refresh):
        return parse_records(cache.read_bytes(), str(cache))
    if offline or client is None:
        raise IngestError(f"{cache} is not in the raw cache; run without --offline to fetch it")

    async with semaphore:
        payload = await _get_with_retries(client, chunk, sleep)
    records = parse_records(payload, chunk.url)  # validate before caching
    cache.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache.with_suffix(".json.tmp")
    tmp.write_bytes(payload)
    tmp.replace(cache)
    log.info("fetched", extra={"chunk": chunk.url, "records": len(records)})
    return records


async def _fetch_all(
    chunks: Sequence[Chunk],
    raw_dir: Path,
    *,
    offline: bool,
    refresh: bool,
    transport: httpx.AsyncBaseTransport | None,
    sleep: Sleep,
) -> list[list[dict[str, Any]]]:
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
    async with AsyncExitStack() as stack:
        client = None
        if not offline:
            client = await stack.enter_async_context(
                httpx.AsyncClient(
                    base_url=BASE_URL,
                    timeout=TIMEOUT_S,
                    headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                    transport=transport,
                )
            )
        fetches = [
            _fetch_one(
                client,
                chunk,
                raw_dir,
                offline=offline,
                refresh=refresh,
                semaphore=semaphore,
                sleep=sleep,
            )
            for chunk in chunks
        ]
        return list(await asyncio.gather(*fetches))


def fetch_chunks(
    chunks: Sequence[Chunk],
    raw_dir: Path,
    *,
    offline: bool = False,
    refresh: bool = False,
    transport: httpx.AsyncBaseTransport | None = None,
    sleep: Sleep = asyncio.sleep,
) -> list[list[dict[str, Any]]]:
    """Fetch every chunk (cache first) and return their records, in the order given."""
    return asyncio.run(
        _fetch_all(
            chunks, raw_dir, offline=offline, refresh=refresh, transport=transport, sleep=sleep
        )
    )


def fetch_records(
    chunks: Sequence[Chunk],
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    sleep: Sleep = asyncio.sleep,
) -> list[list[dict[str, Any]]]:
    """Fetch every chunk straight from Elexon, with a short timeout and one retry, and write
    nothing to disk (live mode, PRD F8; Vercel functions have a read-only filesystem)."""

    async def run() -> list[list[dict[str, Any]]]:
        async with httpx.AsyncClient(
            base_url=BASE_URL,
            timeout=LIVE_TIMEOUT_S,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            transport=transport,
        ) as client:
            payloads = await asyncio.gather(
                *(_get_with_retries(client, c, sleep, LIVE_BACKOFF_S) for c in chunks)
            )
        return [parse_records(p, c.url) for p, c in zip(payloads, chunks, strict=True)]

    return asyncio.run(run())
