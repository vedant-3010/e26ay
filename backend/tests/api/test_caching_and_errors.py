from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from winddesk.api.caching import CACHE_CONTROL, etag_for
from winddesk.api.deps import store_dep
from winddesk.main import create_app

from ..conftest import SYNTHETIC_SNAPSHOT_ID

URL = "/api/decision?delivery_date=2026-01-03"


def test_data_responses_carry_cache_headers(api: TestClient) -> None:
    r = api.get(URL)
    assert r.headers["cache-control"] == CACHE_CONTROL
    assert r.headers["x-snapshot-id"] == SYNTHETIC_SNAPSHOT_ID
    assert r.headers["etag"].startswith(f'"{SYNTHETIC_SNAPSHOT_ID}-')
    assert r.headers["content-type"] == "application/json"


def test_etag_is_stable_per_query_and_differs_between_queries(api: TestClient) -> None:
    first, again = api.get(URL), api.get(URL)
    other = api.get("/api/decision?delivery_date=2026-01-04")
    assert first.headers["etag"] == again.headers["etag"]
    assert first.headers["etag"] != other.headers["etag"]
    # Spelling the defaults explicitly is the same normalised query.
    explicit = api.get(URL + "&auction=epex&confidence=0.90")
    assert explicit.headers["etag"] == first.headers["etag"]


@pytest.mark.parametrize("variant", ["{etag}", "W/{etag}", '"other", {etag}', "*"])
def test_if_none_match_returns_304(api: TestClient, variant: str) -> None:
    etag = api.get(URL).headers["etag"]
    r = api.get(URL, headers={"If-None-Match": variant.format(etag=etag)})
    assert r.status_code == 304
    assert r.content == b""
    assert r.headers["etag"] == etag
    assert r.headers["x-snapshot-id"] == SYNTHETIC_SNAPSHOT_ID


def test_large_responses_are_gzipped(api: TestClient) -> None:
    r = api.get("/api/accuracy", headers={"Accept-Encoding": "gzip"})
    assert r.headers["content-encoding"] == "gzip"
    assert r.json()["params"]["population"] == "decision"  # the client decodes it
    small = api.get("/api/health", headers={"Accept-Encoding": "gzip"})
    assert "content-encoding" not in small.headers  # under the 1 KB threshold


def test_stale_etag_gets_a_full_response(api: TestClient) -> None:
    r = api.get(URL, headers={"If-None-Match": etag_for("oldsnapshot1", "x")})
    assert r.status_code == 200


def test_error_envelope_shape(api: TestClient) -> None:
    r = api.get("/api/decision?delivery_date=2026-03-01")
    assert r.status_code == 422
    assert set(r.json()) == {"error"}
    assert set(r.json()["error"]) == {"code", "message", "details"}
    assert r.json()["error"]["details"] == [{"param": "delivery_date", "value": "2026-03-01"}]


def test_framework_validation_errors_use_the_envelope(api: TestClient) -> None:
    error = api.get("/api/decision?delivery_date=soon").json()["error"]
    assert error["code"] == "invalid_params"
    assert error["details"][0]["param"] == "delivery_date"
    assert error["details"][0]["input"] == "soon"


@pytest.fixture
def broken_api() -> Iterator[TestClient]:
    def explode() -> None:
        raise RuntimeError("boom: secret internals")

    app = create_app()
    app.dependency_overrides[store_dep] = explode
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def test_unexpected_errors_are_500_without_internals(broken_api: TestClient) -> None:
    r = broken_api.get("/api/meta")
    assert r.status_code == 500
    assert r.json() == {
        "error": {"code": "internal_error", "message": "Internal server error", "details": []}
    }
    assert "boom" not in r.text


def test_openapi_lists_every_endpoint(api: TestClient) -> None:
    paths = api.get("/api/openapi.json").json()["paths"]
    assert {"/api/health", "/api/meta", "/api/monitor", "/api/decision", "/api/accuracy"} <= set(
        paths
    )
    assert api.get("/api/docs").status_code == 200
