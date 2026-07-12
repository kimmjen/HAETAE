import { randomUUID } from "node:crypto";
import * as nodePty from "node-pty";

/**
 * Minimal IPty subset we depend on. node-pty's IPty has more, but tests
 * mock against this contract — keeps the surface small.
 */
export interface IPty {
  pid: number;
  onData(cb: (data: string) => void): { dispose: () => void };
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): { dispose: () => void };
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export interface SpawnOptions {
  cwd: string;
  cols?: number;
  rows?: number;
  shell?: string;
  env?: NodeJS.ProcessEnv;
}

export interface PtySession {
  id: string;
  pty: IPty;
  cwd: string;
  shell: string;
  createdAt: Date;
  lastActivity: Date;
}

/** Injectable spawn function. Real default is node-pty.spawn. */
export type SpawnFn = (
  shell: string,
  args: string[],
  options: nodePty.IPtyForkOptions,
) => IPty;

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_IDLE_LIMIT_MS = 5 * 60 * 1000;

/**
 * Owns the live PTY sessions for the server. Each session is keyed by a
 * UUID handed back to the caller — typically the WebSocket route stores
 * the id alongside the connection so it can route input/output.
 *
 * The cleanup interval kills sessions that have been quiet for longer
 * than `idleLimitMs` (default 5 minutes). `lastActivity` is bumped on
 * input/output/resize.
 */
export class PtyManager {
  private readonly sessions = new Map<string, PtySession>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly spawnFn: SpawnFn = nodePty.spawn,
    private readonly idleLimitMs: number = DEFAULT_IDLE_LIMIT_MS,
  ) {}

  create(opts: SpawnOptions): PtySession {
    const shell = opts.shell ?? defaultShell();
    const pty = this.spawnFn(shell, [], {
      name: "xterm-256color",
      cols: opts.cols ?? DEFAULT_COLS,
      rows: opts.rows ?? DEFAULT_ROWS,
      cwd: opts.cwd,
      env: opts.env ?? (process.env as NodeJS.ProcessEnv),
    });

    const session: PtySession = {
      id: randomUUID(),
      pty,
      cwd: opts.cwd,
      shell,
      createdAt: new Date(),
      lastActivity: new Date(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): PtySession | undefined {
    return this.sessions.get(id);
  }

  /** Latest activity timestamp gets bumped to "now" for cleanup. */
  touch(id: string): void {
    const s = this.sessions.get(id);
    if (s) s.lastActivity = new Date();
  }

  write(id: string, data: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    s.pty.write(data);
    s.lastActivity = new Date();
  }

  resize(id: string, cols: number, rows: number): void {
    const s = this.sessions.get(id);
    if (!s) return;
    s.pty.resize(cols, rows);
    s.lastActivity = new Date();
  }

  kill(id: string, signal?: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    try {
      s.pty.kill(signal);
    } catch {
      // PTY may already be gone. Drop it from the map either way.
    }
    this.sessions.delete(id);
  }

  list(): PtySession[] {
    return [...this.sessions.values()];
  }

  /** Start the periodic cleanup of idle sessions. */
  startCleanupInterval(intervalMs: number = 60_000): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanupIdle(), intervalMs);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  stopCleanupInterval(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  /** Visible for testing — iterates and kills sessions past the idle limit. */
  cleanupIdle(now: number = Date.now()): string[] {
    const killed: string[] = [];
    for (const [id, s] of this.sessions) {
      if (now - s.lastActivity.getTime() > this.idleLimitMs) {
        this.kill(id);
        killed.push(id);
      }
    }
    return killed;
  }

  /** Kill every session — used by tests + graceful shutdown. */
  shutdown(): void {
    this.stopCleanupInterval();
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }
}

function defaultShell(): string {
  const env = process.env.SHELL;
  if (env && env.length > 0) return env;
  if (process.platform === "win32") return "powershell.exe";
  return "/bin/zsh";
}

let cached: PtyManager | null = null;

/** Singleton accessor used by routes. Tests construct their own instance. */
export function getPtyManager(): PtyManager {
  if (!cached) {
    cached = new PtyManager();
    cached.startCleanupInterval();
  }
  return cached;
}

/** Reset the singleton (test-only escape hatch). */
export function resetPtyManager(): void {
  if (cached) cached.shutdown();
  cached = null;
}
