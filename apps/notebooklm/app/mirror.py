"""Mirror NotebookLM → local SQLite (ADR 0010). Ported from the Node
mirror.ts. Upserts by NotebookLM's own ids so re-running refreshes."""

from app import db
from app import notebooklm_client as nlm


async def sync() -> dict[str, int]:
    """Pull notebooks + their sources into the local mirror."""
    notebooks = await nlm.list_notebooks()
    now = db.now_ms()
    conn = db._connect()
    source_count = 0
    try:
        for nb in notebooks:
            db.upsert_notebook(conn, nb, now)
        conn.commit()
        for nb in notebooks:
            try:
                sources = await nlm.list_sources(nb.id)
            except nlm.NotebookLmError:
                continue  # one notebook's sources failing must not abort the sync
            for s in sources:
                db.upsert_source(conn, nb.id, s, now)
                source_count += 1
        conn.commit()
    finally:
        conn.close()
    return {"notebooks": len(notebooks), "sources": source_count}


async def ask_and_store(notebook_id: str, question: str) -> str:
    answer = await nlm.ask(notebook_id, question)
    db.insert_qa(notebook_id, question, answer)
    return answer
