import asyncio
import json
from datetime import date
from pathlib import Path

import httpx
import pytest

from winddesk.ingest.client import (
    MAX_CONCURRENCY,
    Chunk,
    IngestError,
    fetch_chunks,
    fuelhh_chunks,
    parse_records,
    windfor_chunks,
)

RECORDS = [{"publishTime": "2026-01-05T02:30:00Z", "startTime": "2026-01-05T03:00:00Z"}]
BODY = json.dumps(RECORDS).encode()
CHUNK = windfor_chunks(date(2026, 1, 5), date(2026, 1, 5))[0]


class Waits:
    """Records backoff sleeps instead of sleeping."""

    def __init__(self) -> None:
        self.calls: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.calls.append(seconds)


def transport(*responses: httpx.Response | Exception) -> tuple[httpx.MockTransport, list[str]]:
    seen: list[str] = []
    queue = list(responses)

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        item = queue.pop(0) if len(queue) > 1 else queue[0]
        if isinstance(item, Exception):
            raise item
        return item

    return httpx.MockTransport(handler), seen


class TestChunking:
    def test_windfor_has_one_chunk_per_publish_day(self) -> None:
        chunks = windfor_chunks(date(2025, 12, 30), date(2026, 1, 1))
        assert [c.name for c in chunks] == ["2025-12-30", "2025-12-31", "2026-01-01"]
        assert dict(chunks[1].params) == {
            "publishDateTimeFrom": "2025-12-31T00:00:00Z",
            "publishDateTimeTo": "2026-01-01T00:00:00Z",
        }
        assert chunks[0].url.startswith("https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/")

    def test_fuelhh_requests_cover_seven_settlement_days(self) -> None:
        chunks = fuelhh_chunks(date(2026, 1, 1), date(2026, 2, 1))
        # 32 days → 7 + 7 + 7 + 7 + 4.
        assert [c.name for c in chunks] == [
            "2026-01-01_2026-01-07",
            "2026-01-08_2026-01-14",
            "2026-01-15_2026-01-21",
            "2026-01-22_2026-01-28",
            "2026-01-29_2026-02-01",
        ]
        assert dict(chunks[-1].params)["fuelType"] == "WIND"


class TestParseRecords:
    def test_accepts_bare_array_and_data_envelope(self) -> None:
        assert parse_records(BODY, "x") == RECORDS
        assert parse_records(json.dumps({"data": RECORDS}).encode(), "x") == RECORDS

    @pytest.mark.parametrize("payload", [b"not json", b'{"rows": []}', b"[1, 2]"])
    def test_rejects_other_shapes(self, payload: bytes) -> None:
        with pytest.raises(IngestError):
            parse_records(payload, "x")


class TestFetch:
    def test_retries_retryable_statuses_with_backoff(self, tmp_path: Path) -> None:
        t, seen = transport(
            httpx.Response(503), httpx.Response(429), httpx.Response(200, content=BODY)
        )
        waits = Waits()
        [records] = fetch_chunks([CHUNK], tmp_path, transport=t, sleep=waits)
        assert records == RECORDS
        assert waits.calls == [1.0, 2.0]
        assert len(seen) == 3
        assert CHUNK.cache_file(tmp_path).read_bytes() == BODY  # cached verbatim

    def test_retries_timeouts(self, tmp_path: Path) -> None:
        t, _ = transport(httpx.ReadTimeout("slow"), httpx.Response(200, content=BODY))
        [records] = fetch_chunks([CHUNK], tmp_path, transport=t, sleep=Waits())
        assert records == RECORDS

    def test_gives_up_after_five_attempts(self, tmp_path: Path) -> None:
        t, seen = transport(httpx.Response(500))
        waits = Waits()
        with pytest.raises(IngestError, match="giving up after 5 attempts"):
            fetch_chunks([CHUNK], tmp_path, transport=t, sleep=waits)
        assert waits.calls == [1.0, 2.0, 4.0, 8.0]
        assert len(seen) == 5
        assert not CHUNK.cache_file(tmp_path).exists()

    def test_non_retryable_status_fails_immediately(self, tmp_path: Path) -> None:
        t, seen = transport(httpx.Response(404))
        with pytest.raises(IngestError, match="HTTP 404"):
            fetch_chunks([CHUNK], tmp_path, transport=t, sleep=Waits())
        assert len(seen) == 1

    def test_sends_user_agent_and_query(self, tmp_path: Path) -> None:
        captured: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            captured.append(request)
            return httpx.Response(200, content=BODY)

        fetch_chunks([CHUNK], tmp_path, transport=httpx.MockTransport(handler), sleep=Waits())
        assert captured[0].headers["user-agent"] == "WindDesk-pilot/1.0"
        assert captured[0].url.params["publishDateTimeFrom"] == "2026-01-05T00:00:00Z"

    def test_reuses_the_cache(self, tmp_path: Path) -> None:
        cache = CHUNK.cache_file(tmp_path)
        cache.parent.mkdir(parents=True)
        cache.write_bytes(BODY)
        t, seen = transport(httpx.Response(500))
        assert fetch_chunks([CHUNK], tmp_path, transport=t, sleep=Waits()) == [RECORDS]
        assert seen == []

    def test_refresh_refetches_despite_the_cache(self, tmp_path: Path) -> None:
        cache = CHUNK.cache_file(tmp_path)
        cache.parent.mkdir(parents=True)
        cache.write_bytes(b"[]")
        t, seen = transport(httpx.Response(200, content=BODY))
        assert fetch_chunks([CHUNK], tmp_path, refresh=True, transport=t, sleep=Waits()) == [
            RECORDS
        ]
        assert len(seen) == 1
        assert cache.read_bytes() == BODY

    def test_offline_uses_cache_only(self, tmp_path: Path) -> None:
        with pytest.raises(IngestError, match="not in the raw cache"):
            fetch_chunks([CHUNK], tmp_path, offline=True)
        cache = CHUNK.cache_file(tmp_path)
        cache.parent.mkdir(parents=True)
        cache.write_bytes(BODY)
        assert fetch_chunks([CHUNK], tmp_path, offline=True) == [RECORDS]

    def test_keeps_chunk_order_and_bounds_concurrency(self, tmp_path: Path) -> None:
        in_flight = 0
        peak = 0

        async def handler(request: httpx.Request) -> httpx.Response:
            nonlocal in_flight, peak
            in_flight += 1
            peak = max(peak, in_flight)
            await asyncio.sleep(0.01)
            in_flight -= 1
            day = request.url.params["publishDateTimeFrom"][:10]
            return httpx.Response(200, json=[{"day": day}])

        chunks: list[Chunk] = windfor_chunks(date(2026, 1, 1), date(2026, 1, 10))
        results = fetch_chunks(chunks, tmp_path, transport=httpx.MockTransport(handler))
        assert [r[0]["day"] for r in results] == [c.name for c in chunks]
        assert 1 < peak <= MAX_CONCURRENCY
