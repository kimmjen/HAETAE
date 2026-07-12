"""Wrapper over notebooklm-py (ADR 0010).

Uses the library directly (NotebookLMClient.from_storage) — no CLI subprocess,
so the interactive prompts that broke the Node CLI path (e.g. `ask --new` [y/N])
don't exist. A module-level asyncio.Semaphore caps concurrent calls (the Python
equivalent of claude-cli.ts MAX_CONCURRENT) so burst clicks can't fan out.

Auth comes from the shared ~/.notebooklm/profiles/<profile> storage, reused as-is.
NotebookLmError maps failures to stable kinds for the route layer (→ HTTP).
"""

import asyncio
import sys
from dataclasses import dataclass
from pathlib import Path

import notebooklm

from app.config import settings

_sem = asyncio.Semaphore(settings.max_concurrent)


class NotebookLmError(Exception):
    """kind ∈ {not_installed, auth, failed}. Mirrors the Node service contract."""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


@dataclass
class NotebookDTO:
    id: str
    title: str
    is_owner: bool
    created_at: str | None
    sources_count: int


@dataclass
class SourceDTO:
    id: str
    title: str
    url: str | None
    status: int


def _is_auth_error(exc: Exception) -> bool:
    # notebooklm.AuthError / AuthExtractionError, or message hints.
    if isinstance(exc, (notebooklm.AuthError, notebooklm.AuthExtractionError)):
        return True
    msg = str(exc).lower()
    return any(m in msg for m in ("auth", "login", "expired", "unauthor", "redirect"))


def _wrap(exc: Exception) -> NotebookLmError:
    if _is_auth_error(exc):
        return NotebookLmError("auth", "NotebookLM 인증이 만료됐습니다. 재로그인 후 다시 시도하세요.")
    return NotebookLmError("failed", str(exc)[:500])


async def _with_client(fn):
    """Open a storage-auth client, run fn(client), translate errors."""
    async with _sem:
        try:
            async with notebooklm.NotebookLMClient.from_storage(
                profile=settings.profile
            ) as client:
                return await fn(client)
        except NotebookLmError:
            raise
        except Exception as exc:  # noqa: BLE001 — translate everything to a stable shape
            raise _wrap(exc) from exc


def _notebook_dto(n: "notebooklm.Notebook") -> NotebookDTO:
    return NotebookDTO(
        id=n.id,
        title=n.title or "",
        is_owner=n.is_owner,
        created_at=n.created_at.isoformat() if n.created_at else None,
        sources_count=n.sources_count,
    )


def _source_dto(s: "notebooklm.Source") -> SourceDTO:
    return SourceDTO(id=s.id, title=s.title or "", url=s.url, status=s.status)


def _storage_path() -> Path:
    return Path(f"~/.notebooklm/profiles/{settings.profile}/storage_state.json").expanduser()


def login_cwd() -> str:
    """The app dir (parent of the venv) — the integrated terminal spawns here so
    the login command can be a SHORT relative path. Uses sys.prefix (the venv
    dir; NOT symlink-resolved, unlike sys.executable which points at the base
    interpreter under pyenv)."""
    return str(Path(sys.prefix).parent)


def login_command() -> str:
    """(Re-)auth command, RELATIVE to login_cwd. Kept short on purpose: a long
    absolute path wraps in the terminal and a stray fragment (e.g. 'bin/python3
    …') can run after login."""
    venv = Path(sys.prefix).name  # ".venv"
    return f"{venv}/bin/python3 -m notebooklm --profile {settings.profile} login"


async def check_auth() -> dict:
    """Probe whether the stored profile can make an authenticated call, so
    Settings can show status without provoking a failed sync.

    status ∈ {ok, no_auth, expired, error}. A real notebooks.list() is the
    truthy signal — a stale cookie file still parses, so file existence alone
    is trusted only to tell 'never logged in' apart from a live check."""
    base = {"profile": settings.profile, "login_command": login_command(), "login_cwd": login_cwd()}
    if not _storage_path().exists():
        return {"status": "no_auth", **base}
    try:
        await _with_client(lambda c: c.notebooks.list())
    except NotebookLmError as err:
        return {"status": "expired" if err.kind == "auth" else "error", "detail": str(err), **base}
    return {"status": "ok", **base}


async def list_notebooks() -> list[NotebookDTO]:
    return await _with_client(lambda c: _list_notebooks(c))


async def _list_notebooks(client) -> list[NotebookDTO]:
    return [_notebook_dto(n) for n in await client.notebooks.list()]


async def list_sources(notebook_id: str) -> list[SourceDTO]:
    return await _with_client(lambda c: _list_sources(c, notebook_id))


async def _list_sources(client, notebook_id: str) -> list[SourceDTO]:
    return [_source_dto(s) for s in await client.sources.list(notebook_id)]


async def ask(notebook_id: str, question: str) -> str:
    """Grounded answer with inline citations. Continues the notebook's
    conversation (library handles it; no interactive prompt)."""
    return await _with_client(lambda c: _ask(c, notebook_id, question))


async def _ask(client, notebook_id: str, question: str) -> str:
    result = await client.chat.ask(notebook_id, question)
    return result.answer
