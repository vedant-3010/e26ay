"""/api/decision on the synthetic store (derivations in tests/conftest.py)."""

import pytest
from fastapi.testclient import TestClient


def test_happy_path_epex(api: TestClient) -> None:
    r = api.get("/api/decision", params={"delivery_date": "2026-01-03"})
    assert r.status_code == 200
    body = r.json()
    assert body["delivery_date"] == "2026-01-03"
    assert body["cutoff"] == {"local": "09:20", "utc": "2026-01-02T09:20:00Z", "auction": "epex"}
    assert body["run"] == {
        "publish_time": "2026-01-02T07:30:00Z",
        "lead_min_h": 16.5,
        "lead_max_h": 39.5,
        "partial": False,
        "missing_hours": [],
    }
    # Buffer for D2 = 200 MW (LODO over D1 = 200 and D3 = 0 errors); all bins fall back (n < 30).
    assert body["buffers"]["method"] == "conditional_lodo"
    assert body["buffers"]["simple_buffer_mw"] == 200.0
    assert {b["buffer_mw"] for b in body["buffers"]["bins"]} == {200.0}
    assert all(b["fallback"] for b in body["buffers"]["bins"])
    assert body["forecast"][0] == {
        "t": "2026-01-03T00:00:00Z",
        "mw": 10000.0,
        "firm_mw": 9800.0,
        "lead_h": 16.5,
    }
    assert len(body["forecast"]) == 24 and len(body["actual"]) == 48
    k = body["kpis"]
    assert (k["forecast_mwh"], k["actual_mwh"]) == (242760.0, 241560.0)
    assert k["energy_error_pct"] == 0.5  # 100 × 1 200 / 242 760 = 0.49…
    assert (k["mae_mw"], k["bias_mw"], k["max_shortfall_mw"]) == (100.0, 100.0, 100.0)
    assert k["max_shortfall_at"] == "2026-01-03T00:00:00Z"
    assert (k["firm_hours_kept"], k["firm_hours_total"]) == (24, 24)
    assert (k["avg_firm_mw"], k["avg_buffer_mw"]) == (9915.0, 200.0)
    assert [
        (v["publish_time"], v["is_decision_run"], v["after_cutoff"]) for v in body["vintages"]
    ] == [
        ("2026-01-02T07:30:00Z", True, False),
        ("2026-01-02T09:30:00Z", False, True),
        ("2026-01-02T11:30:00Z", False, True),
    ]
    assert body["summary"].startswith("At 09:20 on Fri 2 Jan, the latest forecast expected 243 GWh")
    assert "Wind delivered 242 GWh" in body["summary"]
    assert "delivered" not in body["summary_trader"]


def test_n2ex_and_custom_cutoffs(api: TestClient) -> None:
    n2ex = api.get("/api/decision", params={"delivery_date": "2026-01-03", "auction": "n2ex"})
    assert n2ex.json()["run"]["publish_time"] == "2026-01-02T09:30:00Z"
    custom = api.get(
        "/api/decision",
        params={"delivery_date": "2026-01-03", "auction": "custom", "cutoff": "11:45"},
    ).json()
    assert custom["cutoff"] == {
        "local": "11:45",
        "utc": "2026-01-02T11:45:00Z",
        "auction": "custom",
    }
    assert custom["run"]["publish_time"] == "2026-01-02T11:30:00Z"
    assert [v["after_cutoff"] for v in custom["vintages"]] == [False, False, False]


def test_cutoff_is_ignored_for_presets(api: TestClient) -> None:
    r = api.get("/api/decision", params={"delivery_date": "2026-01-03", "cutoff": "11:45"})
    assert r.json()["cutoff"]["local"] == "09:20"


def test_day_without_any_run_is_explicit(api: TestClient) -> None:
    # The synthetic data has no runs covering 20 Jan: every hour is a gap, never filled.
    body = api.get("/api/decision", params={"delivery_date": "2026-01-20"}).json()
    assert body["run"]["partial"] is True
    assert len(body["run"]["missing_hours"]) == 24
    assert all(p["mw"] is None and p["firm_mw"] is None for p in body["forecast"])
    assert body["kpis"]["forecast_mwh"] is None


@pytest.mark.parametrize(
    ("params", "message"),
    [
        ({"delivery_date": "2026-01-01"}, "between 2026-01-02 and 2026-02-01"),
        ({"delivery_date": "2026-02-02"}, "between"),
        ({"delivery_date": "15/01/2026"}, "delivery_date"),
        ({"auction": "apx"}, "auction"),
        ({"auction": "custom"}, "cutoff (HH:MM) is required"),
        ({"auction": "custom", "cutoff": "09:10"}, "15-minute steps"),
        ({"auction": "custom", "cutoff": "24:00"}, "15-minute steps"),
        ({"auction": "custom", "cutoff": "9:15"}, "cutoff"),
        ({"confidence": 0.85}, "confidence must be one of 0.8, 0.9, 0.95"),
        ({"confidence": 0.99}, "confidence"),
    ],
)
def test_invalid_params_are_422(api: TestClient, params: dict[str, object], message: str) -> None:
    r = api.get("/api/decision", params=params)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_params"
    assert message in r.json()["error"]["message"]
