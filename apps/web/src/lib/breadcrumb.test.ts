import { describe, expect, it } from "vitest";
import { breadcrumbTitle } from "./breadcrumb";

describe("breadcrumbTitle", () => {
  it("maps known sections + pages to friendly labels", () => {
    expect(breadcrumbTitle("/watching/overview")).toBe("Watching / Overview");
    expect(breadcrumbTitle("/watching/knowledge/")).toBe("Watching / Knowledge");
    expect(breadcrumbTitle("/guarding/global-rules")).toBe("Guarding / Global Rules");
    expect(breadcrumbTitle("/guarding/claude-md")).toBe("Guarding / CLAUDE.md");
  });

  it("shows location for routes that used to fall back to 'Haetae Console'", () => {
    expect(breadcrumbTitle("/watching/sessions/")).toBe("Watching / Sessions");
    expect(breadcrumbTitle("/watching/memories/")).toBe("Watching / Memories");
    expect(breadcrumbTitle("/watching/graph/")).toBe("Watching / Graph");
    expect(breadcrumbTitle("/watching/voice/")).toBe("Watching / Voice");
  });

  it("includes the dynamic slug for project pages", () => {
    expect(breadcrumbTitle("/projects/my-app")).toBe("Projects / my-app");
  });

  it("truncates a long opaque id (session detail)", () => {
    expect(breadcrumbTitle("/watching/sessions/95e58b90-f62f-488a")).toBe(
      "Watching / Sessions / 95e58b90…",
    );
  });

  it("falls back to the console label only at root", () => {
    expect(breadcrumbTitle("/")).toBe("Haetae Console");
    expect(breadcrumbTitle("")).toBe("Haetae Console");
  });
});
