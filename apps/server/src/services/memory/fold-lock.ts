import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "../../db/path";

/**
 * The single cross-process fold lock. Wiki folds are heavy LLM runs and can be
 * started from TWO different processes — the SessionEnd hook (brain-update.ts)
 * and the HTTP server's auto scheduler (auto-wiki.ts) — so both must acquire
 * THIS lock before folding. One fold at a time, machine-wide.
 *
 * Acquisition is atomic (O_EXCL). A holder is presumed dead when its heartbeat
 * is older than LOCK_STALE_MS or its pid no longer exists; the lock is then
 * reclaimed. Data is safe either way (the watermark makes a duplicate fold a
 * lossless no-op) — this lock exists to bound COST, not to protect integrity.
 */

/** No heartbeat for this long ⇒ the holding fold is treated as dead. A live
 *  fold touches the lock every HEARTBEAT_MS, so this only needs to exceed a
 *  couple of missed beats. */
const LOCK_STALE_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 60_000;

export function foldLockPath(): string {
  return path.join(getDataDir(), "brain-fold.lock");
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process (dead); EPERM = exists but not ours (alive).
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export interface FoldLock {
  release: () => void;
}

/**
 * Try to acquire the global fold lock. Returns a handle (with heartbeat armed)
 * or null when another LIVE fold holds it. Never throws.
 */
export function acquireFoldLock(lockFile: string = foldLockPath()): FoldLock | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockFile, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      const heartbeat = setInterval(() => {
        try {
          fs.utimesSync(lockFile, new Date(), new Date());
        } catch {
          /* ignore */
        }
      }, HEARTBEAT_MS);
      heartbeat.unref();
      return {
        release: () => {
          clearInterval(heartbeat);
          try {
            fs.unlinkSync(lockFile);
          } catch {
            /* ignore */
          }
        },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") return null;
      let dead = false;
      try {
        const st = fs.statSync(lockFile);
        const pid = Number(fs.readFileSync(lockFile, "utf8").trim()) || 0;
        dead = Date.now() - st.mtimeMs > LOCK_STALE_MS || (pid > 0 && !pidAlive(pid));
      } catch {
        dead = true; // can't stat/read ⇒ reclaimable
      }
      if (!dead) return null;
      try {
        fs.unlinkSync(lockFile);
      } catch {
        /* another process reclaimed it first — loop retries */
      }
    }
  }
  return null;
}
