"""auth-status route contract + check_auth no-auth path."""

import asyncio

from fastapi.testclient import TestClient

import app.notebooklm_client as nlm
from app.main import app

client = TestClient(app)
H = {"host": "127.0.0.1:4100"}


def test_auth_status_passes_through_check(monkeypatch):
    async def fake():
        return {"status": "ok", "profile": "default", "login_command": "py -m notebooklm login"}

    monkeypatch.setattr(nlm, "check_auth", fake)
    r = client.get("/py/notebooklm/auth-status", headers=H)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["login_command"] == "py -m notebooklm login"


def test_auth_status_expired(monkeypatch):
    async def fake():
        return {"status": "expired", "profile": "default", "login_command": "x", "detail": "만료"}

    monkeypatch.setattr(nlm, "check_auth", fake)
    r = client.get("/py/notebooklm/auth-status", headers=H)
    assert r.status_code == 200
    assert r.json()["status"] == "expired"


def test_check_auth_no_auth_when_storage_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(nlm, "_storage_path", lambda: tmp_path / "missing.json")
    res = asyncio.run(nlm.check_auth())
    assert res["status"] == "no_auth"
    assert res["login_command"].endswith("login")
    # Short relative command (not an absolute path) + the cwd it resolves against.
    assert not res["login_command"].startswith("/")
    assert res["login_cwd"].endswith("notebooklm")
    assert "profile" in res
