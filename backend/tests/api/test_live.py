"""``/api/live`` (PRD F8) with a fake Elexon and a fake clock: never touches the network.

Scenario: "now" is Tue 10 Mar 2026 10:07 UTC (GMT, so UK = UTC). Tomorrow is Wed 11 Mar and the
as-of cutoff is 10:00 on 10 Mar. The fake returns every nominal run published on 9 and 10 Mar
(``fakes.windfor_day``: value = 10 000 + whole lead hours), including the 11:30–22:30 runs of
10 Mar, which must be ignored because they are after the cutoff (no look-ahead).

Hand-computed:
- decision run = 10 Mar 09:30; leads 14.5 h (00:00) … 37.5 h (23:00); forecast 10 014 … 10 037 MW;
  forecast energy = 24 × 10 000 + (14 + … + 37) = 240 612 MWh.
- Buffers come from the synthetic snapshot's pool for a 10:00 cutoff, which uses its 09:30 runs:
  errors 1 200 / 1 100 / 1 000 MW on its three days (24 h each). The 0.9 quantile of those 72
  errors is 1 200 MW, and every level bin has n < 30, so each falls back to 1 200 MW:
  firm = forecast − 1 200, e.g. 8 814 MW at 00:00.
"""

from collections.abc import Iterator, Sequence
from datetime import date, time
from typing import Any

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from winddesk.api.caching import LIVE_CACHE_CONTROL
from winddesk.api.deps import live_cache_dep, store_dep
from winddesk.config import get_settings
from winddesk.ingest.client import Chunk, IngestError
from winddesk.main import create_app
from winddesk.services.live import (
    LiveCache,
    LiveFetch,
    LiveUnavailableError,
    as_of,
    fetch_live,
    live,
)
from winddesk.store import DataStore

from ..ingest.fakes import windfor_day

NOW = pd.Timestamp("2026-03-10T10:07:00Z")


class FakeElexon:
    def __init__(self) -> None:
        self.requests: list[list[str]] = []
        self.fail = False

    def __call__(self, chunks: Sequence[Chunk]) -> list[list[dict[str, Any]]]:
        self.requests.append([c.name for c in chunks])
        if self.fail:
            raise IngestError("HTTP 503")
        return [windfor_day(date.fromisoformat(c.name)) for c in chunks]


class Clock:
    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t


@pytest.fixture
def elexon() -> FakeElexon:
    return FakeElexon()


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def live_enabled(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("WINDDESK_ENABLE_LIVE", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _client(store: DataStore, cache: LiveCache) -> TestClient:
    app = create_app()
    app.dependency_overrides[store_dep] = lambda: store
    app.dependency_overrides[live_cache_dep] = lambda: cache
    return TestClient(app)


@pytest.fixture
def live_api(
    live_enabled: None, synthetic_store: DataStore, elexon: FakeElexon, clock: Clock
) -> Iterator[TestClient]:
    cache = LiveCache(fetch=lambda now: fetch_live(now, elexon), now=lambda: NOW, monotonic=clock)
    with _client(synthetic_store, cache) as c:
        yield c


def test_disabled_by_default_is_a_404(api: TestClient) -> None:
    r = api.get("/api/live")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"
    assert "WINDDESK_ENABLE_LIVE" in r.json()["error"]["message"]
    assert api.get("/api/meta").json()["live_enabled"] is False


def test_tomorrow_as_of_now_in_the_decision_shape(live_api: TestClient) -> None:
    r = live_api.get("/api/live")
    assert r.status_code == 200
    assert r.headers["cache-control"] == LIVE_CACHE_CONTROL
    body = r.json()
    assert body["delivery_date"] == "2026-03-11"
    assert body["cutoff"] == {"local": "10:00", "utc": "2026-03-10T10:00:00Z", "auction": "custom"}
    assert body["run"]["publish_time"] == "2026-03-10T09:30:00Z"
    assert (body["run"]["lead_min_h"], body["run"]["lead_max_h"]) == (14.5, 37.5)
    first = body["forecast"][0]
    assert (first["mw"], first["firm_mw"], first["lead_h"]) == (10_014, 8_814, 14.5)
    assert body["kpis"]["forecast_mwh"] == 240_612
    assert body["kpis"]["avg_buffer_mw"] == 1_200
    assert body["live"]["fetched_at"] == "2026-03-10T10:07:00Z"
    assert body["live"]["calibration_snapshot_id"] == "0123456789ab"


def test_nothing_after_the_cutoff_is_used(live_api: TestClient) -> None:
    body = live_api.get("/api/live").json()
    later = [v["publish_time"] for v in body["vintages"] if v["after_cutoff"]]
    assert later == [f"2026-03-10T{t}:30:00Z" for t in ("11", "15", "18", "22")]
    decision = [v for v in body["vintages"] if v["is_decision_run"]]
    assert [v["publish_time"] for v in decision] == ["2026-03-10T09:30:00Z"]


def test_no_outcome_before_the_day_happens(live_api: TestClient) -> None:
    body = live_api.get("/api/live").json()
    assert body["actual"] == []
    k = body["kpis"]
    assert k["actual_mwh"] is None and k["mae_mw"] is None and k["max_shortfall_mw"] is None
    assert (k["firm_hours_kept"], k["firm_hours_total"]) == (0, 0)
    assert body["summary"] == body["summary_trader"]
    assert body["summary_trader"].startswith(
        "At 10:00 on Tue 10 Mar, the latest forecast expected 241 GWh of wind for Wed 11 Mar."
    )


def test_one_fetch_per_ten_minutes(live_api: TestClient, elexon: FakeElexon, clock: Clock) -> None:
    live_api.get("/api/live")
    live_api.get("/api/live?confidence=0.8")  # a different confidence reuses the same runs
    assert elexon.requests == [["2026-03-09", "2026-03-10"]]
    clock.t = 599
    live_api.get("/api/live")
    assert len(elexon.requests) == 1
    clock.t = 600
    live_api.get("/api/live")
    assert len(elexon.requests) == 2


def test_elexon_failure_is_a_502_and_is_not_cached(
    live_api: TestClient, elexon: FakeElexon
) -> None:
    elexon.fail = True
    r = live_api.get("/api/live")
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "upstream_unavailable"
    elexon.fail = False
    assert live_api.get("/api/live").status_code == 200
    assert len(elexon.requests) == 2


def test_confidence_is_validated(live_api: TestClient) -> None:
    assert live_api.get("/api/live?confidence=0.7").status_code == 422


def test_meta_reports_the_flag(live_api: TestClient) -> None:
    assert live_api.get("/api/meta").json()["live_enabled"] is True


@pytest.mark.parametrize(
    ("now", "delivery", "cutoff"),
    [
        ("2026-03-10T10:07:00Z", date(2026, 3, 11), time(10, 0)),
        ("2026-03-10T09:30:00Z", date(2026, 3, 11), time(9, 30)),  # a run at 09:30 is in
        # BST: 23:20 UTC on 10 Jun is 00:20 UK on 11 Jun, so tomorrow is 12 Jun.
        ("2026-06-10T23:20:00Z", date(2026, 6, 12), time(0, 15)),
    ],
)
def test_as_of_uses_uk_time(now: str, delivery: date, cutoff: time) -> None:
    assert as_of(pd.Timestamp(now)) == (delivery, cutoff)


def test_empty_fetch_is_unavailable(synthetic_store: DataStore) -> None:
    empty = LiveFetch(NOW, date(2026, 3, 11), time(10), pd.DataFrame())
    cache = LiveCache(fetch=lambda now: empty, now=lambda: NOW)
    with pytest.raises(LiveUnavailableError, match="no WINDFOR run covers 2026-03-11"):
        live(synthetic_store, 0.9, cache)
