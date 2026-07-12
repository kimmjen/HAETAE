"""SQLite mirror for NotebookLM (ADR 0010).

Python owns NotebookLM persistence now (ported from the Node Drizzle
notebooklm_* tables). Plain stdlib sqlite3 — small, single-writer, local.
NotebookLM is the source of truth; these tables are a durable snapshot taken on
explicit sync so the data survives cookie/session loss.
"""

import sqlite3
import time
from pathlib import Path

from app.config import settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS notebooks (
  notebook_id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  is_owner INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  sources_count INTEGER NOT NULL DEFAULT 0,
  mirrored_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
  notebook_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  url TEXT,
  status INTEGER,
  mirrored_at INTEGER NOT NULL,
  PRIMARY KEY (notebook_id, source_id)
);
CREATE TABLE IF NOT EXISTS qa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notebook_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  asked_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS qa_notebook_idx ON qa (notebook_id);
"""


def _connect() -> sqlite3.Connection:
    path: Path = settings.db_path
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = _connect()
    try:
        conn.executescript(_SCHEMA)
        conn.commit()
    finally:
        conn.close()


def upsert_notebook(conn, nb, now: int) -> None:
    conn.execute(
        """INSERT INTO notebooks (notebook_id, title, is_owner, created_at, sources_count, mirrored_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(notebook_id) DO UPDATE SET
             title=excluded.title, is_owner=excluded.is_owner,
             created_at=excluded.created_at, sources_count=excluded.sources_count,
             mirrored_at=excluded.mirrored_at""",
        (nb.id, nb.title, int(nb.is_owner), nb.created_at, nb.sources_count, now),
    )


def upsert_source(conn, notebook_id: str, s, now: int) -> None:
    conn.execute(
        """INSERT INTO sources (notebook_id, source_id, title, url, status, mirrored_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(notebook_id, source_id) DO UPDATE SET
             title=excluded.title, url=excluded.url, status=excluded.status,
             mirrored_at=excluded.mirrored_at""",
        (notebook_id, s.id, s.title, s.url, s.status, now),
    )


def get_notebooks() -> list[dict]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM notebooks ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_sources(notebook_id: str) -> list[dict]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM sources WHERE notebook_id = ?", (notebook_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_sources_all() -> list[dict]:
    """All sources across every notebook — used to build the graph and link
    notebooks that share a source (by url/title)."""
    conn = _connect()
    try:
        rows = conn.execute("SELECT * FROM sources").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def insert_qa(notebook_id: str, question: str, answer: str) -> None:
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO qa (notebook_id, question, answer, asked_at) VALUES (?, ?, ?, ?)",
            (notebook_id, question, answer, int(time.time() * 1000)),
        )
        conn.commit()
    finally:
        conn.close()


def get_qa(notebook_id: str) -> list[dict]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM qa WHERE notebook_id = ? ORDER BY asked_at DESC", (notebook_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def now_ms() -> int:
    return int(time.time() * 1000)
