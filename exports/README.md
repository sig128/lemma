# Sample exports

Each folder is a self-contained evidence bundle for one claim from the recorded BSD campaign, written by
`python -m noether_engine export-claim <claim-id> exports`. A bundle holds the claim and its label history,
the assumptions, the sources it invokes, the artifacts with their reproducers and hashes, the verification
records, reviews and recorded failures, plus a README that reads them out.

| Folder | Claim | Status | Why it is here |
|---|---|---|---|
| `bsd_rank-eq_389a1/` | rank E(Q) = ord L(E,s) at s = 1 for 389a1 | independently reproduced | A rank-2 instance: exact descent, vanishing forced by theorems, numerically nonzero L''(E,1), and a fresh-process re-run with a matching hash. |
| `bsd_rank-eq_234446a1/` | the same statement for 234446a1 | candidate | The open case: algebraic rank 4, but L''(E,1) is zero only numerically, at every precision tried. The re-run reproduces the computation and, by policy, cannot promote it. |
| `bsd_lean_point-37a1/` | a rational point identity on 37a1 | formally checked | A Lean 4.36.0 check that passed the axiom audit and the statement-correspondence check. |

`evaluation/bsd-rank-labels.json` is the evaluation run behind the "measurable improvement" claim: the BSD
decision policy against a naive baseline that trusts PARI's numerical analytic rank, on 11 curves with known
ranks (5 dev, 6 held out). The policy labels all 11 correctly; the baseline produces one false
"verified instance" in each split (the rank-4 and rank-5 curves).

None of these bundles is a proof of the Birch and Swinnerton-Dyer conjecture or of any other Millennium
Prize Problem.
