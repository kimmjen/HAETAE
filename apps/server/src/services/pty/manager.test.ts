import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PtyManager, type IPty, type SpawnFn } from "./manager";

interface MockPtyState {
  data: ((d: string) => void)[];
  exit: ((e: { exitCode: number; signal?: number }) => void)[];
  writes: string[];
  resizes: Array<{ cols: number; rows: number }>;
  killed: boolean;
  killSignal?: string;
}

function makeMock(): { pty: IPty; state: MockPtyState } {
  const state: MockPtyState = {
    data: [],
    exit: [],
    writes: [],
    resizes: [],
    killed: false,
  };
  const pty: IPty = {
    pid: 1234,
    onData: (cb) => {
      state.data.push(cb);
      return { dispose: () => undefined };
    },
    onExit: (cb) => {
      state.exit.push(cb);
      return { dispose: () => undefined };
    },
    write: (data) => {
      state.writes.push(data);
    },
    resize: (cols, rows) => {
      state.resizes.push({ cols, rows });
    },
    kill: (signal) => {
      state.killed = true;
      state.killSignal = signal;
    },
  };
  return { pty, state };
}

function spawnFnReturning(pty: IPty): SpawnFn {
  return () => pty;
}

describe("PtyManager", () => {
  let mock: { pty: IPty; state: MockPtyState };
  let mgr: PtyManager;

  beforeEach(() => {
    mock = makeMock();
    mgr = new PtyManager(spawnFnReturning(mock.pty));
  });

  afterEach(() => {
    mgr.shutdown();
  });

  it("create returns a session with a UUID and stores it for lookup", () => {
    const s = mgr.create({ cwd: "/tmp" });
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mgr.get(s.id)).toBe(s);
    expect(s.cwd).toBe("/tmp");
  });

  it("write forwards to the underlying pty and bumps lastActivity", () => {
    const s = mgr.create({ cwd: "/tmp" });
    const before = s.lastActivity.getTime();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(before + 1000));
    mgr.write(s.id, "ls\n");
    expect(mock.state.writes).toEqual(["ls\n"]);
    expect(s.lastActivity.getTime()).toBeGreaterThan(before);
    vi.useRealTimers();
  });

  it("resize forwards dimensions to the pty", () => {
    const s = mgr.create({ cwd: "/tmp" });
    mgr.resize(s.id, 100, 30);
    expect(mock.state.resizes).toEqual([{ cols: 100, rows: 30 }]);
  });

  it("kill removes the session from the map", () => {
    const s = mgr.create({ cwd: "/tmp" });
    mgr.kill(s.id);
    expect(mgr.get(s.id)).toBeUndefined();
    expect(mock.state.killed).toBe(true);
  });

  it("write/resize on an unknown id are no-ops (no throw)", () => {
    expect(() => mgr.write("nope", "x")).not.toThrow();
    expect(() => mgr.resize("nope", 80, 24)).not.toThrow();
    expect(() => mgr.kill("nope")).not.toThrow();
  });

  it("cleanupIdle kills sessions past the idle limit", () => {
    const fastIdleMgr = new PtyManager(spawnFnReturning(mock.pty), 1000); // 1s
    const s = fastIdleMgr.create({ cwd: "/tmp" });
    const past = s.lastActivity.getTime() + 2000;
    expect(fastIdleMgr.cleanupIdle(past)).toEqual([s.id]);
    expect(fastIdleMgr.get(s.id)).toBeUndefined();
    fastIdleMgr.shutdown();
  });

  it("cleanupIdle keeps recent sessions alive", () => {
    const s = mgr.create({ cwd: "/tmp" });
    const justAfter = s.lastActivity.getTime() + 10;
    expect(mgr.cleanupIdle(justAfter)).toEqual([]);
    expect(mgr.get(s.id)).toBeDefined();
  });

  it("shutdown kills every active session", () => {
    const a = mgr.create({ cwd: "/tmp" });
    // create needs a fresh mock for the second session because the kill
    // toggles the shared state, but for "did we attempt to kill both"
    // the same mock is fine.
    const b = mgr.create({ cwd: "/tmp" });
    mgr.shutdown();
    expect(mgr.get(a.id)).toBeUndefined();
    expect(mgr.get(b.id)).toBeUndefined();
  });

  it("touch only updates lastActivity, doesn't write", () => {
    const s = mgr.create({ cwd: "/tmp" });
    const before = s.lastActivity.getTime();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(before + 500));
    mgr.touch(s.id);
    expect(s.lastActivity.getTime()).toBeGreaterThan(before);
    expect(mock.state.writes).toEqual([]);
    vi.useRealTimers();
  });
});
