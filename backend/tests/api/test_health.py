import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from winddesk import __version__
from winddesk.config import get_settings
from winddesk.main import create_app


def test_health_returns_ok_and_version(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["version"] == __version__
    assert set(body) == {"status", "snapshot_id", "git_sha", "version"}
    assert r.headers["cache-control"] == "no-store"


def test_health_reports_snapshot_id_and_git_sha(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "manifest.json").write_text(json.dumps({"snapshot_id": "a1b2c3d4e5f6"}))
    monkeypatch.setenv("WINDDESK_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("GIT_SHA", "abc1234")
    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as c:
            r = c.get("/api/health")
    finally:
        get_settings.cache_clear()
    assert r.json()["snapshot_id"] == "a1b2c3d4e5f6"
    assert r.json()["git_sha"] == "abc1234"
    assert r.headers["x-snapshot-id"] == "a1b2c3d4e5f6"


def test_unknown_api_path_is_json_404(client: TestClient) -> None:
    r = client.get("/api/does-not-exist")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_openapi_and_docs_are_under_api(client: TestClient) -> None:
    assert client.get("/api/openapi.json").json()["info"]["title"] == "WindDesk API"
    assert client.get("/api/docs").status_code == 200


def test_spa_is_served_with_deep_link_fallback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dist = tmp_path / "frontend" / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><div id=root></div>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    monkeypatch.chdir(tmp_path)  # FRONTEND_DIST is relative to the working directory

    with TestClient(create_app()) as c:
        assert "id=root" in c.get("/").text
        deep = c.get("/monitor", headers={"Accept": "text/html"})
        assert deep.status_code == 200
        assert "id=root" in deep.text
        assert c.get("/assets/app.js").text == "console.log(1)"
        # The index.html fallback is for navigations only (browsers send Accept: text/html);
        # a missing asset must 404 instead of returning HTML. Vercel's CDN behaves the same.
        assert c.get("/assets/missing.js", headers={"Accept": "*/*"}).status_code == 404
        # API routes keep priority over the SPA fallback.
        assert c.get("/api/health").json()["status"] == "ok"
        assert c.get("/api/nope").status_code == 404
