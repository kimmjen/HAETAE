"""Smoke test: health endpoint + guard middleware wired into the app."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    r = client.get("/py/notebooklm/health", headers={"host": "127.0.0.1:4100"})
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_guard_blocks_non_loopback_host():
    r = client.get("/py/notebooklm/health", headers={"host": "evil.com"})
    assert r.status_code == 403
    assert r.json()["error"] == "forbidden"


def test_guard_blocks_cross_origin():
    r = client.get(
        "/py/notebooklm/health",
        headers={"host": "127.0.0.1:4100", "origin": "http://evil.com"},
    )
    assert r.status_code == 403
