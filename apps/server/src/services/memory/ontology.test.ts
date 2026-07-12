import { describe, expect, it } from "vitest";
import { parseOntology, ontologyToGraph, buildPrompt } from "./ontology";

describe("buildPrompt — concept id stability", () => {
  it("omits the existing-ids block on first generation", () => {
    expect(buildPrompt("proj", "wiki")).not.toContain("EXISTING CONCEPT IDS");
  });
  it("passes prior ids and instructs reuse on regeneration", () => {
    const p = buildPrompt("proj", "wiki", [{ id: "oauth", label: "인증" }]);
    expect(p).toContain("EXISTING CONCEPT IDS");
    expect(p).toContain("oauth: 인증");
    expect(p).toMatch(/[Rr]euse an existing id/);
  });
});

describe("parseOntology", () => {
  const good = JSON.stringify({
    concepts: [
      { id: "wiki", label: "증분 위키", kind: "component" },
      { id: "watermark", label: "워터마크", kind: "decision" },
      { id: "rag", label: "RAG", kind: "tech" },
    ],
    relations: [
      { source: "watermark", target: "wiki", type: "supports", note: "증분 경계" },
      { source: "wiki", target: "rag", type: "contradicts" },
    ],
  });

  it("parses concepts and relations from fenced JSON", () => {
    const o = parseOntology("```json\n" + good + "\n```");
    expect(o.concepts.map((c) => c.id).sort()).toEqual(["rag", "watermark", "wiki"]);
    expect(o.relations).toHaveLength(2);
  });

  it("drops relations referencing unknown concept ids", () => {
    const raw = JSON.stringify({
      concepts: [{ id: "a", label: "A", kind: "tech" }],
      relations: [{ source: "a", target: "ghost", type: "supports" }],
    });
    expect(parseOntology(raw).relations).toHaveLength(0);
  });

  it("drops relations with an invalid type or self-loops", () => {
    const raw = JSON.stringify({
      concepts: [
        { id: "a", label: "A", kind: "tech" },
        { id: "b", label: "B", kind: "tech" },
      ],
      relations: [
        { source: "a", target: "b", type: "bogus" },
        { source: "a", target: "a", type: "supports" },
      ],
    });
    expect(parseOntology(raw).relations).toHaveLength(0);
  });

  it("dedups identical relations", () => {
    const raw = JSON.stringify({
      concepts: [
        { id: "a", label: "A", kind: "tech" },
        { id: "b", label: "B", kind: "tech" },
      ],
      relations: [
        { source: "a", target: "b", type: "supports" },
        { source: "a", target: "b", type: "supports" },
      ],
    });
    expect(parseOntology(raw).relations).toHaveLength(1);
  });
});

describe("ontologyToGraph", () => {
  it("maps concepts→nodes (kind color) and relations→typed edges (label+color)", () => {
    const g = ontologyToGraph({
      concepts: [
        { id: "a", label: "A", kind: "decision" },
        { id: "b", label: "B", kind: "tech" },
      ],
      relations: [{ source: "a", target: "b", type: "contradicts" }],
    });
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["concept:a", "concept:b"]);
    expect(g.nodes.find((n) => n.id === "concept:a")!.color).toBe("#ef4444"); // decision
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].label).toBe("반박"); // contradicts
    expect(g.edges[0].color).toBe("#ef4444");
    expect(g.edges[0].type).toBe("relation");
  });

  it("sizes concept nodes by relation degree", () => {
    const g = ontologyToGraph({
      concepts: [
        { id: "hub", label: "Hub", kind: "component" },
        { id: "x", label: "X", kind: "tech" },
        { id: "y", label: "Y", kind: "tech" },
      ],
      relations: [
        { source: "hub", target: "x", type: "part_of" },
        { source: "hub", target: "y", type: "part_of" },
      ],
    });
    const hub = g.nodes.find((n) => n.id === "concept:hub")!;
    const leaf = g.nodes.find((n) => n.id === "concept:x")!;
    expect(hub.size).toBeGreaterThan(leaf.size);
  });
});
