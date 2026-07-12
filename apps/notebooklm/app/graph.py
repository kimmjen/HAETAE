"""Build a second-brain graph from the NotebookLM mirror (ADR 0010, option B).

Mirrors the shape of HAETAE's ProjectGraphData ({nodes, edges}) and the
node-id / degree-size conventions of notesToGraph / ontologyToGraph so the
existing GraphCanvas renders it unchanged. NotebookLM is user-global (not
project-scoped), so this is a standalone graph surface.

Nodes:  notebook:<id>           type "notebook"
        source:<nbid>:<sid>     type "source"
Edges:  contains   notebook → its sources
        shared     notebook ↔ notebook when they share a source (by url, else title)
"""

NOTEBOOK_COLOR = "#ec4899"  # pink — distinct from note(amber)/concept(by-kind)
SOURCE_COLOR = "#0891b2"    # cyan
CONTAINS_COLOR = "#6b728055"
SHARED_COLOR = "#ec489988"


def _clamp_size(degree: int, base: int = 5) -> int:
    return max(base, min(18, base + degree * 2))


def build_graph(notebooks: list[dict], sources: list[dict]) -> dict:
    """Pure transform: mirror rows → {nodes, edges}. No DB access (testable)."""
    nodes: list[dict] = []
    edges: list[dict] = []

    # source count per notebook → notebook node size
    src_by_nb: dict[str, list[dict]] = {}
    for s in sources:
        src_by_nb.setdefault(s["notebook_id"], []).append(s)

    for nb in notebooks:
        nb_id = nb["notebook_id"]
        count = len(src_by_nb.get(nb_id, []))
        nodes.append(
            {
                "id": f"notebook:{nb_id}",
                "type": "notebook",
                "label": nb.get("title") or "(제목 없음)",
                "size": _clamp_size(count),
                "color": NOTEBOOK_COLOR,
            }
        )

    for s in sources:
        nb_id = s["notebook_id"]
        sid = s["source_id"]
        nodes.append(
            {
                "id": f"source:{nb_id}:{sid}",
                "type": "source",
                "label": s.get("title") or sid,
                "size": 5,
                "color": SOURCE_COLOR,
            }
        )
        edges.append(
            {
                "id": f"contains:{nb_id}:{sid}",
                "source": f"notebook:{nb_id}",
                "target": f"source:{nb_id}:{sid}",
                "weight": 1.0,
                "type": "contains",
                "color": CONTAINS_COLOR,
            }
        )

    # notebook ↔ notebook when they share a source (key = url, fallback title)
    key_to_nbs: dict[str, set[str]] = {}
    for s in sources:
        key = (s.get("url") or s.get("title") or "").strip().lower()
        if not key:
            continue
        key_to_nbs.setdefault(key, set()).add(s["notebook_id"])

    seen_pairs: set[tuple[str, str]] = set()
    for nbs in key_to_nbs.values():
        ordered = sorted(nbs)
        for i in range(len(ordered)):
            for j in range(i + 1, len(ordered)):
                pair = (ordered[i], ordered[j])
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                edges.append(
                    {
                        "id": f"shared:{pair[0]}:{pair[1]}",
                        "source": f"notebook:{pair[0]}",
                        "target": f"notebook:{pair[1]}",
                        "weight": 2.0,
                        "type": "shared",
                        "color": SHARED_COLOR,
                    }
                )

    return {"nodes": nodes, "edges": edges}
