# Implementation plan and status

Built in slices, each usable on its own. Status as of 2026-11-23.

| Slice | Scope | Status |
|---|---|---|
| A. Shell and BSD | Tokens, typography, layout, command palette, URL state, focus mode, export; BSD curve and exact group law, L-function ledger, twist family, inspector | Done |
| B. Five more workspaces | Riemann strip and explicit formula; P vs NP solver with checked certificates and benchmark; Navier–Stokes 2D solver; Yang–Mills lattice with exact solution; Hodge ray tracer with exact lines | Done |
| C. Registry and status model | Six problems, Poincaré archive, three extensions without prize; official, community and campaign status in separate dated fields; 38 sources with retrieval status | Done |
| D. Durable engine | PostgreSQL queue with leases, heartbeats, retries, dead letters, dependencies, idempotency, pause and cancel; budget ledger; append-only events; sandbox; worker CLI | Done, exercised with two workers and an induced crash |
| E. Sources | Registry ingestion, arXiv adapter with shared rate limit and conditional requests, version supersession, stale summaries | Done; arXiv tested on a fixture only (no network in the build environment) |
| F. Verification | Lean pipeline (axiom audit, statement correspondence, circularity), promotion policy, Auditor re-runs, rule-based Skeptic | Done; Lean core only, no Mathlib |
| G. Agents | Nine roles, prompts, scoped tools, Claude provider adapter with budget reservation | Implemented; model calls not exercised (no key in the build environment) |
| H. First BSD campaign | 31 bounded tasks over the 12 campaign steps, recorded and replayable | Done; 24 completed, 7 blocked on network, model or missing adapters |
| I. Live mode | Snapshot, events, SSE with Last-Event-ID replay, owner controls with bearer token, bounded task creation | Implemented; exercised against the local database |
| J. Evaluation | Strategy versions and evaluation runs; suite `bsd-rank-labels` against a naive baseline | Done for the BSD decision policy; model-role suites need a key |
| K. Exports | Claim evidence bundles, run bundle, PNG and SVG figure export | Done |
| L. Review and docs | Three visual review passes at three sizes, tests, docs | Done |

## Not done, and why

- **Model-backed research**: the provider adapter, prompts and budget path exist, but no model key was
  available, so no model output was produced or evaluated. Those tasks block with the reason.
- **Literature from arXiv**: the adapter is implemented and tested against a recorded response; the build
  environment could not reach arXiv.
- **Riemann audit of the released Lean proof** and **Navier–Stokes statement-correspondence audit**: blocked on
  network access to the released archives and on compute; recorded as blocked tasks, not simulated.
- **3D Navier–Stokes and 4D SU(N) lattice instruments**: not implemented; the workspaces say so and show 2D
  educational instruments with exact checks.
- **SageMath and Mathlib**: not installed; PARI and Lean core cover the recorded campaign.
- **Container isolation for generated code**: the process-level sandbox is in place; the container or gVisor
  boundary is described in the runbook and not built here.
- **Always-on operation**: the web app is deployable as is; continuous research needs workers and PostgreSQL
  on a host that stays up (see `docs/RUNBOOK.md`).
