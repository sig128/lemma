# Evidence bundle: (−5/9, 8/27) lies on 37a1 (cleared denominators)

Claim id `bsd:lean:point-37a1`, statement sha256 `aef6ace210f0be7615e311bf7cca3acdf902d92e5dd9891c809e700aead5684b`.

> (8:Int)^2 + 8 * 27 = (-5)^3 - (-5) * 81

Status in this system: **formally-checked**. Novelty: unchecked.

Status labels follow the promotion policy in `research/noether_engine/verify/promotion.py`; model confidence is never an input.
This bundle is evidence about one statement. It is not a proof of any Millennium Prize Problem.

## Label history

- 2026-11-23T20:13:29.227230Z: candidate → formally-checked. Lean check passed (standard axioms, statement correspondence)

## Assumptions

- None recorded.

## Sources invoked

- The Birch and Swinnerton-Dyer Conjecture (official problem description) (Andrew Wiles, 2000). Retrieval: retrieved. https://www.claymath.org/wp-content/uploads/2022/05/birchswin.pdf

## Artifacts and how to reproduce them

- `art-3d3dcbedf85beb9e` Lean log for p_rational_on_37a1 (lean.log, text). sha256 `3d3dcbedf85beb9e8b4261b241046fde163c28f3404b843229aaa07e21c26e4a`.
  File: `artifacts/art-3d3dcbedf85beb9e`
- `art-cd26d239b75ef280` lean/NoetherLemmas/PointsOn37a1.lean (lean.source, exact). sha256 `cd26d239b75ef280aab1458ac508896b69b9f8b7cf64a45e1857cd18c6249429`.
  File: `artifacts/art-cd26d239b75ef280`

## Verification records

A passed computation check means a fresh process reproduced the artifact exactly. It does not add to what the artifact shows.

- lean check `ver-3d3dcbedf85beb9e-p_rational_on_37a1`: **passed**. Scope: isolated lemma. Findings: none.

## Checking a computation yourself

Run a PARI artifact's reproducer from the repository root, with the environment pinned in `research/requirements.txt`.
The SHA-256 of the canonical JSON of the output's `result` field equals the artifact's sha256:

```sh
echo '<request>' | PYTHONPATH=research python3 -m noether_engine.domains.bsd \
  | PYTHONPATH=research python3 -c "import sys, json, hashlib; from noether_engine import artifacts; r = json.loads(sys.stdin.read().splitlines()[-1])['result']; print(hashlib.sha256(artifacts.canonical(r)).hexdigest())"
```

Lean artifacts are the checked source and the checker's log; re-check with `lean` 4.36.0 and `#print axioms`.
