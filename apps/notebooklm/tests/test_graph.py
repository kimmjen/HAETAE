"""Tests for the NotebookLM graph builder (pure transform)."""

from app.graph import build_graph


def _nb(nid, title="t"):
    return {"notebook_id": nid, "title": title}


def _src(nid, sid, title="s", url=None):
    return {"notebook_id": nid, "source_id": sid, "title": title, "url": url, "status": 1}


def test_notebook_and_source_nodes():
    g = build_graph([_nb("a", "A")], [_src("a", "s1", "Doc")])
    ids = {n["id"]: n for n in g["nodes"]}
    assert ids["notebook:a"]["type"] == "notebook"
    assert ids["notebook:a"]["label"] == "A"
    assert ids["source:a:s1"]["type"] == "source"
    assert ids["source:a:s1"]["label"] == "Doc"


def test_contains_edge():
    g = build_graph([_nb("a")], [_src("a", "s1")])
    contains = [e for e in g["edges"] if e["type"] == "contains"]
    assert len(contains) == 1
    assert contains[0]["source"] == "notebook:a"
    assert contains[0]["target"] == "source:a:s1"


def test_shared_edge_by_url():
    # two notebooks share a source url → one "shared" edge between them
    g = build_graph(
        [_nb("a"), _nb("b")],
        [_src("a", "s1", url="http://x"), _src("b", "s9", url="http://x")],
    )
    shared = [e for e in g["edges"] if e["type"] == "shared"]
    assert len(shared) == 1
    assert {shared[0]["source"], shared[0]["target"]} == {"notebook:a", "notebook:b"}


def test_no_shared_edge_when_no_overlap():
    g = build_graph(
        [_nb("a"), _nb("b")],
        [_src("a", "s1", url="http://x"), _src("b", "s2", url="http://y")],
    )
    assert [e for e in g["edges"] if e["type"] == "shared"] == []


def test_notebook_size_grows_with_sources():
    g = build_graph([_nb("a")], [_src("a", "s1"), _src("a", "s2"), _src("a", "s3")])
    nb = next(n for n in g["nodes"] if n["id"] == "notebook:a")
    assert nb["size"] > 5  # degree-based size
