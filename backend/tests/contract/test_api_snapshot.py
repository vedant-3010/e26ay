"""API contract on the real snapshot (marker `snapshot`, run with `make test-contract`)."""

import time
from collections.abc import Iterator
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from winddesk.analytics.pilot import DELIVERY_FROM, DELIVERY_TO
from winddesk.analytics.timeutil import delivery_days
from winddesk.main import create_app

pytestmark = pytest.mark.snapshot

DAYS = delivery_days(DELIVERY_FROM, DELIVERY_TO)


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c


def _ts(value: str) -> datetime:
    return datetime.fromisoformat(value)


@pytest.mark.parametrize(
    "query",
    [
        {"auction": "epex"},
        {"auction": "n2ex"},
        {"auction": "custom", "cutoff": "00:00"},
        {"auction": "custom", "cutoff": "10:45"},
        {"auction": "custom", "cutoff": "23:45"},
    ],
    ids=lambda q: q.get("cutoff", q["auction"]),
)
def test_no_look_ahead_through_the_api(client: TestClient, query: dict[str, str]) -> None:
    for day in DAYS:
        body = client.get(
            "/api/decision", params={"delivery_date": day.isoformat(), **query}
        ).json()
        cutoff = _ts(body["cutoff"]["utc"])
        assert _ts(body["run"]["publish_time"]) <= cutoff, day
        decision_runs = [v for v in body["vintages"] if v["is_decision_run"]]
        assert len(decision_runs) == 1
        assert [p["mw"] for p in decision_runs[0]["points"]] == [
            p["mw"] for p in body["forecast"] if p["mw"] is not None
        ]
        for v in body["vintages"]:
            assert v["after_cutoff"] == (_ts(v["publish_time"]) > cutoff)


def test_presets_use_the_expected_runs_with_full_coverage(client: TestClient) -> None:
    for day in DAYS:
        for auction, hhmm, lead in (
            ("epex", "07:30", (16.5, 39.5)),
            ("n2ex", "09:30", (14.5, 37.5)),
        ):
            run = client.get(
                "/api/decision", params={"delivery_date": day.isoformat(), "auction": auction}
            ).json()["run"]
            assert run["publish_time"].endswith(f"T{hhmm}:00Z")
            assert (run["lead_min_h"], run["lead_max_h"]) == lead
            assert run["partial"] is False


def test_meta_reflects_the_snapshot(client: TestClient) -> None:
    meta = client.get("/api/meta").json()
    assert meta["snapshot"]["id"] == client.get("/api/health").json()["snapshot_id"]
    assert meta["forecast_runs"]["count"] == 272
    assert meta["forecast_runs"]["off_schedule"] == ["2026-01-15T12:25:00Z"]
    assert meta["rows"] == {"actuals": 1536, "forecasts": 14847}
    assert meta["quality"]["summary"]["missing_periods"] == 0


@pytest.mark.parametrize(
    "url",
    [
        "/api/meta",
        "/api/monitor",
        "/api/monitor?start=2026-01-01T00:00:00Z&end=2026-02-02T00:00:00Z&horizon_h=47.5",
        "/api/decision?delivery_date=2026-01-28",
        "/api/decision?delivery_date=2026-01-21&auction=custom&cutoff=08:15&confidence=0.95",
        "/api/accuracy",
        "/api/accuracy?population=horizon&horizon_h=36",
        "/api/accuracy?start=2026-01-10&end=2026-01-20&auction=n2ex&confidence=0.8",
    ],
)
def test_warm_responses_are_under_100_ms(client: TestClient, url: str) -> None:
    assert client.get(url).status_code == 200  # cold: computes and caches
    timings = []
    for _ in range(5):
        t0 = time.perf_counter()
        client.get(url)
        timings.append((time.perf_counter() - t0) * 1000)
    assert max(timings) < 100, timings
