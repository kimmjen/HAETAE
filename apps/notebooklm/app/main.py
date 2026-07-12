"""NotebookLM FastAPI service (ADR 0010).

A first-class Python app in the HAETAE monorepo. Wraps notebooklm-py directly
(library, not CLI) and mirrors data into its own SQLite. The web frontend reaches
it same-origin via the Vite (dev) / Fastify (prod) `/py` proxy; this service also
enforces a loopback-only guard for defense-in-depth.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import db
from app.guard import LocalGuardMiddleware
from app.routes.notebooklm import router as notebooklm_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="HAETAE NotebookLM", docs_url=None, redoc_url=None, lifespan=lifespan)
app.add_middleware(LocalGuardMiddleware)
app.include_router(notebooklm_router, prefix="/py/notebooklm")
