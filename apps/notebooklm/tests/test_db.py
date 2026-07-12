"""DB mirror tests — isolated to a temp SQLite path."""

from dataclasses import dataclass

import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", tmp_path / "test.db")
    from app import db

    db.init_db()
    return db


@dataclass
class FakeNb:
    id: str
    title: str
    is_owner: bool
    created_at: str | None
    sources_count: int


@dataclass
class FakeSrc:
    id: str
    title: str
    url: str | None
    status: int


def test_upsert_and_get_notebook(temp_db):
    db = temp_db
    conn = db._connect()
    db.upsert_notebook(conn, FakeNb("nb1", "First", True, "2026-06-04", 3), db.now_ms())
    conn.commit()
    conn.close()
    rows = db.get_notebooks()
    assert len(rows) == 1
    assert rows[0]["title"] == "First"
    assert rows[0]["is_owner"] == 1


def test_upsert_notebook_idempotent(temp_db):
    db = temp_db
    conn = db._connect()
    db.upsert_notebook(conn, FakeNb("nb1", "A", True, None, 1), db.now_ms())
    db.upsert_notebook(conn, FakeNb("nb1", "B", True, None, 2), db.now_ms())
    conn.commit()
    conn.close()
    rows = db.get_notebooks()
    assert len(rows) == 1 and rows[0]["title"] == "B"  # updated, not duplicated


def test_sources_and_qa(temp_db):
    db = temp_db
    conn = db._connect()
    db.upsert_source(conn, "nb1", FakeSrc("s1", "Doc", "http://x", 1), db.now_ms())
    conn.commit()
    conn.close()
    assert db.get_sources("nb1")[0]["title"] == "Doc"

    db.insert_qa("nb1", "Q?", "A.")
    qa = db.get_qa("nb1")
    assert len(qa) == 1 and qa[0]["question"] == "Q?"
