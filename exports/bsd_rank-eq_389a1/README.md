# Evidence bundle: Rank equality for 389a1

Claim id `bsd:rank-eq:389a1`, statement sha256 `c2e0356124c2a3b75f053647a6dafcd359e424fba456544db89613ece2ca8634`.

> rank E(Q) = ord_(s=1) L(E,s) for E = 389a1 [0, 1, 1, -2, 0]

Status in this system: **independently-reproduced**. Novelty: unchecked.

Status labels follow the promotion policy in `research/noether_engine/verify/promotion.py`; model confidence is never an input.
This bundle is evidence about one statement. It is not a proof of any Millennium Prize Problem.

## Label history

- 2026-11-23T20:13:28.450993Z: candidate → verified-instance. computation with exact components and no conditional flags; assumption recorded: numerical nonvanishing of L^(2)(E,1) at 38 digits (PARI floating point, not interval arithmetic)
- 2026-11-23T20:13:28.829438Z: verified-instance → independently-reproduced. fresh-process re-run matched

## Assumptions

- numerical nonvanishing of L^(2)(E,1) at 38 digits (PARI floating point, not interval arithmetic)

## Sources invoked

- Modular elliptic curves and Fermat's Last Theorem (Andrew Wiles, 1995). Retrieval: metadata-only. https://doi.org/10.2307/2118559
- On the modularity of elliptic curves over Q: wild 3-adic exercises (C. Breuil, B. Conrad, F. Diamond, R. Taylor, 2001). Retrieval: metadata-only. https://doi.org/10.1090/S0894-0347-01-00370-8
- Heegner points and derivatives of L-series (Benedict H. Gross, Don B. Zagier, 1986). Retrieval: metadata-only. https://doi.org/10.1007/BF01388809
- Euler systems (Victor A. Kolyvagin, 1990). Retrieval: metadata-only. https://doi.org/10.1007/978-0-8176-4575-5_11
- PARI/GP reference: elliptic curves (ellrank, ellanalyticrank, ellsaturation, ellratpoints) (The PARI Group, 2026). Retrieval: retrieved. https://pari.math.u-bordeaux.fr/dochtml/html/Elliptic_curves.html
- The Birch and Swinnerton-Dyer Conjecture (official problem description) (Andrew Wiles, 2000). Retrieval: retrieved. https://www.claymath.org/wp-content/uploads/2022/05/birchswin.pdf

## Artifacts and how to reproduce them

- `art-506cef63dd37f5c5` PARI invariants for 389a1 (bsd.invariants, mixed). sha256 `506cef63dd37f5c56314648efb551d7de42eb3293157a3b3bde437a1107b4c39`.
  File: `artifacts/art-506cef63dd37f5c5`. Reproduce: `echo '{"op":"invariants","args":{"ainvs":[0, 1, 1, -2, 0]}}' | PYTHONPATH=research python3 -m noether_engine.domains.bsd`
- `art-df25be14e873858d` Fresh-process re-run for 389a1 (audit.rerun, text). sha256 `df25be14e873858d27aaee498d860669b99550f64eb8365137173703968e3f29`.
  File: `artifacts/art-df25be14e873858d`

## Verification records

A passed computation check means a fresh process reproduced the artifact exactly. It does not add to what the artifact shows.

- computation check `ver-df25be14e873858d`: **passed**. Scope: PARI invariants for 389a1. Findings: result hash matches the original run.

## Checking a computation yourself

Run a PARI artifact's reproducer from the repository root, with the environment pinned in `research/requirements.txt`.
The SHA-256 of the canonical JSON of the output's `result` field equals the artifact's sha256:

```sh
echo '<request>' | PYTHONPATH=research python3 -m noether_engine.domains.bsd \
  | PYTHONPATH=research python3 -c "import sys, json, hashlib; from noether_engine import artifacts; r = json.loads(sys.stdin.read().splitlines()[-1])['result']; print(hashlib.sha256(artifacts.canonical(r)).hexdigest())"
```

Lean artifacts are the checked source and the checker's log; re-check with `lean` 4.36.0 and `#print axioms`.
