import type { FastifyInstance } from "fastify";
import websocketPlugin from "@fastify/websocket";
import { getDb } from "../db";
import {
  CwdInvalidError,
  CwdNotAllowedError,
  getPtyManager,
  validateCwd,
  type PtyManager,
} from "../services/pty";
import type { Db } from "../db";

interface ClientInputMessage {
  type: "input";
  data: string;
}

interface ClientResizeMessage {
  type: "resize";
  cols: number;
  rows: number;
}

type ClientMessage = ClientInputMessage | ClientResizeMessage;

interface QueryString {
  cwd?: string;
  cols?: string;
  rows?: string;
}

export interface TerminalRoutesOptions {
  /** Override the PtyManager (for tests). Defaults to the singleton. */
  manager?: PtyManager;
  /** Override the DB used by validateCwd (tests pass an in-memory one). */
  db?: Db;
}

const CLOSE_INVALID_CWD = 4400;
const CLOSE_FORBIDDEN_CWD = 4403;
const CLOSE_INTERNAL = 4500;

/**
 * Phase 3 WebSocket entry point: one connection = one PTY session.
 *
 * Handshake: client opens `/ws/terminal?cwd=&cols=&rows=`. The server
 * validates cwd against the project_roots whitelist (P2.5 + claude home),
 * spawns a PTY, and pipes data both ways as JSON envelopes:
 *
 *   C→S  {type:'input',  data: string}
 *   C→S  {type:'resize', cols: number, rows: number}
 *   S→C  {type:'output', data: string}
 *   S→C  {type:'exit',   exitCode: number}
 *
 * The PTY is killed on close (whether the client disconnects or the
 * shell exits first).
 */
export async function registerTerminalRoutes(
  app: FastifyInstance,
  options: TerminalRoutesOptions = {},
): Promise<void> {
  await app.register(websocketPlugin);

  const manager = options.manager ?? getPtyManager();

  app.get<{ Querystring: QueryString }>(
    "/ws/terminal",
    { websocket: true },
    async (socket, req) => {
      const { cwd, cols, rows } = req.query as QueryString;

      const colsParsed = parseDimension(cols, 80);
      const rowsParsed = parseDimension(rows, 24);

      let resolvedCwd: string;
      try {
        resolvedCwd = await validateCwd(cwd, {
          db: options.db ?? getDb(),
        });
      } catch (err) {
        const code =
          err instanceof CwdNotAllowedError
            ? CLOSE_FORBIDDEN_CWD
            : err instanceof CwdInvalidError
              ? CLOSE_INVALID_CWD
              : CLOSE_INTERNAL;
        socket.close(code, err instanceof Error ? err.message : "cwd check failed");
        return;
      }

      let session;
      try {
        session = manager.create({
          cwd: resolvedCwd,
          cols: colsParsed,
          rows: rowsParsed,
        });
      } catch (err) {
        app.log.error({ err }, "pty spawn failed");
        socket.close(CLOSE_INTERNAL, "pty spawn failed");
        return;
      }

      const sendOutput = (data: string) => {
        if (socket.readyState !== socket.OPEN) return;
        socket.send(JSON.stringify({ type: "output", data }));
      };

      const dataSub = session.pty.onData(sendOutput);
      const exitSub = session.pty.onExit((e) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: "exit", exitCode: e.exitCode }));
        }
        manager.kill(session.id);
        try {
          socket.close(1000, "pty exited");
        } catch {
          // socket already closed by client
        }
      });

      socket.on("message", (raw) => {
        let parsed: ClientMessage | null;
        try {
          parsed = JSON.parse(raw.toString()) as ClientMessage;
        } catch {
          return; // ignore malformed frames
        }
        if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return;

        if (parsed.type === "input" && typeof parsed.data === "string") {
          manager.write(session.id, parsed.data);
          return;
        }
        if (
          parsed.type === "resize" &&
          isPositiveInt(parsed.cols) &&
          isPositiveInt(parsed.rows)
        ) {
          manager.resize(session.id, parsed.cols, parsed.rows);
          return;
        }
      });

      socket.on("close", () => {
        dataSub.dispose();
        exitSub.dispose();
        manager.kill(session.id);
      });
    },
  );
}

function parseDimension(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 1000) return fallback;
  return Math.floor(n);
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n < 1000;
}
