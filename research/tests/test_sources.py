import io
import time
from pathlib import Path

from noether_engine.sources import arxiv, registry

FIX = Path(__file__).parent / "fixtures" / "arxiv_sample.xml"


def test_parse_atom_and_treat_text_as_data():
    total, entries = arxiv.parse_atom(FIX.read_text())
    assert total == 2 and entries[0].arxiv_id == "9999.00001" and entries[0].version == "v2"
    assert entries[0].title == "Fixture: a paper about Selmer groups"
    assert entries[0].doi == "10.0000/fixture.1" and entries[0].authors == ["A. Author", "B. Author"]
    # injected instructions in an abstract remain inert text
    assert "Ignore previous instructions" in entries[0].summary


def test_new_version_supersedes_and_keeps_old(conn):
    _, entries = arxiv.parse_atom(FIX.read_text())
    e = entries[0]
    old = arxiv.Entry(**{**e.__dict__, "version": "v1"})
    assert arxiv.upsert_entry(conn, old, "h1")[1] == "new"
    sid, kind = arxiv.upsert_entry(conn, e, "h2")
    assert kind == "new-version"
    rows = conn.execute("select id, superseded_by from source_document where arxiv_id='9999.00001' order by arxiv_version").fetchall()
    assert rows[0]["superseded_by"] == sid and len(rows) == 2


def test_shared_rate_limit_and_conditional_requests(conn, tmp_path, monkeypatch):
    monkeypatch.setattr(arxiv, "MIN_INTERVAL_MS", 400)
    conn.execute("insert into provider_quota(provider, min_interval_ms) values ('arxiv', 400) on conflict (provider) do update set min_interval_ms=400")
    seen = []

    class Resp(io.BytesIO):
        status = 200
        headers = {"ETag": '"abc"', "Last-Modified": "Mon, 01 Jan 2026 00:00:00 GMT"}
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def opener(req, timeout=30):
        seen.append((time.monotonic(), dict(req.header_items())))
        return Resp(FIX.read_bytes())

    c = arxiv.ArxivClient(conn, tmp_path, "test", opener=opener)
    c.search("abs:Selmer")
    c.search("abs:Selmer")
    assert seen[1][0] - seen[0][0] >= 0.38
    assert seen[1][1].get("If-none-match") == '"abc"'


def test_source_update_marks_summary_stale_without_deleting_history(conn):
    conn.execute("insert into source_document(id, canonical_url, title, authors) values ('s1','u','t','{a}')")
    conn.execute("insert into source_passage(id, source_id, anchor, kind, text, sha256) values ('p1','s1','Thm 1','paraphrase','old text', %s)", (registry.sha("old text"),))
    registry.write_summary(conn, "sum1", "bsd:gzk", "Summary relying on p1", ["p1"])
    stale = registry.update_passage(conn, "p1", "revised text", "v2 of the paper changed Theorem 1")
    assert stale == ["sum1"]
    s = conn.execute("select stale, stale_reason from summary where id='sum1'").fetchone()
    assert s["stale"] and "v2" in s["stale_reason"]
    assert conn.execute("select count(*) n from summary_history where summary_id='sum1'").fetchone()["n"] == 1
