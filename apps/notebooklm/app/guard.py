"""Loopback-only request guard — Python equivalent of
apps/server/src/security/local-guard.ts (ADR 0010, defense-in-depth).

The service binds 127.0.0.1, but that alone does not stop a malicious page the
user visits from POSTing here (CSRF) or a DNS-rebinding attack. So:
 - Host header must resolve to loopback (defeats DNS rebinding).
 - Origin header, when present, must be loopback (defeats cross-origin CSRF).
   Absent Origin (curl, native clients, same-origin GETs, the Vite/Fastify
   proxy with changeOrigin) is allowed.
Port is ignored so the dev/prod proxies pass.
"""

from urllib.parse import urlparse

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

LOOPBACK = {"127.0.0.1", "localhost", "::1"}


def is_loopback_host(value: str | None) -> bool:
    """True if the header value's hostname is loopback. Accepts "host:port",
    "[::1]:port", or a full origin URL. Absent/empty → True (non-browser client)."""
    if not value:
        return True
    host = value.strip()
    if "://" in host:
        parsed = urlparse(host).hostname
        if parsed is None:
            return False
        host = parsed
    elif host.startswith("["):
        end = host.find("]")
        if end != -1:
            host = host[1:end]
    elif host.count(":") == 1:
        # exactly one colon → host:port (not bare IPv6 like "::1")
        host = host.split(":", 1)[0]
    return host in LOOPBACK


def assess_local_request(host: str | None, origin: str | None) -> tuple[bool, str | None]:
    """Pure policy: decide whether a request's Host/Origin are local-safe."""
    if not is_loopback_host(host):
        return False, "non-loopback Host (DNS rebinding?)"
    if origin and not is_loopback_host(origin):
        return False, "cross-origin request (CSRF?)"
    return True, None


class LocalGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        host = request.headers.get("host")
        origin = request.headers.get("origin")
        allowed, reason = assess_local_request(host, origin)
        if not allowed:
            return JSONResponse({"error": "forbidden", "reason": reason}, status_code=403)
        return await call_next(request)
