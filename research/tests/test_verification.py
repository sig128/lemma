import shutil
from pathlib import Path

import pytest

from noether_engine.verify import lean, promotion
from noether_engine.verify.promotion import Evidence

LEAN = shutil.which("lean") or "/opt/lean/lean-4.36.0-linux/bin/lean"
ROOT = Path(__file__).resolve().parents[2]
needs_lean = pytest.mark.skipif(not Path(LEAN).exists(), reason="Lean toolchain not installed")


def src(name):
    return (ROOT / "lean" / "NoetherLemmas" / name).read_text()


@needs_lean
def test_seeded_valid_lemma_passes():
    r = lean.check(src("CenterZero.lean"), "center_zero", "∀ (f : Int → Int), (∀ s, f (2 - s) = - f s) → f 1 = 0", lean_bin=LEAN)
    assert r.result == "passed" and set(r.axioms) <= lean.STANDARD_AXIOMS


@needs_lean
def test_sorry_cannot_receive_complete_status():
    r = lean.check(src("SeededSorry.lean"), "rank_four_vanishing_placeholder", "∀ (n : Nat), n * 0 = 0", lean_bin=LEAN)
    assert r.result == "rejected" and "sorryAx" in r.axioms


@needs_lean
def test_proof_assuming_its_conclusion_is_rejected_or_flagged():
    r = lean.check(src("SeededCircular.lean"), "target_by_assumption", "TargetStatement", lean_bin=LEAN)
    assert r.result in ("failed", "rejected")
    assert any("assumes its own conclusion" in f for f in r.findings)
    assert any("statement correspondence" in f for f in r.findings)


@needs_lean
def test_target_imported_as_axiom_is_rejected():
    r = lean.check(src("SeededAxiom.lean"), "uses_axiom", "∀ n : Nat, n + 0 = n", lean_bin=LEAN)
    assert r.result == "rejected"
    assert any("declared as axiom" in f for f in r.findings)


@needs_lean
def test_invalid_argument_fails_to_build():
    r = lean.check("theorem bad (a : Nat) : a + 1 = a := by omega", "bad", "∀ (a : Nat), a + 1 = a", lean_bin=LEAN)
    assert r.result == "failed"


def test_numerical_threshold_cannot_be_unconditional():
    d = promotion.decide("candidate", "verified-instance", [Evidence("computation", "numerical", ["numerical-threshold"])], generated=False, unconditional=True)
    assert not d.allowed


def test_conditional_flag_blocks_unconditional_label():
    d = promotion.decide("candidate", "verified-instance", [Evidence("computation", "exact", ["proof=False"])], generated=False, unconditional=True)
    assert not d.allowed
    d2 = promotion.decide("candidate", "verified-instance", [Evidence("computation", "exact", ["assumes-GRH"])], generated=False)
    assert not d2.allowed


def test_generated_argument_needs_fresh_context_review():
    ev = [Evidence("computation", "exact")]
    assert not promotion.decide("candidate", "numerically-supported", ev, generated=True).allowed
    ev.append(Evidence("review", result="accept", fresh_context=False))
    assert not promotion.decide("candidate", "numerically-supported", ev, generated=True).allowed
    ev.append(Evidence("review", result="accept", fresh_context=True))
    assert promotion.decide("candidate", "numerically-supported", ev, generated=True).allowed


def test_system_never_assigns_external_acceptance():
    ev = [Evidence("lean", result="passed"), Evidence("review", result="accept", fresh_context=True)]
    assert not promotion.decide("formally-checked", "accepted", ev, generated=False).allowed
    assert not promotion.decide("formally-checked", "externally-reviewed", ev, generated=False).allowed


def test_formal_status_requires_passing_check():
    assert not promotion.decide("candidate", "formally-checked", [Evidence("lean", result="rejected")], generated=False).allowed
    assert promotion.decide("candidate", "formally-checked", [Evidence("lean", result="passed")], generated=False).allowed


def test_reproduction_cannot_promote_an_open_claim():
    rerun = [Evidence("audit-rerun", matches=True, conditional_flags=["numerical-threshold"])]
    assert not promotion.decide("candidate", "independently-reproduced", rerun, generated=False).allowed
    assert not promotion.decide("open", "independently-reproduced", rerun, generated=False).allowed
    ok = promotion.decide("verified-instance", "independently-reproduced", [Evidence("audit-rerun", matches=True)], generated=False)
    assert ok.allowed and ok.status == "independently-reproduced"


def _res(rank, w, values, eps=1e-19):
    ders = []
    for k, v in enumerate(values):
        forced = (-1) ** k == -w or (k == 0 and rank >= 1) or (k == 1 and rank >= 2)
        ders.append({"k": k, "value": str(v), "abs_below_eps": abs(v) < eps, "forced_zero_by_theorem": forced})
    return {"rank_lower": rank, "rank_upper": rank, "analytic_order_numerical": len(values) - 1, "derivatives_at_1": ders,
            "provenance": {"realprecision": 38}}


def test_evaluation_separates_policy_from_naive_baseline():
    from noether_engine import evaluation, handlers
    rank2 = _res(2, +1, [4e-41, -2e-41, 1.5186])            # 389a1-like: every zero below the rank is forced
    rank4 = _res(4, +1, [-9e-42, 3e-41, 7e-42, -2e-40, 214.65])  # 234446a1-like: L'' is zero only numerically
    assert handlers.classify_bsd(rank2)[0] == "verified-instance"
    assert handlers.classify_bsd(rank4)[0] == "open"
    assert evaluation.naive_classify(rank4)[0] == "verified-instance"   # the false positive the suite measures
    assert evaluation.expected_label(4) == "open" and evaluation.expected_label(3) == "verified-instance"
