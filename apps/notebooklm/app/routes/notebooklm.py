"""NotebookLM routes (ADR 0010). Mounted at /py/notebooklm.

Errors from the notebooklm-py wrapper carry a `kind` mapped to HTTP status
(same contract as the old Node routes): auth → 401, failed → 502.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db, graph, mirror
from app import notebooklm_client as nlm

router = APIRouter()


class AskBody(BaseModel):
    question: str = ""


def _http_from(err: nlm.NotebookLmError) -> HTTPException:
    status = 401 if err.kind == "auth" else 503 if err.kind == "not_installed" else 502
    return HTTPException(status_code=status, detail={"error": str(err), "kind": err.kind})


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/auth-status")
async def auth_status() -> dict:
    """Probe NotebookLM auth so Settings can show status (+ a ready-to-run login
    command) without first provoking a failed sync. Never raises — the status
    field carries ok / no_auth / expired / error."""
    return await nlm.check_auth()


@router.get("/notebooks")
async def list_notebooks() -> dict:
    return {"notebooks": db.get_notebooks()}


@router.get("/notebooks/{notebook_id}/sources")
async def list_sources(notebook_id: str) -> dict:
    return {"sources": db.get_sources(notebook_id)}


@router.get("/notebooks/{notebook_id}/qa")
async def list_qa(notebook_id: str) -> dict:
    return {"qa": db.get_qa(notebook_id)}


@router.get("/graph")
async def get_graph() -> dict:
    """Second-brain graph of mirrored notebooks/sources (ADR 0010, option B)."""
    return graph.build_graph(db.get_notebooks(), db.get_sources_all())


@router.post("/sync")
async def sync() -> dict:
    try:
        result = await mirror.sync()
        return {"ok": True, **result}
    except nlm.NotebookLmError as err:
        raise _http_from(err) from err


@router.post("/notebooks/{notebook_id}/ask")
async def ask(notebook_id: str, body: AskBody) -> dict:
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail={"error": "question is required"})
    try:
        answer = await mirror.ask_and_store(notebook_id, question)
        return {"answer": answer}
    except nlm.NotebookLmError as err:
        raise _http_from(err) from err
