import { type FastifyInstance } from "fastify";

/**
 * Localhost hardening for a personal, loopback-bound server.
 *
 * The server binds 127.0.0.1, but that alone does not stop a malicious web
 * page the user visits from POSTing to http://127.0.0.1:3001 (CSRF) or from a
 * DNS-rebinding attack that points an attacker domain at 127.0.0.1. Either can
 * trigger state-changing endpoints — and HAETAE writes files (.claude/CLAUDE.md)
 * and spawns processes (claude --print), so that matters.
 *
 * Defenses (cheap, no auth needed for a single-user local tool):
 *  - Host header must resolve to loopback → defeats DNS rebinding (the rebound
 *    request carries the attacker's domain in Host, not 127.0.0.1).
 *  - Origin header, when present, must be loopback → defeats cross-origin
 *    browser requests (CSRF). Absent Origin (curl, native clients, same-origin
 *    GETs) is allowed.
 *
 * Port is ignored so the Vite dev proxy (5173 → 3001, changeOrigin) and the
 * production single-origin mode both pass.
 */

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * True if the header value's hostname is loopback. Accepts "host:port",
 * "[::1]:port", or a full origin URL. Absent/empty → true (non-browser client).
 */
export function isLoopbackHost(value?: string): boolean {
  if (!value) return true;
  let host = value.trim();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return false;
    }
  }
  // Strip brackets (IPv6) or a trailing :port (IPv4/hostname).
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end !== -1) host = host.slice(1, end);
  } else if (host.split(":").length === 2) {
    // exactly one colon → host:port (not bare IPv6 like "::1")
    host = host.slice(0, host.indexOf(":"));
  }
  return LOOPBACK.has(host);
}

export interface RequestAssessment {
  allowed: boolean;
  reason?: string;
}

/** Pure policy: decide whether a request's Host/Origin are local-safe. */
export function assessLocalRequest(host?: string, origin?: string): RequestAssessment {
  if (!isLoopbackHost(host)) return { allowed: false, reason: "non-loopback Host (DNS rebinding?)" };
  if (origin && !isLoopbackHost(origin)) return { allowed: false, reason: "cross-origin request (CSRF?)" };
  return { allowed: true };
}

/** Register the onRequest guard. Rejects non-local requests with 403. */
export function registerLocalGuard(app: FastifyInstance): void {
  app.addHook("onRequest", async (req, reply) => {
    const { allowed, reason } = assessLocalRequest(req.headers.host, req.headers.origin);
    if (!allowed) {
      app.log.warn(
        { host: req.headers.host, origin: req.headers.origin, url: req.url, reason },
        "blocked non-local request",
      );
      await reply.code(403).send({ error: "forbidden", reason });
    }
  });
}
