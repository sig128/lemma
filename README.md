# Lemma, the mathematics observatory

Lemma is a research workspace for the seven Millennium Prize Problems. Six open problems each get an
interactive instrument that computes something real, a source-backed map of what is known, and a research
board where bounded tasks are planned, run, checked and recorded. The Poincaré conjecture sits in a solved
archive. Birch and Swinnerton-Dyer (BSD) is the flagship, with a complete recorded research campaign.

Lemma does not claim to solve any Millennium problem, shows no progress percentages, and never labels a
result as solved. Official status (from the Clay Mathematics Institute), community status and this app's own
campaign status are separate fields, each with a date.

The project began under the codename NOETHER, after Emmy Noether. Internal identifiers keep it: the Python
package `noether_engine`, the `NOETHER_*` settings and the database name.

## Start it locally

One path, no accounts or keys needed:

```sh
cd web
npm ci
npm run dev
```

Open http://localhost:3000. Without a database the app runs in demonstration mode: every instrument computes
in your browser, and the research views replay the recorded BSD campaign from
`web/public/data/runs/bsd-campaign-1.json`. The top bar says "Demonstration: recorded runs" so the mode is
never ambiguous.

## Run the research engine (live mode)

Live mode needs PostgreSQL 16+, Python 3.13 and, for formal checks, Lean 4.36.0.

```sh
python3 -m pip install -r research/requirements.txt
export DATABASE_URL=postgresql://user:password@localhost:5432/noether
export PYTHONPATH=$PWD/research
python3 -m noether_engine migrate
python3 -m noether_engine seed bsd-first        # queue the first BSD campaign (31 bounded tasks)
python3 -m noether_engine worker --id w1        # run as many workers as you like, each with its own id
```

Then start the web app with the same `DATABASE_URL` (and `NOETHER_ADMIN_TOKEN` to enable the owner controls).
The top bar switches to "Engine live" and the timeline streams events over SSE with replay after reconnects.
`scripts/run_campaign_local.sh` runs the whole campaign with two workers and an induced worker crash, then
exports the bundle the demonstration mode replays. Continuous operation needs an always-on host: see
[docs/RUNBOOK.md](docs/RUNBOOK.md).

## What is in the repository

| Path | What it is |
|---|---|
| `web/` | Next.js app: six workspaces, archive, research cockpit, sources reader, proof graphs, runs, settings |
| `web/lib/registry/` | Single source of truth for problems, statuses, frontier nodes, capabilities and the 38 sources |
| `web/public/data/` | Precomputed datasets (PARI curves and twists, mpmath zeros, exact Clebsch lines) and the recorded run |
| `research/noether_engine/` | Durable queue, workers, budget ledger, sandbox, arXiv adapter, Lean pipeline, promotion policy, agent roles |
| `research/scripts/` | Data generators for the web datasets and the capability document |
| `db/migrations/` | PostgreSQL schema with append-only event and artifact triggers |
| `lean/` | Pinned toolchain and the lemmas the campaign checks, including three seeded invalid ones |
| `exports/` | Sample evidence bundles: a reproduced rank-2 instance, the open rank-4 case, a formally checked lemma |
| `docs/` | Plan, design spec, research model, capability matrix, runbook, agent roles |

## Tests

```sh
cd web && npm test                      # group law, SAT solver and proof checker, NS solver, lattice gauge theory, formatting
cd research && python3 -m pytest -q     # queue, leases, budget, events, sources, Lean pipeline, promotion policy
```

The Python tests need a local PostgreSQL (`NOETHER_TEST_ADMIN_URL`, default
`postgresql://noether@localhost:5433/postgres`). The Lean tests run when `lean` 4.36.0 is on `PATH` (or at
`/opt/lean/lean-4.36.0-linux/bin/lean`) and are skipped otherwise.

## Honesty rules the code enforces

- Claims move between statuses only through `research/noether_engine/verify/promotion.py`; model output is data
  and model confidence is never an input.
- Numerical evidence never becomes an unconditional statement; conditional routines keep their flags.
- A Lean result counts only after the axiom audit, the statement-correspondence check and the circularity check.
- Missing capabilities (no network to arXiv, no model key, no 3D solver) are recorded as events, not simulated.
- External acceptance is recorded from outside sources only; the system never assigns it to itself.
