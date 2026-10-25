"""/api/accuracy on the synthetic store (derivations in tests/conftest.py and test_accuracy.py)."""

import pytest
from fastapi.testclient import TestClient


def test_decision_population(api: TestClient) -> None:
    r = api.get("/api/accuracy")
    assert r.status_code == 200
    body = r.json()
    assert body["params"] == {
        "population": "decision",
        "auction": "epex",
        "horizon_h": 24.0,
        "start": "2026-01-02",
        "end": "2026-02-01",
        "confidence": 0.9,
    }
    h = body["headline"]
    assert (h["n"], h["mae_mw"], h["bias_mw"]) == (72, 100.0, 100.0)  # errors 200 / 100 / 0
    assert body["takeaways"][0].startswith(
        "At the EPEX SPOT GB Day-Ahead decision point (16.5–39.5 h ahead), the forecast is "
        "typically off by 100 MW"
    )
    assert body["takeaways"][1].startswith("The forecast tends to run high, by 100 MW")
    assert len(body["takeaways"]) == 3
    assert body["decision_lead_window_h"] == [16.5, 39.5]
    assert len(body["lead_curve"]) == 28 and sum(b["n"] for b in body["lead_curve"]) == 216
    assert body["calibration"] == {
        "target_pct": 90.0,
        "achieved_pct": 66.7,
        "method": "conditional_lodo",
    }
    assert [b["n"] for b in body["by_level"]] == [30, 30, 12]
    assert {b["achieved_pct"] for b in body["by_level"]} == {66.7}
    assert len(body["by_hour"]) == 24
    assert [d["mae_mw"] for d in body["daily"]] == [200.0, 100.0, 0.0]
    assert len(body["worst"]) == 10 and body["worst"][0]["error_mw"] == 200.0
    assert body["auction_comparison"]["mae_change_pct"] == 1000.0  # (1 100 − 100) / 100
    assert body["forecast_value"] == {
        "confidence": 0.9,
        "unconditional_firm_mw": 9871.0,
        "avg_forecast_firm_mw": 9948.3,
        "gain_mw": 77.3,
    }
    assert sum(body["distribution"]["counts"]) == 72


def test_horizon_population_has_no_calibration(api: TestClient) -> None:
    body = api.get("/api/accuracy", params={"population": "horizon", "horizon_h": 14.5}).json()
    assert body["params"]["population"] == "horizon"
    assert body["calibration"] is None
    assert body["forecast_value"] is None
    assert all(b["achieved_pct"] is None for b in body["by_level"])
    assert body["takeaways"][0].startswith("At a 14.5 h horizon, the forecast is typically off by")


def test_date_range_filters_evaluated_days(api: TestClient) -> None:
    # D2 + D3 only: 48 decision hours, errors 100 / 0, and firm wind held on both days.
    body = api.get("/api/accuracy", params={"start": "2026-01-03", "end": "2026-01-04"}).json()
    assert body["headline"]["n"] == 48
    assert body["headline"]["mae_mw"] == 50.0
    assert body["calibration"]["achieved_pct"] == 100.0
    assert sum(b["n"] for b in body["lead_curve"]) == 144  # pairs whose target is on D2/D3


def test_irrelevant_params_are_normalised(api: TestClient) -> None:
    a = api.get("/api/accuracy", params={"population": "decision"})
    b = api.get("/api/accuracy", params={"population": "decision", "horizon_h": 36})
    assert a.headers["etag"] == b.headers["etag"]
    assert b.json()["params"]["horizon_h"] == 24.0


@pytest.mark.parametrize(
    ("params", "message"),
    [
        ({"population": "all"}, "population"),
        ({"auction": "custom"}, "auction"),
        ({"population": "horizon", "horizon_h": 0.25}, "0.5 h steps"),
        ({"start": "2026-01-10", "end": "2026-01-05"}, "end must not be before start"),
        ({"start": "2025-12-31"}, "between 2026-01-02 and 2026-02-01"),
        ({"confidence": 0.5}, "confidence"),
    ],
)
def test_invalid_params_are_422(api: TestClient, params: dict[str, object], message: str) -> None:
    r = api.get("/api/accuracy", params=params)
    assert r.status_code == 422
    assert message in r.json()["error"]["message"]
