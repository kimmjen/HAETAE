import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { usageEvents } from "../../db/schema";
import { repriceUsageEvents } from "./reprice";

let db: Db;

beforeEach(() => {
  db = openDb({ filePath: ":memory:" });
  runMigrations(db);
});
afterEach(() => closeDb());

/** One billable message. `costUsdMicro` is what the indexer froze at the time. */
function seed(opts: {
  messageId: string;
  model: string;
  costUsdMicro: number;
  input?: number;
  output?: number;
}) {
  db.insert(usageEvents)
    .values({
      sessionId: "s1",
      messageId: opts.messageId,
      projectPath: "/p",
      model: opts.model,
      ts: 1,
      inputTokens: opts.input ?? 1_000_000,
      outputTokens: opts.output ?? 1_000_000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      costUsdMicro: opts.costUsdMicro,
    })
    .run();
}

function storedCost(messageId: string): number {
  return db.select().from(usageEvents).all().find((r) => r.messageId === messageId)!.costUsdMicro;
}

describe("repriceUsageEvents", () => {
  it("reports the correction without touching the DB when apply is false", () => {
    // Sonnet 5 frozen at the old 4.x rate: 1M in + 1M out billed as $18.
    seed({ messageId: "m1", model: "claude-sonnet-5", costUsdMicro: 18_000_000 });

    const out = repriceUsageEvents(db, false);

    expect(out.scanned).toBe(1);
    expect(out.changed).toBe(1);
    expect(out.deltaMicro).toBe(-6_000_000); // $18 → $12
    expect(storedCost("m1")).toBe(18_000_000); // dry run wrote nothing
  });

  it("writes the corrected cost when apply is true", () => {
    seed({ messageId: "m1", model: "claude-sonnet-5", costUsdMicro: 18_000_000 });

    expect(repriceUsageEvents(db, true).changed).toBe(1);
    expect(storedCost("m1")).toBe(12_000_000);
  });

  it("leaves rows whose stored cost already matches current rates", () => {
    // Sonnet 4.6 was never mispriced — $3 + $15 = $18.
    seed({ messageId: "m1", model: "claude-sonnet-4-6", costUsdMicro: 18_000_000 });

    const out = repriceUsageEvents(db, true);

    expect(out.scanned).toBe(1);
    expect(out.changed).toBe(0);
    expect(out.deltaMicro).toBe(0);
  });

  it("raises rows that were billed at zero under an unknown family", () => {
    // Fable used to fall through to `unknown` and cost nothing.
    seed({ messageId: "m1", model: "claude-fable-5", costUsdMicro: 0 });

    const out = repriceUsageEvents(db, true);

    expect(out.changed).toBe(1);
    expect(storedCost("m1")).toBe(60_000_000); // $10 + $50
  });

  it("breaks the correction down per model", () => {
    seed({ messageId: "m1", model: "claude-sonnet-5", costUsdMicro: 18_000_000 });
    seed({ messageId: "m2", model: "claude-sonnet-5", costUsdMicro: 18_000_000 });
    seed({ messageId: "m3", model: "claude-opus-5", costUsdMicro: 30_000_000 });

    const out = repriceUsageEvents(db, false);

    expect(out.byModel["claude-sonnet-5"]).toEqual({ changed: 2, deltaMicro: -12_000_000 });
    expect(out.byModel["claude-opus-5"]).toBeUndefined(); // unchanged models omitted
  });

  it("is idempotent — a second pass finds nothing left to correct", () => {
    seed({ messageId: "m1", model: "claude-sonnet-5", costUsdMicro: 18_000_000 });

    repriceUsageEvents(db, true);

    expect(repriceUsageEvents(db, true).changed).toBe(0);
  });
});
