"""/api/monitor on the synthetic store (derivations in tests/conftest.py)."""

import pytest
from fastapi.testclient import TestClient

D1_WINDOW = {"start": "2026-01-02T00:00:00Z", "end": "2026-01-03T00:00:00Z"}


def test_happy_path(api: TestClient) -> None:
    r = api.get("/api/monitor", params={**D1_WINDOW, "horizon_h": 14.5})
    assert r.status_code == 200
    body = r.json()
    assert body["params"] == {**D1_WINDOW, "horizon_h": 14.5}
    assert len(body["actual"]) == 48
    assert body["actual"][:2] == [
        {"t": "2026-01-02T00:00:00Z", "mw": 9800.0},
        {"t": "2026-01-02T00:30:00Z", "mw": 9900.0},
    ]
    forecast = body["forecast"]
    assert len(forecast) == 24
    # h = 0: cutoff 1 Jan 09:30 → exactly the 09:30 run (eligible) → 11 000 MW, lead 14.5 h.
    assert forecast[0] == {
        "t": "2026-01-02T00:00:00Z",
        "mw": 11000.0,
        "publish_time": "2026-01-01T09:30:00Z",
        "lead_h": 14.5,
    }
    # h = 2: cutoff 11:30 → the 11:30 run: 12 000 + 20.
    assert forecast[2]["mw"] == 12020.0
    assert body["coverage"] == {"target_hours": 24, "with_forecast": 24, "pct": 100.0}
    # Errors vs the h:00 period: h = 0, 1 → 1 200 MW (09:30 run); h ≥ 2 → 2 200 MW (11:30 run).
    # MAE = (2 × 1 200 + 22 × 2 200) / 24 = 2 116.7.
    assert body["metrics"]["n"] == 24
    assert body["metrics"]["mae_mw"] == 2116.7
    assert body["metrics"]["bias_mw"] == 2116.7


def test_long_horizons_return_nulls_not_substitutes(api: TestClient) -> None:
    # H = 17: hour 0 of D1 needs a run by 1 Jan 07:00; none exists → null, coverage 23/24.
    body = api.get("/api/monitor", params={**D1_WINDOW, "horizon_h": 17}).json()
    assert body["forecast"][0] == {
        "t": "2026-01-02T00:00:00Z",
        "mw": None,
        "publish_time": None,
        "lead_h": None,
    }
    assert body["coverage"]["with_forecast"] == 23
    assert body["coverage"]["pct"] == 95.8


def test_defaults_are_the_first_week(api: TestClient) -> None:
    body = api.get("/api/monitor").json()
    assert body["params"] == {
        "start": "2026-01-02T00:00:00Z",
        "end": "2026-01-09T00:00:00Z",
        "horizon_h": 24.0,
    }
    assert body["coverage"]["target_hours"] == 7 * 24


def test_the_whole_data_window_fits_in_one_request(api: TestClient) -> None:
    # The data spans 32 days (1 Jan – 2 Feb, exclusive), inside the 35-day limit.
    params = {"start": "2026-01-01T00:00:00Z", "end": "2026-02-02T00:00:00Z", "horizon_h": 24}
    body = api.get("/api/monitor", params=params).json()
    assert body["coverage"]["target_hours"] == 32 * 24


@pytest.mark.parametrize(
    ("params", "message"),
    [
        ({"horizon_h": 0.3}, "0.5 h steps"),
        ({"horizon_h": 48.5}, "between 0 and 48"),
        ({"horizon_h": "abc"}, "horizon_h"),
        ({"start": "2026-01-03T00:00:00Z", "end": "2026-01-02T00:00:00Z"}, "after start"),
        ({"start": "2025-12-31T00:00:00Z"}, "within"),
        ({"end": "2026-02-02T00:30:00Z", "start": "2026-02-01T00:00:00Z"}, "within"),
        ({"start": "2026-01-02T00:00:00"}, "UTC offset"),
        ({"start": "not-a-date"}, "start"),
    ],
)
def test_invalid_params_are_422(api: TestClient, params: dict[str, object], message: str) -> None:
    r = api.get("/api/monitor", params=params)
    assert r.status_code == 422
    error = r.json()["error"]
    assert error["code"] == "invalid_params"
    assert message in error["message"]
