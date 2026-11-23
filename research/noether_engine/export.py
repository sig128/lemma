"""Export a recorded run for the web app's replay mode. Exports only what the
database holds; nothing is synthesized."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


def _iso(v):
    return v.isoformat().replace("+00:00", "Z") if hasattr(v, "isoformat") else v


def bundle(conn, campaign_id: str, environment: str) -> dict:
    camp = conn.execute("select * from research_campaign where id=%s", (campaign_id,)).fetchone()
    tasks = conn.execute("select * from research_task order by id").fetchall()
    evs = conn.execute("select * from research_event order by seq").fetchall()
    arts = conn.execute("select id, sha256, kind, title, task_id, exactness, conditional_flags, reproducer, created_at, bytes, data from artifact order by created_at").fetchall()
    vers = conn.execute("select * from verification_result order by checked_at").fetchall()
    claims = conn.execute("select id, problem_id, kind, title, statement, status, novelty from mathematical_statement order by id").fetchall()
    hist = conn.execute("select statement_id, old_status, new_status, reason, event_seq, changed_at from statement_label_history order by id").fetchall()
    reviews = conn.execute("select * from review_record order by created_at").fetchall()
    fails = conn.execute("select * from failed_approach order by created_at").fetchall()
    report = next((a["data"] for a in arts if a["kind"] == "report"), None)
    small = lambda a: a["data"] if a["data"] is not None and len(json.dumps(a["data"])) < 60_000 else None
    return {
        "bundle_version": 1, "kind": "recorded-run", "recorded_at": _iso(evs[-1]["ts"]) if evs else datetime.now(timezone.utc).isoformat(),
        "environment": environment,
        "campaign": {"id": camp["id"], "title": camp["title"], "problem_id": camp["problem_id"]},
        "tasks": [{
            "id": t["id"], "campaign_id": t["campaign_id"], "problem_id": t["problem_id"], "role": t["role"], "preset": t["preset"], "objective": t["objective"],
            "question": t["question"], "state": t["state"], "blocked_reason": t["blocked_reason"], "attempts": t["attempts"],
            "limits": {"seconds": t["limits"]["seconds"], "tokens": t["limits"].get("tokens", 0), "usd": t["limits"].get("usd", 0)},
            "success_criteria": t["success_criteria"], "failure_criteria": t["failure_criteria"], "expected_artifacts": t["expected_artifacts"],
            "started_at": _iso(t["started_at"]), "finished_at": _iso(t["finished_at"]), "result_summary": t["result_summary"], "depends_on": t["depends_on"],
        } for t in tasks],
        "events": [{
            "seq": int(e["seq"]), "event_id": str(e["event_id"]), "ts": _iso(e["ts"]), "schema_version": e["schema_version"], "type": e["type"], "project_id": e["project_id"],
            "problem_id": e["problem_id"], "campaign_id": e["campaign_id"], "task_id": e["task_id"], "run_id": e["run_id"], "actor": e["actor"], "artifacts": e["artifacts"],
            "summary": e["summary"], "provenance": e["provenance"], "verification": e["verification"], "view": e["view"],
        } for e in evs],
        "artifacts": [{"id": a["id"], "sha256": a["sha256"], "kind": a["kind"], "title": a["title"], "task_id": a["task_id"], "exactness": a["exactness"] or "text",
                       "conditional_flags": a["conditional_flags"], "reproducer": a["reproducer"], "bytes": a["bytes"], "created_at": _iso(a["created_at"]),
                       "data": small(a) if a["kind"] in ("report", "audit.rerun", "bsd.precision", "ym.u1_exact") else None} for a in arts],
        "verification": [{
            "id": v["id"], "statement_id": v["statement_id"], "statement_hash": v["statement_sha256"], "kind": v["kind"], "result": v["result"], "scope": v["scope"],
            "toolchain": v["toolchain"], "axioms": v["axioms"], "findings": v["findings"], "reproducer": v["reproducer"], "log_artifact": v["log_artifact"],
            "reviewer": v["reviewer"], "checked_at": _iso(v["checked_at"]), "log_excerpt": "",
        } for v in vers],
        "claims": [dict(c) for c in claims],
        "claim_history": [{**{k: v for k, v in h.items() if k != "changed_at"}, "changed_at": _iso(h["changed_at"])} for h in hist],
        "reviews": [{**{k: v for k, v in r.items() if k != "created_at"}, "created_at": _iso(r["created_at"])} for r in reviews],
        "failed_approaches": [{**{k: v for k, v in f.items() if k != "created_at"}, "created_at": _iso(f["created_at"])} for f in fails],
        "report": report,
    }


def write(conn, out_dir: Path, campaign_id: str, environment: str) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    b = bundle(conn, campaign_id, environment)
    f = out_dir / f"{campaign_id}.json"
    f.write_text(json.dumps(b, indent=1, default=str))
    idx = {"bundles": [{"file": f.name, "campaign": campaign_id, "problem_id": b["campaign"]["problem_id"], "recorded_at": b["recorded_at"], "events": len(b["events"]), "title": b["campaign"]["title"]}]}
    (out_dir / "index.json").write_text(json.dumps(idx, indent=1))
    return f
