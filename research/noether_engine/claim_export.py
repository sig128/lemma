"""Export one claim as a self-contained evidence bundle.

The bundle holds what a reader needs to check the claim without the database:
the statement and its label history, assumptions, the sources it leans on,
the computation or proof artifacts with their reproducers, the verification
records, reviews and recorded failures. Files are written as plain JSON plus a
README; nothing in the bundle is executable by itself.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from . import artifacts

# Sources a claim leans on, by claim family. Theorems used in a deduction are listed
# here rather than inferred, so the bundle says exactly which results were invoked.
SOURCES_BY_FAMILY = {
    "bsd:rank-eq:": ["wiles-flt", "bcdt", "gross-zagier", "kolyvagin-euler", "pari-elliptic", "wiles-bsd"],
    "bsd:lean:": ["wiles-bsd"],
    "bsd:target:rank3": ["bgz-rank3", "gross-zagier", "kolyvagin-euler"],
    "bsd:target:rank4": ["gjpst-verification", "pari-elliptic"],
    "bsd:target:twist": ["bmsw-average", "bhargava-shankar", "bsz-majority"],
}


def _jsonable(v):
    if hasattr(v, "isoformat"):
        s = v.isoformat()
        return s.replace("+00:00", "Z")
    return v


def _rows(cur) -> list[dict]:
    return [{k: _jsonable(v) for k, v in r.items()} for r in cur.fetchall()]


def bundle(conn, claim_id: str) -> dict:
    st = conn.execute("select * from mathematical_statement where id=%s", (claim_id,)).fetchone()
    if not st:
        raise SystemExit(f"no claim {claim_id}")
    claim = {k: _jsonable(v) for k, v in st.items()}
    history = _rows(conn.execute("select old_status, new_status, reason, event_seq, changed_at from statement_label_history where statement_id=%s order by id", (claim_id,)))
    assumptions = _rows(conn.execute("select id, text, kind from assumption where statement_id=%s order by id", (claim_id,)))
    verification = _rows(conn.execute("select * from verification_result where statement_id=%s order by checked_at", (claim_id,)))
    reviews = _rows(conn.execute("select * from review_record where target_id=%s order by created_at", (claim_id,)))
    failures = _rows(conn.execute("select * from failed_approach where statement_id=%s order by created_at", (claim_id,)))
    # artifacts referenced by the events that proposed or changed this claim
    art_ids: list[str] = []
    for ev in conn.execute("select artifacts from research_event where provenance->>'claim'=%s order by seq", (claim_id,)).fetchall():
        for a in ev["artifacts"] or []:
            if a.get("id") and a["id"] not in art_ids:
                art_ids.append(a["id"])
    for v in verification:
        if v.get("log_artifact") and v["log_artifact"] not in art_ids:
            art_ids.append(v["log_artifact"])
    if claim_id.startswith("bsd:rank-eq:"):
        # every artifact computed for this curve (invariants, re-runs, precision escalation)
        label = claim_id.rsplit(":", 1)[1]
        for r in conn.execute("select id from artifact where title ~ %s order by created_at", (rf"\m{label}\M",)).fetchall():
            if r["id"] not in art_ids:
                art_ids.append(r["id"])
    arts = _rows(conn.execute("select id, sha256, kind, title, task_id, exactness, conditional_flags, reproducer, bytes, created_at from artifact where id = any(%s)", (art_ids,)))
    src_ids = next((ids for pre, ids in SOURCES_BY_FAMILY.items() if claim_id.startswith(pre)), [])
    sources = _rows(conn.execute("""select id, title, authors, year, doi, arxiv_id, canonical_url, retrieval_status, retrieved_at, content_sha256
                                    from source_document where id = any(%s)""", (src_ids,)))
    sources.sort(key=lambda s: src_ids.index(s["id"]))
    return {"claim": claim, "label_history": history, "assumptions": assumptions, "sources": sources, "artifacts": arts,
            "verification": verification, "reviews": reviews, "failed_approaches": failures}


def _readme(b: dict) -> str:
    c = b["claim"]
    lines = [f"# Evidence bundle: {c['title']}", "", f"Claim id `{c['id']}`, statement sha256 `{c['sha256']}`.", "",
             f"> {c['statement']}", "", f"Status in this system: **{c['status']}**. Novelty: {c['novelty']}.", "",
             "Status labels follow the promotion policy in `research/noether_engine/verify/promotion.py`; model confidence is never an input.",
             "This bundle is evidence about one statement. It is not a proof of any Millennium Prize Problem.", "", "## Label history", ""]
    lines += [f"- {h['changed_at']}: {h['old_status']} → {h['new_status']}. {h['reason']}" for h in b["label_history"]] or ["- No change from candidate."]
    lines += ["", "## Assumptions", ""]
    lines += [f"- {a['text']}" for a in b["assumptions"]] or ["- None recorded."]
    lines += ["", "## Sources invoked", ""]
    lines += [f"- {s['title']} ({', '.join(s['authors'] or [])}, {s['year']}). Retrieval: {s['retrieval_status']}. {s['canonical_url']}" for s in b["sources"]] or ["- None."]
    lines += ["", "## Artifacts and how to reproduce them", ""]
    for a in b["artifacts"]:
        lines += [f"- `{a['id']}` {a['title']} ({a['kind']}, {a['exactness']}{', flags: ' + ', '.join(a['conditional_flags']) if a['conditional_flags'] else ''}). sha256 `{a['sha256']}`.",
                  f"  File: `artifacts/{a['id']}`" + (f". Reproduce: `{a['reproducer']}`" if a["reproducer"] else "")]
    lines += ["", "## Verification records", "",
              "A passed computation check means a fresh process reproduced the artifact exactly. It does not add to what the artifact shows.", ""]
    for v in b["verification"]:
        lines += [f"- {v['kind']} check `{v['id']}`: **{v['result']}**. Scope: {v['scope']}. Findings: {'; '.join(v['findings'] or []) or 'none'}."]
    if not b["verification"]:
        lines.append("- None.")
    if b["reviews"]:
        lines += ["", "## Reviews", ""] + [f"- {r['reviewer_role']}, fresh context {r['fresh_context']}: {r['verdict']}." for r in b["reviews"]]
    if b["failed_approaches"]:
        lines += ["", "## Recorded failures", ""] + [f"- {f['what']}: {f['where_failed']}. Retry only: {f['retry_conditions']}." for f in b["failed_approaches"]]
    lines += ["", "## Checking a computation yourself", "",
              "Run a PARI artifact's reproducer from the repository root, with the environment pinned in `research/requirements.txt`.",
              "The SHA-256 of the canonical JSON of the output's `result` field equals the artifact's sha256:", "",
              "```sh",
              "echo '<request>' | PYTHONPATH=research python3 -m noether_engine.domains.bsd \\",
              "  | PYTHONPATH=research python3 -c \"import sys, json, hashlib; from noether_engine import artifacts; "
              "r = json.loads(sys.stdin.read().splitlines()[-1])['result']; print(hashlib.sha256(artifacts.canonical(r)).hexdigest())\"",
              "```", "",
              "Lean artifacts are the checked source and the checker's log; re-check with `lean` 4.36.0 and `#print axioms`.", ""]
    return "\n".join(lines)


def write(conn, claim_id: str, out_root: Path) -> Path:
    b = bundle(conn, claim_id)
    out = out_root / claim_id.replace(":", "_")
    (out / "artifacts").mkdir(parents=True, exist_ok=True)
    for name in ["claim", "assumptions", "sources", "verification"]:
        key = name
        payload = {"claim": b["claim"], "label_history": b["label_history"], "reviews": b["reviews"], "failed_approaches": b["failed_approaches"]} if name == "claim" else b[key]
        (out / f"{name}.json").write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n")
    manifest = []
    for a in b["artifacts"]:
        raw = artifacts.read(conn, a["id"])
        (out / "artifacts" / a["id"]).write_bytes(raw)
        ok = hashlib.sha256(raw).hexdigest() == a["sha256"]
        manifest.append({**a, "file": f"artifacts/{a['id']}", "sha256_verified_on_export": ok})
    (out / "artifacts.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")
    (out / "README.md").write_text(_readme(b))
    return out
