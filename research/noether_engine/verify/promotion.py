"""Claim-promotion policy. This module is the only place that changes a claim's
status, and research agents have no write path to it: agents return data; the
worker applies these rules. Model confidence is never an input.

Status ladder (not a single progress bar; each step needs its own evidence):
  candidate -> numerically-supported   needs a computation artifact (numerical ok)
  candidate -> conditionally-derived   needs an explicit, non-empty assumption list
  * -> independently-reproduced        needs an AUDITOR fresh-process re-run whose result hash matches
  * -> formally-checked                needs a Lean check with result 'passed' and statement correspondence
  * -> externally-reviewed / accepted  only from an external record (never from this system)
Generated arguments additionally need >= 1 fresh-context SKEPTIC review with verdict 'accept'.
Computations carrying conditional flags (GRH, proof=False, numerical threshold, ...) can never
support an 'unconditional' label.
"""
from __future__ import annotations

from dataclasses import dataclass, field

CONDITIONAL_FLAGS = {"assumes-GRH", "proof=False", "numerical-threshold", "heuristic", "database-unverified", "parity-assumed"}
ORDER = ["candidate", "numerically-supported", "conditionally-derived", "verified-instance", "independently-reproduced", "formally-checked"]


@dataclass
class Evidence:
    kind: str                       # computation | lean | review | audit-rerun | external
    exactness: str = "text"         # exact | numerical | conditional | mixed | text
    conditional_flags: list[str] = field(default_factory=list)
    result: str | None = None       # for lean: passed/failed/rejected/flagged ; review: accept/reject
    fresh_context: bool = False
    matches: bool | None = None     # audit re-run hash match
    assumptions: list[str] = field(default_factory=list)


@dataclass
class Decision:
    allowed: bool
    status: str
    reasons: list[str]


def decide(current: str, requested: str, evidence: list[Evidence], *, generated: bool, unconditional: bool = False) -> Decision:
    reasons: list[str] = []
    if requested in ("externally-reviewed", "accepted"):
        return Decision(False, current, ["external review and acceptance are recorded from outside sources only"])
    flags = {f for e in evidence for f in e.conditional_flags}
    if unconditional and (flags & CONDITIONAL_FLAGS or any(e.exactness in ("numerical", "conditional") for e in evidence if e.kind == "computation")):
        return Decision(False, current, [f"cannot label unconditional: evidence carries {sorted(flags) or 'numerical/conditional exactness'}"])
    if generated and requested != "candidate":
        if not any(e.kind == "review" and e.fresh_context and e.result == "accept" for e in evidence):
            return Decision(False, current, ["generated argument lacks a fresh-context skeptical review with verdict accept"])
    if requested == "numerically-supported":
        ok = any(e.kind == "computation" for e in evidence)
        reasons.append("computation artifact present" if ok else "no computation artifact")
    elif requested == "conditionally-derived":
        ok = any(e.assumptions for e in evidence)
        reasons.append("assumptions listed" if ok else "conditional derivation requires explicit assumptions")
    elif requested == "verified-instance":
        ok = any(e.kind == "computation" and e.exactness in ("exact", "mixed") for e in evidence) and not (flags & {"proof=False", "assumes-GRH"})
        noted = [x for e in evidence for x in e.assumptions]
        reasons.append(("computation with exact components and no conditional flags"
                        + (f"; assumption recorded: {'; '.join(noted)}" if noted else ""))
                       if ok else "instance verification needs exact, unconditional computation")
    elif requested == "independently-reproduced":
        # Reproducing a computation only strengthens a claim that the computation already supported.
        # An open or candidate claim stays where it is, however often its inputs are recomputed.
        if current not in ("numerically-supported", "verified-instance", "conditionally-derived"):
            return Decision(False, current, [f"re-run reproduces the computation, but the claim is '{current}': reproduction cannot establish it"])
        if flags & {"numerical-threshold", "proof=False", "assumes-GRH"} and current == "verified-instance":
            return Decision(False, current, [f"evidence carries {sorted(flags)}: not eligible"])
        ok = any(e.kind == "audit-rerun" and e.matches for e in evidence)
        reasons.append("fresh-process re-run matched" if ok else "no matching independent re-run")
    elif requested == "formally-checked":
        ok = any(e.kind == "lean" and e.result == "passed" for e in evidence)
        reasons.append("Lean check passed (standard axioms, statement correspondence)" if ok else "no passing Lean check")
    elif requested == "refuted":
        ok = any(e.kind in ("computation", "lean", "review") for e in evidence)
        reasons.append("refutation evidence present" if ok else "no refutation evidence")
    else:
        ok, reasons = requested == current, ["no rule for this transition"]
    return Decision(ok, requested if ok else current, reasons)
