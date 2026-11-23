"""Evaluation suites: measure a strategy against cases whose correct label is known in advance.

Suite `bsd-rank-labels` checks the decision the BSD pipeline makes for the claim
'rank E(Q) = ord_{s=1} L(E,s)' on one curve. The correct label follows from theory, not
from the pipeline: for algebraic rank 0 to 3 the vanishing of every derivative below the
rank is forced (parity, or Gross-Zagier and Kolyvagin in contrapositive), so a numerically
nonzero leading derivative makes the claim a verified instance; for rank 4 and above some
derivative below the rank is not forced by any available theorem, so the claim must stay
open. A false positive is a 'verified-instance' label where theory does not allow one.

The strategy under test is the code that makes the decision (domain computation,
classify_bsd, promotion policy); its version is the hash of those sources, so any change
produces a new strategy version and a new, comparable evaluation run.
"""
from __future__ import annotations

import hashlib
import inspect
import json
import time
from pathlib import Path

from psycopg.types.json import Jsonb

from . import handlers, sandbox
from .domains import bsd as bsd_domain
from .verify import promotion

# label: (a-invariants, algebraic rank by theory/literature, split). Conductors were checked with PARI.
BSD_SUITE = {
    "11a1": ([0, -1, 1, -10, -20], 0, "dev"),
    "37a1": ([0, 0, 1, -1, 0], 1, "dev"),
    "389a1": ([0, 1, 1, -2, 0], 2, "dev"),
    "5077a1": ([0, 0, 1, -7, 6], 3, "dev"),
    "234446a1": ([1, -1, 0, -79, 289], 4, "dev"),
    "14a1": ([1, 0, 1, 4, -6], 0, "heldout"),
    "15a1": ([1, 1, 1, -10, -10], 0, "heldout"),
    "43a1": ([0, 1, 1, 0, 0], 1, "heldout"),
    "53a1": ([1, -1, 1, 0, 0], 1, "heldout"),
    "433a1": ([1, 0, 0, 0, 1], 2, "heldout"),
    "19047851a1": ([0, 0, 1, -79, 342], 5, "heldout"),
}


def expected_label(rank: int) -> str:
    return "verified-instance" if rank <= 3 else "open"


def naive_classify(res: dict) -> tuple[str, list[str], list[str]]:
    """Baseline that trusts PARI's numerical analytic rank: equal ranks => verified. Kept to measure against."""
    ok = res["rank_lower"] == res["rank_upper"] == res["analytic_order_numerical"]
    return ("verified-instance" if ok else "candidate"), [], []


STRATEGIES = {
    # name: (classifier, sources whose hash identifies the strategy)
    "classify": (lambda r: handlers.classify_bsd(r), lambda: inspect.getsource(bsd_domain) + inspect.getsource(handlers.classify_bsd) + inspect.getsource(promotion)),
    "naive-baseline": (naive_classify, lambda: inspect.getsource(bsd_domain) + inspect.getsource(naive_classify)),
}


def _strategy_row(conn, name: str) -> str:
    sha = hashlib.sha256(STRATEGIES[name][1]().encode()).hexdigest()
    sid = f"ARITHMETIC-{name}-{sha[:12]}"
    if not conn.execute("select 1 from strategy_version where id=%s", (sid,)).fetchone():
        v = conn.execute("select coalesce(max(version), 0) + 1 as v from strategy_version where role='ARITHMETIC'").fetchone()["v"]
        status = "candidate" if name == "naive-baseline" else "active"
        parent = None
        if status == "active":
            prev = conn.execute("select id from strategy_version where role='ARITHMETIC' and status='active' order by version desc limit 1").fetchone()
            parent = prev["id"] if prev else None
            conn.execute("update strategy_version set status='retired' where role='ARITHMETIC' and status='active'")
        conn.execute("insert into strategy_version(id, role, version, prompt_sha256, parent, status) values (%s,'ARITHMETIC',%s,%s,%s,%s)",
                     (sid, v, sha, parent, status))
    return sid


def run_bsd_suite(conn, digits: int = 38, log=print) -> dict:
    computed: dict[str, dict] = {}
    for label, (ainvs, rank, split) in BSD_SUITE.items():
        t0 = time.monotonic()
        r = sandbox.python("noether_engine.domains.bsd", json.dumps({"op": "invariants", "args": {"ainvs": ainvs, "digits": digits}}), timeout=600)
        computed[label] = {"ok": r.exit_code == 0, "seconds": round(time.monotonic() - t0, 2),
                           "res": json.loads(r.stdout.strip().splitlines()[-1])["result"] if r.exit_code == 0 else None, "stderr": r.stderr[-400:]}
    out = {"suite": "bsd-rank-labels", "digits": digits, "strategies": {}}
    stamp = int(time.time())
    for name, (classify, _) in STRATEGIES.items():
        sid = _strategy_row(conn, name)
        rows = []
        for label, (ainvs, rank, split) in BSD_SUITE.items():
            c = computed[label]
            got = classify(c["res"])[0] if c["ok"] else "error"
            rows.append({"curve": label, "ainvs": ainvs, "split": split, "rank": rank, "expected": expected_label(rank), "got": got,
                         "rank_computed": [c["res"]["rank_lower"], c["res"]["rank_upper"]] if c["ok"] else None,
                         "analytic_order_numerical": c["res"]["analytic_order_numerical"] if c["ok"] else None, "seconds": c["seconds"]})
        splits = {}
        for split in ("dev", "heldout"):
            sel = [x for x in rows if x["split"] == split]
            correct = sum(x["got"] == x["expected"] for x in sel)
            fp = sum(x["got"] == "verified-instance" and x["expected"] != "verified-instance" for x in sel)
            fn = sum(x["expected"] == "verified-instance" and x["got"] != "verified-instance" for x in sel)
            eid = f"eval-{sid}-{split}-{stamp}"
            conn.execute("""insert into evaluation_run(id, strategy_id, suite, split, n, correct, false_positives, gaps_found, cost_usd, budget_usd, metrics)
                            values (%s,%s,'bsd-rank-labels',%s,%s,%s,%s,%s,0,0,%s)""",
                         (eid, sid, split, len(sel), correct, fp, sum(x["got"] == "open" for x in sel), Jsonb({"false_negatives": fn, "digits": digits, "cases": sel})))
            splits[split] = {"n": len(sel), "correct": correct, "false_positives": fp, "false_negatives": fn, "run": eid}
            log(f"{name:15} {split:7} {correct}/{len(sel)} correct, {fp} false positive(s), {fn} false negative(s)")
        out["strategies"][name] = {"strategy": sid, "splits": splits, "cases": rows}
    return out


def write_report(result: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=1) + "\n")
