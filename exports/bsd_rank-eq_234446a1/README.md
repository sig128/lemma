# Evidence bundle: Rank equality for 234446a1

Claim id `bsd:rank-eq:234446a1`, statement sha256 `074c2d6c8d9a9a0f8c88aade57a7f92efe506c2129fb60320d44b39ce254c61c`.

> rank E(Q) = ord_(s=1) L(E,s) for E = 234446a1 [1, -1, 0, -79, 289]

Status in this system: **candidate**. Novelty: unchecked.

Status labels follow the promotion policy in `research/noether_engine/verify/promotion.py`; model confidence is never an input.
This bundle is evidence about one statement. It is not a proof of any Millennium Prize Problem.

## Label history

- No change from candidate.

## Assumptions

- numerical nonvanishing of L^(4)(E,1) at 38 digits (PARI floating point, not interval arithmetic)

## Sources invoked

- Modular elliptic curves and Fermat's Last Theorem (Andrew Wiles, 1995). Retrieval: metadata-only. https://doi.org/10.2307/2118559
- On the modularity of elliptic curves over Q: wild 3-adic exercises (C. Breuil, B. Conrad, F. Diamond, R. Taylor, 2001). Retrieval: metadata-only. https://doi.org/10.1090/S0894-0347-01-00370-8
- Heegner points and derivatives of L-series (Benedict H. Gross, Don B. Zagier, 1986). Retrieval: metadata-only. https://doi.org/10.1007/BF01388809
- Euler systems (Victor A. Kolyvagin, 1990). Retrieval: metadata-only. https://doi.org/10.1007/978-0-8176-4575-5_11
- PARI/GP reference: elliptic curves (ellrank, ellanalyticrank, ellsaturation, ellratpoints) (The PARI Group, 2026). Retrieval: retrieved. https://pari.math.u-bordeaux.fr/dochtml/html/Elliptic_curves.html
- The Birch and Swinnerton-Dyer Conjecture (official problem description) (Andrew Wiles, 2000). Retrieval: retrieved. https://www.claymath.org/wp-content/uploads/2022/05/birchswin.pdf

## Artifacts and how to reproduce them

- `art-2a8c531896436358` PARI invariants for 234446a1 (bsd.invariants, mixed, flags: numerical-threshold). sha256 `2a8c5318964363581f8063d855cf997127e85ab4812b8003c8a72a03c537f7fc`.
  File: `artifacts/art-2a8c531896436358`. Reproduce: `echo '{"op":"invariants","args":{"ainvs":[1, -1, 0, -79, 289]}}' | PYTHONPATH=research python3 -m noether_engine.domains.bsd`
- `art-40c77d059460c031` Fresh-process re-run for 234446a1 (audit.rerun, text). sha256 `40c77d059460c031e009b47113a64b920cbf419f1a45599a43282427e083201f`.
  File: `artifacts/art-40c77d059460c031`
- `art-6b67a05109ac398c` L^(2)(E,1) for 234446a1 at increasing precision (bsd.precision, numerical, flags: numerical-threshold). sha256 `6b67a05109ac398c30de9337b3afdb8ae7b364200a951b2df67507b03a360f7a`.
  File: `artifacts/art-6b67a05109ac398c`

## Verification records

A passed computation check means a fresh process reproduced the artifact exactly. It does not add to what the artifact shows.

- computation check `ver-40c77d059460c031`: **passed**. Scope: PARI invariants for 234446a1. Findings: result hash matches the original run.

## Recorded failures

- Determine ord_{s=1} L(E,s) from PARI's numerical analytic rank: An unforced derivative is below PARI's zero threshold; the threshold assumes vanishing. Retry only: Only with a theorem forcing vanishing, or a certified method for exact zeros.

## Checking a computation yourself

Run a PARI artifact's reproducer from the repository root, with the environment pinned in `research/requirements.txt`.
The SHA-256 of the canonical JSON of the output's `result` field equals the artifact's sha256:

```sh
echo '<request>' | PYTHONPATH=research python3 -m noether_engine.domains.bsd \
  | PYTHONPATH=research python3 -c "import sys, json, hashlib; from noether_engine import artifacts; r = json.loads(sys.stdin.read().splitlines()[-1])['result']; print(hashlib.sha256(artifacts.canonical(r)).hexdigest())"
```

Lean artifacts are the checked source and the checker's log; re-check with `lean` 4.36.0 and `#print axioms`.
