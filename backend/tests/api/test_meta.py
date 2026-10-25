from fastapi.testclient import TestClient

from ..conftest import SYNTHETIC_SNAPSHOT_ID


def test_meta_bootstraps_the_ui(api: TestClient) -> None:
    r = api.get("/api/meta")
    assert r.status_code == 200
    body = r.json()
    assert body["product"] == "WindDesk"
    assert body["snapshot"] == {"id": SYNTHETIC_SNAPSHOT_ID, "created_at": "2026-10-26T00:00:00Z"}
    assert body["bounds"] == {
        "target_from": "2026-01-01T00:00:00Z",
        "target_to": "2026-02-02T00:00:00Z",
        "delivery_from": "2026-01-02",
        "delivery_to": "2026-02-01",
    }
    assert body["forecast_runs"] == {
        "count": 9,  # 3 publish days × 3 runs
        "run_times_utc": ["02:30", "04:30", "07:30", "09:30", "11:30", "15:30", "18:30", "22:30"],
        "off_schedule": ["2026-01-02T12:25:00Z"],
    }
    assert body["rows"] == {"actuals": 144, "forecasts": 216}
    assert body["auctions"] == [
        {"id": "epex", "label": "EPEX SPOT GB Day-Ahead", "cutoff_local": "09:20"},
        {"id": "n2ex", "label": "Nord Pool N2EX Day-Ahead", "cutoff_local": "09:50"},
    ]
    assert body["confidences"] == [0.8, 0.9, 0.95]
    assert body["horizon"] == {"min_h": 0.0, "max_h": 48.0, "step_h": 0.5, "default_h": 24.0}
    assert body["defaults"]["delivery_date"] == "2026-01-15"
    assert body["defaults"]["monitor_start"] == "2026-01-02T00:00:00Z"
    assert body["quality"]["status"] == "warn"
    assert body["quality"]["summary"]["missing_periods"] == 0
    assert [c["id"] for c in body["quality"]["checks"]] == [
        "runs_per_day",
        "run_times",
        "periods_per_day",
    ]


def test_meta_rejects_unknown_methods(api: TestClient) -> None:
    r = api.post("/api/meta")
    assert r.status_code == 405
    assert r.json()["error"]["code"] == "method_not_allowed"
