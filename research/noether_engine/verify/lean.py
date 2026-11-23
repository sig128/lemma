"""Formal checks with a pinned Lean toolchain.

A proof-check result is only 'passed' when ALL of the following hold:
  1. the file builds with the pinned toolchain (exit code 0, no errors);
  2. `#print axioms` for the target lists only the standard axioms
     {propext, Classical.choice, Quot.sound} -- sorryAx is never accepted,
     custom `axiom` declarations are rejected, and Lean.ofReduceBool
     (native_decide: trusts the compiler) is flagged;
  3. statement correspondence: `example : <intended statement> := @target`
     elaborates, i.e. the theorem proves exactly the intended proposition;
  4. the theorem does not assume its own conclusion (no hypothesis whose type
     is the conclusion), and the intended statement is not itself an axiom.
Lean checks a formal statement relative to its foundations. Passing says
nothing about novelty, nor about whether the informal reading of the
statement is right; those are separate records.
"""
from __future__ import annotations

import hashlib
import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from .. import sandbox

STANDARD_AXIOMS = {"propext", "Classical.choice", "Quot.sound"}
TOOLCHAIN = "leanprover/lean4:v4.36.0"


@dataclass
class LeanCheck:
    result: str  # passed | failed | rejected | flagged
    target: str
    statement_sha256: str
    axioms: list[str] = field(default_factory=list)
    findings: list[str] = field(default_factory=list)
    log: str = ""
    exit_code: int = 0
    toolchain: dict[str, str] = field(default_factory=dict)
    reproducer: str = ""


def lean_version(lean_bin: str) -> str:
    r = sandbox.run([lean_bin, "--version"], timeout=30, memory_mb=8192)
    return r.stdout.strip()


def _strip_comments(src: str) -> str:
    src = re.sub(r"/-.*?-/", "", src, flags=re.S)
    return re.sub(r"--[^\n]*", "", src)


def check(source: str, target: str, intended_statement: str, *, lean_bin: str = "lean", timeout: float = 300) -> LeanCheck:
    st_hash = hashlib.sha256(intended_statement.strip().encode()).hexdigest()
    findings: list[str] = []
    code = _strip_comments(source)
    custom_axioms = re.findall(r"^\s*axiom\s+([\w.']+)\s*:(.*)$", code, flags=re.M)
    norm = lambda s: re.sub(r"\s+", " ", s).strip()
    for name, ty in custom_axioms:
        findings.append(f"custom axiom declared: {name}")
        if norm(ty) == norm(intended_statement):
            findings.append(f"the intended statement is declared as axiom {name}: the target is assumed, not proved")
    probe = (
        f"{source}\n\n#print axioms {target}\n"
        f"example : {intended_statement} := @{target}\n"
        f"#check (@{target})\n"
    )
    with tempfile.TemporaryDirectory(prefix="noether-lean-") as d:
        f = Path(d) / "Check.lean"
        f.write_text(probe)
        r = sandbox.run([lean_bin, str(f)], timeout=timeout, memory_mb=8192, cwd=Path(d))  # Lean reserves large virtual regions; 4 GB AS is too small
    log = (r.stdout + "\n" + r.stderr).strip()
    version = ""
    try:
        version = lean_version(lean_bin)
    except Exception:  # noqa: BLE001
        version = "unknown"
    tc = {"toolchain": TOOLCHAIN, "lean --version": version}
    repro = f"lean Check.lean  # file = submitted source + '#print axioms {target}' + statement-correspondence example"
    axioms: list[str] = []
    m = re.search(rf"'{re.escape(target)}' depends on axioms: \[(.*?)\]", log, flags=re.S)
    if m:
        axioms = [a.strip() for a in m.group(1).replace("\n", " ").split(",") if a.strip()]
    elif re.search(rf"'{re.escape(target)}' does not depend on any axioms", log):
        axioms = []
    errors = [ln for ln in log.splitlines() if re.search(r":\d+:\d+: error", ln)]
    if r.timed_out:
        return LeanCheck("failed", target, st_hash, axioms, findings + ["timed out"], log, r.exit_code, tc, repro)
    circular = _assumes_conclusion(code, target)
    if circular:
        findings.append("assumes its own conclusion: a hypothesis has the same type as the conclusion")
    if errors or r.exit_code != 0:
        corr = [e for e in errors if "type mismatch" in e.lower()]
        findings.extend(["build failed: " + e.split("error:", 1)[-1].strip()[:200] for e in errors[:6]])
        if corr:
            findings.append("statement correspondence failed: the theorem does not prove the intended statement")
        return LeanCheck("failed", target, st_hash, axioms, findings, log, r.exit_code, tc, repro)
    result = "passed"
    if "sorryAx" in axioms or re.search(r"declaration uses 'sorry'", log):
        findings.append("uses sorryAx: incomplete proof, cannot receive complete-proof status")
        result = "rejected"
    extra = [a for a in axioms if a not in STANDARD_AXIOMS and a != "sorryAx"]
    for a in extra:
        if a in ("Lean.ofReduceBool", "Lean.trustCompiler") or "native_decide" in a or "._native." in a:
            findings.append(f"{a}: proof relies on native code evaluation (native_decide); flagged, not accepted as kernel-checked")
            result = "flagged" if result == "passed" else result
        else:
            findings.append(f"depends on non-standard axiom {a}")
            result = "rejected"
    if custom_axioms:
        result = "rejected"
    if circular:
        result = "rejected"
    return LeanCheck(result, target, st_hash, axioms, findings, log[-6000:], r.exit_code, tc, repro)


def _assumes_conclusion(code: str, target: str) -> bool:
    """Syntactic circularity flag: a binder of the target theorem has exactly the conclusion's type."""
    norm = lambda s: re.sub(r"\s+", " ", s).strip()
    sig = re.search(rf"(theorem|lemma)\s+{re.escape(target)}\s*(.*?):=", code, flags=re.S)
    if not sig:
        return False
    head = sig.group(2)
    binders = re.findall(r"\(\s*[\w\s']+:\s*([^()]+?)\)", head)
    depth, cut = 0, -1
    for i, ch in enumerate(head):
        depth += ch in "([{"
        depth -= ch in ")]}"
        if ch == ":" and depth == 0:
            cut = i
    concl = head[cut + 1:] if cut >= 0 else ""
    return bool(concl.strip()) and any(norm(b) == norm(concl) for b in binders)
