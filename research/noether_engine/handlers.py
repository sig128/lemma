"""Task handlers, one per preset. Handlers return data; status changes go
through verify.promotion; events go through events.emit."""
from __future__ import annotations

import hashlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from psycopg.types.json import Jsonb

from .agents.roles import display_name

from . import artifacts, budget, events, sandbox
from .config import ROOT, settings
from .providers import anthropic_provider as provider
from .sources import arxiv, registry
from .verify import lean, promotion
from .verify.promotion import Evidence


class Blocked(Exception):
    def __init__(self, reason: str, capability: str | None = None):
        super().__init__(reason)
        self.reason, self.capability = reason, capability


class Retryable(Exception):
    pass


@dataclass
class Ctx:
    conn: Any
    worker_id: str
    check: Callable[[], None]          # raises Cancelled / LeaseLost
    checkpoint: Callable[[dict], None]


def _canon_hash(res: Any) -> str:
    def strip(o):
        if isinstance(o, dict):
            return {k: strip(v) for k, v in o.items() if k not in ("seconds", "computed_at", "wall_seconds")}
        if isinstance(o, list):
            return [strip(x) for x in o]
        return o
    return hashlib.sha256(json.dumps(strip(res), sort_keys=True).encode()).hexdigest()


def _run_domain(ctx: Ctx, module: str, op: str, args: dict, limits: dict) -> dict:
    r = sandbox.python(f"noether_engine.domains.{module}", json.dumps({"op": op, "args": args}), timeout=limits.get("seconds", 600),
                       memory_mb=limits.get("memory_mb", 2048), should_cancel=lambda: _cancel_requested(ctx))
    if r.canceled:
        raise _Cancelled(r)
    if r.timed_out:
        raise Blocked(f"computation exceeded its {limits.get('seconds')} s limit; partial output preserved", "compute")
    if r.exit_code != 0:
        raise Retryable(f"{module}.{op} exited {r.exit_code}: {r.stderr[-800:]}")
    out = json.loads(r.stdout.strip().splitlines()[-1])
    out["_stderr"] = r.stderr[-2000:]
    return out


class _Cancelled(Exception):
    def __init__(self, r):
        super().__init__("canceled")
        self.run = r


def _cancel_requested(ctx: Ctx) -> bool:
    try:
        ctx.check()
        return False
    except Exception:  # noqa: BLE001 - Cancelled or LeaseLost both stop the child
        return True


def _set_claim(conn, cid: str, problem: str, title: str, statement: str, requested: str, evidence: list[Evidence], *, generated: bool,
               task: dict, view: dict | None = None, artifacts_: list | None = None) -> str:
    cur = conn.execute("select status from mathematical_statement where id=%s", (cid,)).fetchone()
    current = cur["status"] if cur else "candidate"
    sha = hashlib.sha256(statement.encode()).hexdigest()
    if not cur:
        conn.execute("""insert into mathematical_statement(id, problem_id, kind, title, statement, sha256, status, origin_run)
                        values (%s,%s,'claim',%s,%s,%s,'candidate',%s)""", (cid, problem, title, statement, sha, task["id"]))
        events.emit(conn, "claim.proposed", problem, f"Claim proposed: {title}", task_id=task["id"], campaign_id=task["campaign_id"],
                    role=task["role"], provenance={"claim": cid, "statement_sha256": sha}, view=view, artifacts=artifacts_)
    for ev in evidence:
        for text in ev.assumptions:
            aid = "asm-" + hashlib.sha256(f"{cid}|{text}".encode()).hexdigest()[:16]
            conn.execute("insert into assumption(id, statement_id, text, kind) values (%s,%s,%s,%s) on conflict do nothing", (aid, cid, text, ev.kind))
    d = promotion.decide(current, requested, evidence, generated=generated)
    if d.allowed and d.status != current:
        conn.execute("update mathematical_statement set status=%s, updated_at=now() where id=%s", (d.status, cid))
        seq = events.emit(conn, "claim.refuted" if d.status == "refuted" else "claim.promoted", problem, f"{title}: {current} → {d.status} ({'; '.join(d.reasons)})",
                          task_id=task["id"], campaign_id=task["campaign_id"], role="AUDITOR" if d.status == "independently-reproduced" else task["role"],
                          provenance={"claim": cid, "policy": "verify/promotion.py", "reasons": d.reasons}, view=view, artifacts=artifacts_,
                          verification={"status": d.status})
        conn.execute("insert into statement_label_history(statement_id, old_status, new_status, reason, event_seq) values (%s,%s,%s,%s,%s)",
                     (cid, current, d.status, "; ".join(d.reasons), seq))
    return d.status if d.allowed else current


# ---------------------------------------------------------------------------- presets

def h_registry_ingest(ctx: Ctx, t: dict) -> dict:
    ids = registry.ingest_registry(ctx.conn, ROOT / t["inputs"]["path"])
    return {"ingested": len(ids), "ids": ids, "summary": f"{len(ids)} sources recorded with retrieval status; access gaps marked"}


def h_arxiv_search(ctx: Ctx, t: dict) -> dict:
    client = arxiv.ArxivClient(ctx.conn, settings().artifact_dir.parent / "arxiv-cache", settings().arxiv_contact)
    found = []
    for q in t["inputs"]["queries"]:
        ctx.check()
        try:
            total, entries, meta = client.search(q, max_results=t["inputs"].get("max_results", 10))
        except arxiv.ArxivUnavailable as e:
            raise Blocked(f"arXiv API unreachable from this host ({e}); queries recorded for retry: {t['inputs']['queries']}", "network:export.arxiv.org")
        for e in entries:
            sid, kind = arxiv.upsert_entry(ctx.conn, e, meta["sha256"])
            if kind != "known":
                events.emit(ctx.conn, "source.discovered", t["problem_id"], f"{e.title[:180]} ({e.arxiv_id}{e.version})", task_id=t["id"],
                            campaign_id=t["campaign_id"], role="SCOUT", provenance={"query": q, "kind": kind, "sha256": meta["sha256"]})
            found.append(sid)
    return {"found": found}


CURVES = {"11a1": [0, -1, 1, -10, -20], "37a1": [0, 0, 1, -1, 0], "389a1": [0, 1, 1, -2, 0], "5077a1": [0, 0, 1, -7, 6], "234446a1": [1, -1, 0, -79, 289]}


def classify_bsd(res: dict) -> tuple[str, list[str], list[str]]:
    """Returns (requested claim status, conditional flags, assumptions) for 'rank E(Q) = ord_{s=1} L(E,s)' on one curve."""
    ders = res["derivatives_at_1"]
    r_alg_ok = res["rank_lower"] == res["rank_upper"]
    r = res["analytic_order_numerical"]
    unforced_zero = [d for d in ders[:r] if d["abs_below_eps"] and not d["forced_zero_by_theorem"]]
    lead = ders[r] if r < len(ders) else None
    flags = ["numerical-threshold"] if unforced_zero else []
    assumptions = [f"numerical nonvanishing of L^({r})(E,1) at {res['provenance']['realprecision']} digits (PARI floating point, not interval arithmetic)"]
    if not r_alg_ok or lead is None:
        return "candidate", flags, assumptions
    if unforced_zero:
        return "open", flags, assumptions
    return ("verified-instance" if r == res["rank_lower"] else "refuted"), flags, assumptions


def h_bsd_invariants(ctx: Ctx, t: dict) -> dict:
    label = t["inputs"]["curve"]
    events.emit(ctx.conn, "experiment.started", "bsd", f"PARI computation for {label}: descent, saturation, heights, L-derivatives", task_id=t["id"],
                campaign_id=t["campaign_id"], role="ARITHMETIC", worker_id=ctx.worker_id, view={"curve": label, "view": "curve"})
    out = _run_domain(ctx, "bsd", "invariants", {"ainvs": CURVES[label], "digits": t["inputs"].get("digits", 38)}, t["limits"])
    res = out["result"]
    req, flags, assumptions = classify_bsd(res)
    art = artifacts.put(ctx.conn, "bsd.invariants", f"PARI invariants for {label}", res, task_id=t["id"], exactness="mixed",
                        conditional_flags=flags, reproducer=f"echo '{{\"op\":\"invariants\",\"args\":{{\"ainvs\":{CURVES[label]}}}}}' | PYTHONPATH=research python3 -m noether_engine.domains.bsd")
    ctx.conn.execute("insert into experiment(id, task_id, kind, params, exactness, conditional_flags, started_at, finished_at, exit_code, output_artifact) values (%s,%s,'pari',%s,'mixed',%s,now(),now(),0,%s) on conflict do nothing",
                     (f"exp-{art['id'][4:]}", t["id"], Jsonb({"ainvs": CURVES[label]}), flags, art["id"]))
    events.emit(ctx.conn, "experiment.completed", "bsd",
                f"{label}: rank {res['rank_lower']}..{res['rank_upper']} by descent; numerical analytic order {res['analytic_order_numerical']}; root number {res['root_number']:+d}",
                task_id=t["id"], campaign_id=t["campaign_id"], role="ARITHMETIC", worker_id=ctx.worker_id, artifacts=[art],
                provenance={**res["provenance"], "seconds": out["seconds"], "conditional_flags": flags}, view={"curve": label, "view": "lfunction"})
    status = _set_claim(ctx.conn, f"bsd:rank-eq:{label}", "bsd", f"Rank equality for {label}",
                        f"rank E(Q) = ord_(s=1) L(E,s) for E = {label} {CURVES[label]}", req if req != "open" else "candidate",
                        [Evidence("computation", "mixed", flags, assumptions=assumptions)], generated=False, task=t,
                        view={"curve": label, "view": "lfunction"}, artifacts_=[art])
    if req == "open":
        ctx.conn.execute("insert into failed_approach(id, problem_id, statement_id, what, where_failed, failure_kind, retry_conditions) values (%s,'bsd',%s,%s,%s,'numerical',%s) on conflict do nothing",
                         (f"fail-{label}-numeric", f"bsd:rank-eq:{label}", "Determine ord_{s=1} L(E,s) from PARI's numerical analytic rank",
                          "An unforced derivative is below PARI's zero threshold; the threshold assumes vanishing", "Only with a theorem forcing vanishing, or a certified method for exact zeros"))
        events.emit(ctx.conn, "dependency.blocked", "bsd", f"{label}: ord L(E,s) not determined: L'' is numerically zero but no theorem forces it", task_id=t["id"],
                    campaign_id=t["campaign_id"], role="ARITHMETIC", worker_id=ctx.worker_id, view={"curve": label, "view": "lfunction", "object": "L''"})
    return {"curve": label, "artifact": art, "claim_status": status, "result_sha256": _canon_hash(res), "flags": flags,
            "summary": f"{label}: rank {res['rank_lower']} by descent, numerical analytic order {res['analytic_order_numerical']}; rank-equality claim now '{status}'" + (" (L'' undetermined)" if req == "open" else "")}


def h_audit_rerun(ctx: Ctx, t: dict) -> dict:
    src_task = ctx.conn.execute("select result from research_task where id=%s", (t["inputs"]["of_task"],)).fetchone()
    if not src_task or not src_task["result"]:
        raise Blocked("nothing to audit: source task has no result")
    label = t["inputs"]["curve"]
    out = _run_domain(ctx, "bsd", "invariants", {"ainvs": CURVES[label], "digits": t["inputs"].get("digits", 38)}, t["limits"])
    h = _canon_hash(out["result"])
    match = h == src_task["result"]["result_sha256"]
    art = artifacts.put(ctx.conn, "audit.rerun", f"Fresh-process re-run for {label}", {"original": src_task["result"]["result_sha256"], "rerun": h, "match": match},
                        task_id=t["id"], exactness="text")
    ctx.conn.execute("insert into verification_result(id, statement_id, statement_sha256, kind, result, scope, toolchain, findings, reproducer, reviewer) values (%s,%s,%s,'computation',%s,%s,%s,%s,%s,'Auditor (fresh process)') on conflict do nothing",
                     (f"ver-{art['id'][4:]}", f"bsd:rank-eq:{label}", h, "passed" if match else "failed", f"PARI invariants for {label}",
                      Jsonb(out["result"]["provenance"]), [f"result hash {'matches' if match else 'differs from'} the original run"], "PYTHONPATH=research python3 -m noether_engine.domains.bsd < request.json"))
    flags = src_task["result"].get("flags", [])
    if match:
        _set_claim(ctx.conn, f"bsd:rank-eq:{label}", "bsd", f"Rank equality for {label}", "", "independently-reproduced",
                   [Evidence("audit-rerun", matches=True, conditional_flags=flags)], generated=False, task=t, view={"curve": label, "view": "lfunction"}, artifacts_=[art])
    else:
        events.emit(ctx.conn, "claim.refuted", "bsd", f"Re-run of {label} did not reproduce the original result hash", task_id=t["id"], campaign_id=t["campaign_id"], role="AUDITOR", artifacts=[art])
    return {"curve": label, "match": match, "artifact": art, "summary": f"{label}: fresh-process re-run {'reproduced the result hash exactly' if match else 'did NOT reproduce the result'}"}


def h_precision(ctx: Ctx, t: dict) -> dict:
    label, k = t["inputs"]["curve"], t["inputs"]["k"]
    out = _run_domain(ctx, "bsd", "derivative_precisions", {"ainvs": CURVES[label], "k": k, "precisions": t["inputs"]["precisions"]}, t["limits"])
    res = out["result"]
    art = artifacts.put(ctx.conn, "bsd.precision", f"L^({k})(E,1) for {label} at increasing precision", res, task_id=t["id"], exactness="numerical", conditional_flags=["numerical-threshold"])
    rows = res["rows"]
    tracks = all(r["log10_abs"] is None or r["log10_abs"] <= r["noise_floor_log10"] + 6 for r in rows)
    events.emit(ctx.conn, "experiment.completed", "bsd",
                f"{label}: |L''(E,1)| at {', '.join(str(r['digits']) for r in rows)} digits = " + ", ".join(f"1e{r['log10_abs']:.0f}" if r['log10_abs'] is not None else "0" for r in rows)
                + ("; magnitude follows the precision floor" if tracks else ""),
                task_id=t["id"], campaign_id=t["campaign_id"], role="ARITHMETIC", worker_id=ctx.worker_id, artifacts=[art], view={"curve": label, "view": "lfunction", "object": "L''"})
    return {"tracks_noise_floor": tracks, "artifact": art, "summary": "L''(E,1) for 234446a1 stays at the precision floor at 38, 76 and 115 digits: no separation from zero, and no proof of vanishing" if tracks else "L''(E,1) separated from zero"}


def h_rule_review(ctx: Ctx, t: dict) -> dict:
    """SKEPTIC rule checks (no model): applies the promotion policy to a seeded or proposed argument."""
    arg = t["inputs"]["argument"]
    ev = [Evidence("computation", arg["evidence_exactness"], arg.get("conditional_flags", []))]
    d = promotion.decide("candidate", arg["requested"], ev, generated=arg.get("generated", True), unconditional=arg.get("unconditional", False))
    verdict = "accept" if d.allowed else "reject"
    rid = f"rev-{hashlib.sha256(json.dumps(arg, sort_keys=True).encode()).hexdigest()[:12]}"
    ctx.conn.execute("insert into review_record(id, target_id, reviewer_role, fresh_context, verdict, findings) values (%s,%s,'Skeptic (rule-based, no model)',true,%s,%s) on conflict do nothing",
                     (rid, arg["id"], verdict, Jsonb({"reasons": d.reasons, "argument": arg["text"]})))
    cid = arg["id"]
    if not ctx.conn.execute("select 1 from mathematical_statement where id=%s", (cid,)).fetchone():
        ctx.conn.execute("insert into mathematical_statement(id, problem_id, kind, title, statement, sha256, status, origin_run) values (%s,%s,'claim',%s,%s,%s,'candidate',%s)",
                         (cid, t["problem_id"], arg["title"], arg["text"], hashlib.sha256(arg["text"].encode()).hexdigest(), t["id"]))
        events.emit(ctx.conn, "claim.proposed", t["problem_id"], f"Argument submitted for review: {arg['title']}", task_id=t["id"], campaign_id=t["campaign_id"], role="SYNTHESIST",
                    provenance={"seeded": arg.get("seeded", False)}, view=arg.get("view"))
    if verdict == "reject":
        ctx.conn.execute("update mathematical_statement set status='refuted' where id=%s", (cid,))
        seq = events.emit(ctx.conn, "claim.refuted", t["problem_id"], f"Rejected: {arg['title']}: {'; '.join(d.reasons)}", task_id=t["id"], campaign_id=t["campaign_id"],
                          role="SKEPTIC", provenance={"review": rid, "policy": "verify/promotion.py"}, view=arg.get("view"))
        ctx.conn.execute("insert into statement_label_history(statement_id, old_status, new_status, reason, event_seq) values (%s,'candidate','refuted',%s,%s)", (cid, "; ".join(d.reasons), seq))
    return {"verdict": verdict, "reasons": d.reasons, "review": rid, "summary": f"Rule-based review: {verdict} ({'; '.join(d.reasons)})"}


def h_lean(ctx: Ctx, t: dict) -> dict:
    inp = t["inputs"]
    src = (ROOT / inp["file"]).read_text()
    events.emit(ctx.conn, "proof.check.started", t["problem_id"], f"Lean check of {inp['target']} ({inp['file']})", task_id=t["id"], campaign_id=t["campaign_id"], role="FORMALIZER", worker_id=ctx.worker_id)
    r = lean.check(src, inp["target"], inp["intended"], lean_bin=settings().lean_bin, timeout=t["limits"]["seconds"])
    log_art = artifacts.put(ctx.conn, "lean.log", f"Lean log for {inp['target']}", raw=r.log.encode(), task_id=t["id"], exactness="text")
    src_art = artifacts.put(ctx.conn, "lean.source", inp["file"], raw=src.encode(), task_id=t["id"], exactness="exact")
    vid = f"ver-{log_art['id'][4:]}-{inp['target']}"
    ctx.conn.execute("""insert into verification_result(id, statement_id, statement_sha256, kind, result, scope, toolchain, axioms, findings, reproducer, log_artifact, reviewer)
                        values (%s,%s,%s,'lean',%s,%s,%s,%s,%s,%s,%s,'Lean kernel + NOETHER axiom audit') on conflict do nothing""",
                     (vid, inp["statement_id"], r.statement_sha256, r.result, inp.get("scope", ""), Jsonb(r.toolchain), r.axioms, r.findings, r.reproducer, log_art["id"]))
    passed = r.result == "passed"
    events.emit(ctx.conn, "proof.check.passed" if passed else "proof.check.failed", t["problem_id"],
                f"{inp['target']}: {r.result}" + (f" — {r.findings[0]}" if r.findings else "; axioms: " + (", ".join(r.axioms) or "none")),
                task_id=t["id"], campaign_id=t["campaign_id"], role="AUDITOR", worker_id=ctx.worker_id, artifacts=[src_art, log_art],
                verification={"status": r.result, "axioms": r.axioms, "findings": r.findings, "toolchain": r.toolchain})
    if passed and inp.get("promote", True):
        _set_claim(ctx.conn, inp["statement_id"], t["problem_id"], inp["title"], inp["intended"], "formally-checked", [Evidence("lean", result="passed")],
                   generated=False, task=t, artifacts_=[src_art])
    return {"result": r.result, "axioms": r.axioms, "findings": r.findings, "verification_id": vid,
            "summary": f"{inp['target']}: {r.result}" + (f" ({r.findings[0]})" if r.findings else f"; axioms: {', '.join(r.axioms) or 'none'}")}


def h_twists(ctx: Ctx, t: dict) -> dict:
    out = _run_domain(ctx, "bsd", "twists", {"base": CURVES[t["inputs"]["base"]], "bound": t["inputs"]["bound"]}, t["limits"])
    res = out["result"]
    art = artifacts.put(ctx.conn, "bsd.twists", f"Quadratic twists of {t['inputs']['base']}, |d| <= {t['inputs']['bound']}", res, task_id=t["id"], exactness="mixed", conditional_flags=["numerical-threshold"])
    events.emit(ctx.conn, "experiment.completed", "bsd", f"{res['n']} twists of {t['inputs']['base']} with |d| ≤ {res['bound']}: " + ", ".join(f"{k}: {v}" for k, v in sorted(res["counts"].items())),
                task_id=t["id"], campaign_id=t["campaign_id"], role="ARITHMETIC", worker_id=ctx.worker_id, artifacts=[art], view={"curve": "11a1", "view": "family"})
    _set_claim(ctx.conn, "bsd:family-question", "bsd", "Pattern in the 11a1 twist family",
               "Question: does the share of even-parity twists of 11a1 with analytic rank 2 decrease as |d| grows?", "numerically-supported",
               [Evidence("computation", "mixed", ["numerical-threshold"])], generated=False, task=t, view={"curve": "11a1", "view": "family"}, artifacts_=[art])
    return {"n": res["n"], "counts": res["counts"], "artifact": art, "summary": f"{res['n']} twists classified: " + ", ".join(f"{k} {v}" for k, v in sorted(res["counts"].items()))}


def h_novelty(ctx: Ctx, t: dict) -> dict:
    out = []
    for c in t["inputs"]["candidates"]:
        hits = ctx.conn.execute("select id, title from source_document where id = any(%s)", (c.get("known_sources", []),)).fetchall()
        status = "found-in-literature" if hits else "unchecked"
        ctx.conn.execute("""insert into mathematical_statement(id, problem_id, kind, title, statement, sha256, status, novelty, origin_run)
                            values (%s,'bsd','target',%s,%s,%s,%s,%s,%s) on conflict (id) do update set novelty=excluded.novelty""",
                         (c["id"], c["title"], c["statement"], hashlib.sha256(c["statement"].encode()).hexdigest(), c.get("status", "candidate"), status, t["id"]))
        out.append({"id": c["id"], "novelty": status, "matches": [h["id"] for h in hits], "note": c.get("note", "")})
        events.emit(ctx.conn, "statement.extracted", "bsd", f"Candidate target: {c['title']} — novelty {status}" + (f" ({', '.join(h['id'] for h in hits)})" if hits else ""),
                    task_id=t["id"], campaign_id=t["campaign_id"], role="CURATOR", provenance={"candidate": c["id"], "method": "registry comparison; no expert assessment"})
    return {"candidates": out, "summary": "; ".join(f"{c['id'].split(':')[-1]}: {c['novelty']}" for c in out)}


def h_model(ctx: Ctx, t: dict) -> dict:
    """Generic model-backed role task: reserve budget, call Claude, store output as candidate data."""
    from .agents.roles import ROLES
    role = ROLES[t["role"]]
    if not provider.available():
        raise Blocked(f"{display_name(t['role'])} needs a model: provider unconfigured (set ANTHROPIC_API_KEY, ANTHROPIC_MODEL={settings().anthropic_model})", "model:anthropic")
    s = settings()
    ledger = budget.ensure_ledger(ctx.conn, "global", s.daily_usd, s.daily_tokens)
    est_tokens = int(t["limits"].get("tokens", 20000))
    res_id = budget.reserve(ctx.conn, ledger, provider.estimate_usd(s.anthropic_model, est_tokens // 2, est_tokens // 2), est_tokens, t["id"], t["problem_id"])
    try:
        comp = provider.complete(role.prompt(), json.dumps({"task": {k: t[k] for k in ("objective", "question", "inputs", "success_criteria", "failure_criteria")}}),
                                 max_tokens=min(16000, est_tokens))
    except provider.ProviderRetryable as e:
        budget.mark_uncertain(ctx.conn, res_id, t["problem_id"])
        raise Retryable(str(e)) from e
    except provider.ProviderUnconfigured as e:
        budget.release(ctx.conn, res_id)
        raise Blocked(str(e), "model:anthropic") from e
    budget.reconcile(ctx.conn, res_id, comp.usd, comp.input_tokens + comp.output_tokens)
    try:
        data = provider.extract_json(comp.text)
    except Exception as e:  # noqa: BLE001
        raise Retryable(f"agent output was not valid JSON: {e}") from e
    art = artifacts.put(ctx.conn, f"agent.{t['role'].lower()}", f"{display_name(t['role'])} output for {t['id']}", data, task_id=t["id"], exactness="text")
    ctx.conn.execute("insert into agent_run(id, task_id, role, worker_id, attempt, model, finished_at, outcome, usage) values (%s,%s,%s,%s,%s,%s,now(),'ok',%s)",
                     (f"run-{art['id'][4:]}", t["id"], t["role"], ctx.worker_id, t["attempts"], comp.model, Jsonb({"input": comp.input_tokens, "output": comp.output_tokens, "usd": comp.usd})))
    return {"artifact": art, "usage": {"in": comp.input_tokens, "out": comp.output_tokens, "usd": comp.usd}}


def h_capability(ctx: Ctx, t: dict) -> dict:
    raise Blocked(t["inputs"]["reason"], t["inputs"]["capability"])


def h_other(ctx: Ctx, t: dict) -> dict:
    inp = t["inputs"]
    out = _run_domain(ctx, "other", inp["op"], inp["args"], t["limits"])
    res = out["result"]
    exact = res.get("exactness", "numerical")
    art = artifacts.put(ctx.conn, f"{t['problem_id']}.{inp['op']}", t["objective"], res, task_id=t["id"], exactness=exact)
    if inp["op"] == "zeta_zeros":
        summ = f"Recomputed the first {len(res['zeros'])} zeros in a fresh process; Z(t) changes sign across every one: {res['all_sign_changes']}"
    elif inp["op"] == "u1_exact":
        summ = "Exact 2D U(1) plaquette (character expansion): " + ", ".join(f"β={r['beta']}: {r['plaquette_exact'][:9]}" for r in res["rows"])
    else:
        summ = f"{t['objective']}: done in {out['seconds']} s"
    events.emit(ctx.conn, "experiment.completed", t["problem_id"], summ,
                task_id=t["id"], campaign_id=t["campaign_id"], role="ARITHMETIC", worker_id=ctx.worker_id, artifacts=[art])
    if inp.get("claim"):
        c = inp["claim"]
        _set_claim(ctx.conn, c["id"], t["problem_id"], c["title"], c["statement"], c["requested"], [Evidence("computation", exact)], generated=False, task=t, artifacts_=[art])
    return {"artifact": art, "seconds": out["seconds"]}


def h_script(ctx: Ctx, t: dict) -> dict:
    """Run a repository script in the sandbox and record its output file as an artifact (e.g. the exact Clebsch lines)."""
    import tempfile
    inp = t["inputs"]
    d = Path(tempfile.mkdtemp(prefix="noether-out-"))
    r = sandbox.run([sys.executable, "-I", str(ROOT / inp["script"]), str(d)], timeout=t["limits"]["seconds"], memory_mb=t["limits"].get("memory_mb", 4096),
                    should_cancel=lambda: _cancel_requested(ctx))
    if r.exit_code != 0:
        raise Retryable(r.stderr[-800:])
    data = json.loads((d / inp["output"]).read_text())
    facts = data.get("surface", {}).get("facts_exact", {})
    art = artifacts.put(ctx.conn, f"{t['problem_id']}.script", inp["output"], data, task_id=t["id"], exactness="exact", reproducer=f"python3 -I {inp['script']} <outdir>")
    events.emit(ctx.conn, "experiment.completed", t["problem_id"], inp["summary"].format(**facts), task_id=t["id"], campaign_id=t["campaign_id"], role="ARITHMETIC",
                worker_id=ctx.worker_id, artifacts=[art], provenance={"stdout": r.stdout[-400:]})
    if inp.get("claim"):
        c = inp["claim"]
        _set_claim(ctx.conn, c["id"], t["problem_id"], c["title"], c["statement"], c["requested"], [Evidence("computation", "exact")], generated=False, task=t, artifacts_=[art])
    return {"artifact": art}


def h_report(ctx: Ctx, t: dict) -> dict:
    c = ctx.conn
    claims = c.execute("select id, title, status, novelty from mathematical_statement where problem_id=%s order by id", (t["problem_id"],)).fetchall()
    blocked = c.execute("select id, role, blocked_reason from research_task where campaign_id=%s and state='blocked' order by id", (t["campaign_id"],)).fetchall()
    fails = c.execute("select what, where_failed, failure_kind, retry_conditions from failed_approach where problem_id=%s", (t["problem_id"],)).fetchall()
    rep = {
        "title": t["inputs"]["title"],
        "claims": claims, "blocked": blocked, "failed_approaches": fails,
        "changed": t["inputs"]["changed"],
        "steps": t["inputs"]["steps"],
    }
    art = artifacts.put(c, "report", rep["title"], rep, task_id=t["id"], exactness="text")
    events.emit(c, "report.published", t["problem_id"], f"Report: remaining gap — {t['inputs']['changed']['remaining_gap'][:400]}", task_id=t["id"], campaign_id=t["campaign_id"],
                role="CURATOR", artifacts=[art], view={"curve": "234446a1", "view": "lfunction", "object": "L''"})
    return {"artifact": art, "report": rep, "summary": "Remaining-gap report published"}


HANDLERS: dict[str, Callable[[Ctx, dict], dict]] = {
    "registry-ingest": h_registry_ingest, "arxiv-search": h_arxiv_search, "bsd-invariants": h_bsd_invariants, "audit-rerun": h_audit_rerun,
    "precision-escalation": h_precision, "rule-review": h_rule_review, "lean-check": h_lean, "twist-family": h_twists, "novelty-check": h_novelty,
    "model": h_model, "capability": h_capability, "compute": h_other, "script": h_script, "report": h_report,
}
