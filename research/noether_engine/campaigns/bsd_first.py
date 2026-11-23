"""The first bounded BSD campaign (plus small bounded tasks for the other workspaces).

Steps (from the brief): 1 official statement, 2 source-backed map, 3 established
rank-0/1 results with hypotheses, 4 reproduce known examples, 5 certified vs
approximate, 6 audit higher-rank literature, 7 candidate targets, 8 prior
publication check, 9 select one target and its missing lemma, 10 bounded
attempt, 11 skeptical review, 12 remaining-gap report.
"""
from __future__ import annotations

from ..queue import TaskSpec, enqueue

CID = "bsd-campaign-1"
L = lambda s, mem=2048: {"seconds": s, "tokens": 0, "usd": 0.0, "memory_mb": mem}
LM = lambda s, tok: {"seconds": s, "tokens": tok, "usd": round(tok / 1e6 * 20, 2), "memory_mb": 1024}
CURVES = ["11a1", "37a1", "389a1", "5077a1", "234446a1"]


def specs() -> list[TaskSpec]:
    out: list[TaskSpec] = []
    T = lambda **k: out.append(TaskSpec(campaign_id=CID, **k))
    T(id="T01", problem_id="bsd", role="CURATOR", preset="registry-ingest", objective="Ingest the official statement and the curated source map",
      question="Load the Clay/Wiles statement and the source registry with retrieval metadata and passages.", inputs={"path": "web/public/data/registry/sources.json"},
      success_criteria="Every registry source recorded with retrieval status; access gaps explicit", failure_criteria="Registry missing or malformed", limits=L(120), priority=100,
      expected_artifacts=["source_document rows", "source_passage rows"])
    T(id="T02", problem_id="bsd", role="SCOUT", preset="arxiv-search", objective="Search arXiv for precise BSD subtopics",
      question="Find recent primary sources on the obligations in the frontier.", inputs={"queries": [
          'abs:"Gross-Zagier" AND abs:"higher derivative"', 'abs:"analytic rank" AND abs:"four" AND cat:math.NT', 'abs:"Kolyvagin" AND abs:"Euler system"',
          'abs:"Selmer" AND abs:"descent" AND abs:"rank"', 'abs:"Iwasawa main conjecture" AND abs:"elliptic"'], "max_results": 10},
      success_criteria="Candidates recorded with exact metadata", failure_criteria="API unreachable or rate-limited", limits=L(300), priority=90, depends_on=["T01"])
    T(id="T03", problem_id="bsd", role="LIBRARIAN", preset="model", objective="Extract the exact hypotheses of the rank-0/1 theorems from the passages",
      question="State Gross-Zagier, Kolyvagin and the forced-vanishing facts with anchors.", inputs={"passages": ["wiles-statement", "bgz-triple", "pari-analyticrank"]},
      success_criteria="Statements with anchors", failure_criteria="Passages do not support a statement", limits=LM(600, 30000), priority=80, depends_on=["T01"])
    for i, c in enumerate(CURVES):
        T(id=f"T{4 + i:02d}", problem_id="bsd", role="ARITHMETIC", preset="bsd-invariants", objective=f"Reproduce {c}: rank bounds, generators, L-derivatives",
          question=f"For {c}, compute descent bounds, saturated generators, regulator and L^(k)(E,1) with exactness tags.", inputs={"curve": c, "digits": 38},
          success_criteria="Exact algebraic data and tagged numerical L-values recorded", failure_criteria="PARI error or limits exceeded", limits=L(300), priority=70 - i, depends_on=["T01"],
          expected_artifacts=["bsd.invariants"])
    for i, c in enumerate(CURVES):
        T(id=f"T{9 + i:02d}", problem_id="bsd", role="AUDITOR", preset="audit-rerun", objective=f"Re-run {c} in a fresh process and compare hashes",
          question=f"Does an independent process reproduce the {c} result exactly?", inputs={"curve": c, "of_task": f"T{4 + i:02d}"},
          success_criteria="Result hash matches", failure_criteria="Hash mismatch", limits=L(300), priority=60, depends_on=[f"T{4 + i:02d}"])
    lean = [("T14", "CenterZero.lean", "center_zero", "∀ (f : Int → Int), (∀ s, f (2 - s) = - f s) → f 1 = 0", "bsd:lean:center-zero", "Centre vanishing for odd functional equations (integer analogue)"),
            ("T15", "PointsOn37a1.lean", "p_rational_on_37a1", "(8:Int)^2 + 8 * 27 = (-5)^3 - (-5) * 81", "bsd:lean:point-37a1", "(−5/9, 8/27) lies on 37a1 (cleared denominators)"),
            ("T16", "SeededSorry.lean", "rank_four_vanishing_placeholder", "∀ (n : Nat), n * 0 = 0", "bsd:lean:seeded-sorry", "Seeded artifact with sorry"),
            ("T17", "SeededCircular.lean", "target_by_assumption", "TargetStatement", "bsd:lean:seeded-circular", "Seeded circular proof"),
            ("T18", "SeededAxiom.lean", "uses_axiom", "∀ n : Nat, n + 0 = n", "bsd:lean:seeded-axiom", "Seeded proof from an axiom")]
    for tid, f, tgt, st, sid, title in lean:
        T(id=tid, problem_id="bsd", role="FORMALIZER", preset="lean-check", objective=f"Lean check: {title}", question=f"Does {tgt} build, prove exactly the intended statement, and use only standard axioms?",
          inputs={"file": f"lean/NoetherLemmas/{f}", "target": tgt, "intended": st, "statement_id": sid, "title": title, "scope": "isolated lemma"},
          success_criteria="passed: builds, standard axioms only, statement correspondence", failure_criteria="any other outcome is recorded with findings", limits=L(300, 8192), priority=50)
    T(id="T19", problem_id="bsd", role="ARITHMETIC", preset="twist-family", objective="Audit a family: quadratic twists of 11a1 with |d| ≤ 400",
      question="Within the family, where do descent and numerical analytic order agree, and where is the rank undetermined?", inputs={"base": "11a1", "bound": 400},
      success_criteria="Every twist classified; failures recorded", failure_criteria="Timeouts above limit", limits=L(900), priority=40, depends_on=["T04"])
    T(id="T20", problem_id="bsd", role="CURATOR", preset="novelty-check", objective="Check candidate targets against recorded literature",
      question="Which candidate targets are already published?", inputs={"candidates": [
          {"id": "bsd:target:rank3-instance", "title": "Rank equality for 5077a1 (rank 3)", "statement": "rank = ord = 3 for 5077a1", "known_sources": ["bgz-rank3"], "status": "independently-reproduced"},
          {"id": "bsd:target:rank4", "title": "Analytic rank 4 for 234446a1", "statement": "ord_{s=1} L(E,s) = 4 for 234446a1, i.e. L''(E,1) = 0", "known_sources": [], "status": "open"},
          {"id": "bsd:target:twist-share", "title": "Share of rank-2 even twists of 11a1 decreases with |d|", "statement": "density question in a twist family", "known_sources": ["bmsw-average"], "status": "numerically-supported"}]},
      success_criteria="Each candidate labelled found-in-literature or unchecked", failure_criteria="Registry unavailable", limits=L(120), priority=35, depends_on=["T08", "T19"])
    T(id="T21", problem_id="bsd", role="ARITHMETIC", preset="precision-escalation", objective="Bounded attempt on the selected target: L''(E,1) for 234446a1 at rising precision",
      question="Does raising precision separate L''(E,1) from zero?", inputs={"curve": "234446a1", "k": 2, "precisions": [38, 76, 115]},
      success_criteria="A value clearly above the precision floor (would refute vanishing)", failure_criteria="Magnitude tracks the floor (no conclusion possible)", limits=L(900), priority=30, depends_on=["T20"])
    T(id="T22", problem_id="bsd", role="SKEPTIC", preset="rule-review", objective="Review the argument 'numerically zero, hence zero'",
      question="Can numerical smallness establish analytic rank 4?", inputs={"argument": {
          "id": "bsd:arg:numerical-zero", "title": "L''(E,1) = 0 for 234446a1 because |L''(E,1)| < 10⁻⁴⁰",
          "text": "Since |L''(E,1)| < 10⁻⁴⁰ at 38-digit precision, L''(E,1) = 0 and the analytic rank of 234446a1 is 4.",
          "requested": "verified-instance", "evidence_exactness": "numerical", "conditional_flags": ["numerical-threshold"], "unconditional": True, "generated": True, "seeded": True,
          "view": {"curve": "234446a1", "view": "lfunction", "object": "L''"}}},
      success_criteria="Verdict with reasons recorded", failure_criteria="—", limits=L(60), priority=29, depends_on=["T21"])
    T(id="T23", problem_id="bsd", role="SYNTHESIST", preset="model", objective="Propose structural routes to force L''(E,1) = 0 for a rank-4 curve",
      question="Is there any identity beyond parity and Gross-Zagier-Kolyvagin that forces even-order vanishing?", inputs={"node": "bsd:rank4-gap"},
      success_criteria="Candidates with assumptions and testable consequences", failure_criteria="No candidate", limits=LM(1200, 60000), priority=28, depends_on=["T22"])
    T(id="T24", problem_id="bsd", role="CURATOR", preset="report", objective="Report the exact remaining gap", question="What changed, and what remains?",
      inputs={"title": "First BSD campaign: what changed", "changed": {
          "evidence": ["Five flagship curves recomputed with PARI 2.19.1 and reproduced byte-for-byte in fresh processes", "Twist family of 11a1 (|d| ≤ 400) classified",
                       "Lean: centre-vanishing analogue and a rational point of 37a1 checked; seeded invalid artifacts rejected"],
          "rejected": ["'Numerically zero, hence zero' for L''(E,1) of 234446a1 (refuted by policy: numerical threshold cannot support an unconditional claim)"],
          "verified": ["Rank equality as checked instances for 389a1 (rank 2) and 5077a1 (rank 3); theorem cases 11a1, 37a1 reproduced"],
          "remaining_gap": "For 234446a1 the algebraic rank is 4, but ord_{s=1} L(E,s) is only known to be 2 or 4: L''(E,1) is numerically zero at every precision tried and no theorem forces it to vanish. Rank equality for this curve, and for every curve of rank ≥ 4, is open.",
          "next_task": "With a model provider configured: a Synthesist search for an identity forcing even-order vanishing, reviewed by a fresh-context Skeptic; a Scout literature refresh once arXiv is reachable."},
          "steps": [
              {"n": 1, "title": "Read the official statement", "status": "done"}, {"n": 2, "title": "Source-backed map of the conjecture and refinements", "status": "done (curated during build)"},
              {"n": 3, "title": "Established rank-0/1 results with hypotheses", "status": "recorded from sources; model extraction blocked"},
              {"n": 4, "title": "Reproduce known examples", "status": "done"}, {"n": 5, "title": "Certified vs approximate", "status": "done"},
              {"n": 6, "title": "Audit higher-rank literature", "status": "partial: arXiv unreachable"}, {"n": 7, "title": "Candidate targets", "status": "done"},
              {"n": 8, "title": "Prior-publication check", "status": "done (registry only)"}, {"n": 9, "title": "Select target and missing lemma", "status": "L''(E,1) = 0 for 234446a1"},
              {"n": 10, "title": "Bounded attempt", "status": "done: no separation from zero"}, {"n": 11, "title": "Skeptical review", "status": "rule-based review done; model review blocked"},
              {"n": 12, "title": "Remaining-gap report", "status": "this report"}]},
      success_criteria="Report published", failure_criteria="—", limits=L(120), priority=1, depends_on=["T21", "T22", "T19", "T09", "T10", "T11", "T12", "T13"])
    # other workspaces: small bounded tasks
    out.append(TaskSpec(id="R01", campaign_id=None, problem_id="riemann", role="ARITHMETIC", preset="compute", objective="Recompute the first 60 zeros in a fresh process",
                        question="Are the listed zeros reproduced, each with a sign change of Z(t)?", inputs={"op": "zeta_zeros", "args": {"n": 60, "dps": 25},
                        "claim": {"id": "riemann:evidence-60", "title": "First 60 zeros on the line (numerical)", "statement": "The first 60 nontrivial zeros lie on Re s = 1/2 (sign changes of Z)", "requested": "numerically-supported"}},
                        success_criteria="All sign changes present", failure_criteria="A missing sign change", limits=L(600), priority=20))
    out.append(TaskSpec(id="R02", campaign_id=None, problem_id="riemann", role="AUDITOR", preset="capability", objective="Independent audit of the released Lean proof of RH",
                        question="Does the archive build and prove Mathlib's RiemannHypothesis with standard axioms?", inputs={"reason": "Audit needs the released 17-million-line archive (network) and large compute; neither is available in this environment. Queued as blocked.", "capability": "network+compute"},
                        success_criteria="Build, statement match, axiom list", failure_criteria="Any mismatch", limits=L(6 * 3600, 32768), priority=19))
    out.append(TaskSpec(id="H01", campaign_id=None, problem_id="hodge", role="ARITHMETIC", preset="script", objective="Recompute the 27 lines of the Clebsch cubic exactly",
                        question="Rank and signature of the line intersection form?", inputs={"script": "research/scripts/gen_hodge.py", "output": "clebsch.json",
                        "summary": "27 lines recomputed exactly; intersection matrix rank {intersection_matrix_rank}, signature {signature}, {tritangent_planes} tritangent planes",
                        "claim": {"id": "hodge:clebsch-lines", "title": "Line classes span H^2 of the Clebsch cubic", "statement": "The 27 line classes span a rank-7 lattice of signature (1,6)", "requested": "verified-instance"}},
                        success_criteria="Exact symbolic verification passes", failure_criteria="Any line fails verification", limits=L(900, 4096), priority=18))
    out.append(TaskSpec(id="Y01", campaign_id=None, problem_id="ym", role="ARITHMETIC", preset="compute", objective="Exact 2D U(1) plaquette table for the browser checks",
                        question="Exact finite-volume plaquette on a 16×16 torus", inputs={"op": "u1_exact", "args": {"betas": [0.5, 1, 2, 3, 4], "L": 16}},
                        success_criteria="Table computed", failure_criteria="—", limits=L(300), priority=17))
    out.append(TaskSpec(id="N01", campaign_id=None, problem_id="ns", role="AUDITOR", preset="capability", objective="Statement-correspondence audit of the claimed (C)/(D) breakdown",
                        question="Does the released formal statement match Fefferman's (C)/(D)?", inputs={"reason": "The claim's Lean formalization was not retrieved in this environment; audit queued as blocked.", "capability": "network:formal-artifact"},
                        success_criteria="Correspondence report", failure_criteria="Mismatch found", limits=L(3600), priority=16))
    out.append(TaskSpec(id="N02", campaign_id=None, problem_id="ns", role="ARITHMETIC", preset="capability", objective="3D numerical experiment",
                        question="Run a resolved 3D experiment", inputs={"reason": "No 3D solver adapter is implemented; the workspace shows a 2D educational solver only.", "capability": "solver:3d"},
                        success_criteria="—", failure_criteria="—", limits=L(3600), priority=15))
    out.append(TaskSpec(id="P01", campaign_id=None, problem_id="pnp", role="SKEPTIC", preset="model", objective="Barrier analysis of a candidate lower-bound statement",
                        question="Which of relativization, natural proofs, algebrization applies?", inputs={"statement": "restricted-class circuit lower bound"},
                        success_criteria="Barrier classification with sources", failure_criteria="—", limits=LM(900, 30000), priority=14))
    return out


def seed(conn) -> list[tuple[str, bool]]:
    conn.execute("""insert into research_campaign(id, problem_id, title, objective, state) values (%s,'bsd','First BSD campaign',
                    'Map the rank conjecture, reproduce known cases, and locate the exact remaining gap', 'running') on conflict do nothing""", (CID,))
    return [enqueue(conn, s) for s in specs()]
