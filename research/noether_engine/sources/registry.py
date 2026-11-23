"""Load the curated source registry (exported from the web registry) and keep
summaries linked to the exact passages they rely on, so a source update can
mark dependent summaries stale without deleting history."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .. import events


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def ingest_registry(conn, path: Path, problem_hint: str = "bsd") -> list[str]:
    data = json.loads(Path(path).read_text())
    ids = []
    for s in data["sources"]:
        r = s["retrieval"]
        row = conn.execute(
            """insert into source_document(id, canonical_url, title, authors, year, doi, arxiv_id, arxiv_version, kind, publication_status, license,
                 retrieval_status, retrieved_at, metadata)
               values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict (id) do nothing returning id""",
            (s["id"], s["url"], s["title"], s["authors"], s.get("year"), s.get("doi"), (s.get("arxiv") or {}).get("id"), (s.get("arxiv") or {}).get("version"),
             s["kind"], s["publication"], s["access"], r["status"], r.get("at"), json.dumps({"why": s["why"], "note": r.get("note") or r.get("reason")})),
        ).fetchone()
        for p in s["passages"]:
            conn.execute("""insert into source_passage(id, source_id, anchor, kind, text, sha256) values (%s,%s,%s,%s,%s,%s) on conflict (id) do nothing""",
                         (p["id"], s["id"], p["anchor"], p["kind"], p["text"], sha(p["text"])))
        if row:
            ids.append(s["id"])
            gap = r["status"] != "retrieved"
            events.emit(conn, "source.ingested", (s["problems"] or [problem_hint])[0] if (s["problems"] or [problem_hint])[0] != "poincare" else problem_hint,
                        f"{'Recorded metadata (access gap)' if gap else 'Ingested'}: {s['title'][:200]}",
                        role="LIBRARIAN", provenance={"source_id": s["id"], "retrieval": r, "passages": len(s["passages"]),
                                                      "curation": "passages curated during the build session; not extracted by a model in this run"})
    return ids


def write_summary(conn, sid: str, subject: str, text: str, passage_ids: list[str]) -> None:
    rows = conn.execute("select id, sha256 from source_passage where id = any(%s)", (passage_ids,)).fetchall()
    based = [f"{r['id']}@{r['sha256'][:12]}" for r in rows]
    conn.execute("""insert into summary(id, subject_id, text, based_on) values (%s,%s,%s,%s)
                    on conflict (id) do nothing""", (sid, subject, text, based))


def update_passage(conn, passage_id: str, new_text: str, reason: str) -> list[str]:
    """A source changed: archive dependent summaries, mark them stale. Nothing is deleted."""
    old = conn.execute("select sha256 from source_passage where id=%s", (passage_id,)).fetchone()
    if not old:
        return []
    new_sha = sha(new_text)
    if new_sha == old["sha256"]:
        return []
    conn.execute("update source_passage set text=%s, sha256=%s where id=%s", (new_text, new_sha, passage_id))
    stale = []
    for s in conn.execute("select * from summary where %s = any(based_on)", (f"{passage_id}@{old['sha256'][:12]}",)).fetchall():
        conn.execute("insert into summary_history(summary_id, text, based_on, version) values (%s,%s,%s,%s)", (s["id"], s["text"], s["based_on"], s["version"]))
        conn.execute("update summary set stale=true, stale_reason=%s where id=%s", (f"{passage_id} changed: {reason}", s["id"]))
        stale.append(s["id"])
    return stale
