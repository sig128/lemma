# Research model

How Zeta turns research into records that can be checked. The code is the authority; file references
point to it.

## Units of work

- **Problem**: one of the six open Millennium problems, with a registry entry (`web/lib/registry/problems.ts`):
  statement, official status, community status, this app's campaign status, frontier graph, capabilities.
- **Campaign**: a named set of bounded tasks with a stated goal (`research/noether_engine/campaigns/`).
- **Bounded task**: the only unit an agent works on. It carries an exact objective and question, a role, a
  preset (the handler), inputs, limits (seconds, tokens, dollars, memory), explicit success and failure
  criteria, expected artifacts, priority, dependencies and an idempotency key (`queue.TaskSpec`). Tasks
  without criteria or limits are rejected at enqueue time.
- **Artifact**: immutable, content-addressed output (computation result, Lean source and log, report) with
  exactness (`exact`, `numerical`, `conditional`, `mixed`, `text`), conditional flags and a reproducer.
- **Claim** (`mathematical_statement`): a statement with a status, a version, a hash and a full label
  history. Statuses only change through the promotion policy.
- **Event**: an append-only, typed record of everything that happened, with actor, provenance and the
  artifacts involved. The web timeline, the runs log and live streaming all read events.

## Claim statuses and the promotion policy

`research/noether_engine/verify/promotion.py` is the only code path that changes a claim's status. Agents
return data; the worker applies the rules. Model confidence is never an input.

| Status | Required evidence |
|---|---|
| candidate | Proposed; nothing established. |
| numerically-supported | A computation artifact (numerical is fine). |
| conditionally-derived | A derivation with an explicit, non-empty assumption list. |
| verified-instance | A computation with exact components and no `proof=False` or GRH flags; assumptions such as numerical nonvanishing are recorded with the claim. |
| independently-reproduced | A fresh-process re-run by the Auditor whose result hash matches, on a claim the computation already supported. Reproduction cannot promote an open or candidate claim. |
| formally-checked | A Lean check with result `passed`: build succeeds, axioms limited to `propext`, `Classical.choice`, `Quot.sound`, the theorem elaborates against the intended statement, and it does not assume its conclusion. |
| externally-reviewed, accepted | Only from external records. The system never assigns these to itself. |
| refuted | Refutation evidence: a computation, a failed check or a rejecting review. |
| open | Recorded when theory says the question is not settled by the evidence (for example, a derivative that is zero only numerically). |

Additional rules:

- Generated arguments need at least one fresh-context Skeptic review with verdict `accept` before any promotion.
- Conditional flags (`assumes-GRH`, `proof=False`, `numerical-threshold`, `heuristic`, `database-unverified`,
  `parity-assumed`) can never support an unconditional label.
- Novelty is a separate field (`unchecked`, `found-in-literature`, ...). Passing verification says nothing about
  novelty.

## The BSD decision

For the claim "rank E(Q) = ord_{s=1} L(E,s)" on one curve (`handlers.classify_bsd`):

1. PARI's 2-descent (`ellrank`) gives exact bounds on the algebraic rank; equal bounds certify it.
2. For each k below the numerical analytic order, the derivative L^(k)(E,1) must vanish. Vanishing is
   *forced* when parity requires it (root number), when L(E,1) ≠ 0 would contradict a certified rank ≥ 1
   (Kolyvagin), or when L'(E,1) ≠ 0 would contradict a certified rank ≥ 2 (Gross–Zagier with Kolyvagin).
3. If some derivative below the leading one is only numerically zero and not forced, the claim stays open
   and the failure is recorded. Raising precision cannot settle it; the recorded campaign shows L''(E,1)
   for 234446a1 tracking the precision floor at 38, 76 and 115 digits.
4. Otherwise the claim is a verified instance, with the numerical nonvanishing of the leading derivative
   recorded as an assumption (PARI floating point, not interval arithmetic).

## Measurable improvement

Strategies are versioned (`strategy_version`: role, version, hash of the code or prompts that define it,
parent, status) and measured on suites with known answers (`evaluation_run`: suite, split, n, correct,
false positives, cost, metrics). `python -m noether_engine evaluate` runs suite `bsd-rank-labels`: 11 curves
with known ranks, 5 dev and 6 held out, where theory fixes the correct label (verified instance for ranks
0 to 3, open for rank 4 and above). It measures the current decision policy against a naive baseline that
trusts PARI's numerical analytic rank:

| Strategy | Dev | Held out |
|---|---|---|
| current policy (`classify_bsd`) | 5/5, 0 false positives | 6/6, 0 false positives |
| naive baseline | 4/5, 1 false positive (234446a1) | 5/6, 1 false positive (rank-5 curve of conductor 19047851) |

A new strategy is promoted only if it does not add false positives on the held-out split; the report is in
`exports/evaluation/bsd-rank-labels.json`. Suites for model-backed roles need a model key and are not
recorded yet.

## Durable execution

`research/noether_engine/queue.py`, `worker.py`, `budget.py`:

- **Delivery**: at-least-once. A worker claims a task under a lease and renews it with heartbeats. If a
  worker dies, the lease expires and another worker reclaims the task (attempt + 1, event
  `worker.recovered`). Completion requires still holding the lease, and results are content-addressed, so
  a duplicate delivery cannot create a second result. Exactly-once execution is not claimed.
- **Retries**: retryable failures back off exponentially with jitter; after `max_attempts` the task goes to
  the dead-letter state with its history.
- **Dependencies**: a task is dispatched only when the tasks it depends on have completed.
- **Pause and cancel**: pause applies globally or per problem and stops new dispatch. Cancellation reaches a
  running task through its heartbeat; the sandbox kills the child process group and partial logs are kept.
- **Budgets**: a daily ledger per scope. Before any model call the worker reserves the estimated cost with
  one conditional `UPDATE` (reserved + spent + estimate must stay within the limit), so concurrent workers
  cannot overspend; actual usage is reconciled, unused reservations released, and a call whose usage is
  unknown is marked uncertain rather than assumed free. A refused reservation defers the task to the next
  budget period without spending an attempt.
- **Events**: `research_event` is append-only (database triggers reject `UPDATE` and `DELETE`), each insert
  sends a `NOTIFY`, and the web's SSE endpoint replays everything after `Last-Event-ID`.

## Sources

- The registry holds 38 sources, each marked retrieved (with date and method) or metadata only. Passages are
  short quotations or paraphrases with anchors, linked to the proof nodes they support.
- The arXiv adapter (`sources/arxiv.py`) honours the terms of use: at most one request every three seconds,
  shared across all workers through a database row lock, with ETag and Last-Modified revalidation. New
  versions supersede old ones without deleting them, and summaries based on a superseded version are marked
  stale. In the build environment arXiv was unreachable; tasks that needed it blocked with the error and the
  queries kept for retry.
- Retrieved text is data. It is parsed, never executed, and instructions inside it are ignored.

## Formal verification

`verify/lean.py`, pinned toolchain `leanprover/lean4:v4.36.0` (core only, no Mathlib in this build).
A result is `passed` only when the file builds, `#print axioms` lists only the standard axioms (`sorryAx`
and custom axioms are rejected, `native_decide`'s `Lean.ofReduceBool` is flagged), the theorem elaborates
against the intended statement, and no hypothesis is the conclusion itself. The campaign checks two valid
lemmas and three seeded invalid ones (with `sorry`, a circular hypothesis, a custom axiom); all three
invalid ones are refused.

## Agents

Nine roles with versioned prompts (`agents/prompts/`) and scoped tools (`agents/roles.py`): Director,
Scout, Librarian, Arithmetic, Synthesist, Skeptic, Formalizer, Auditor, Curator. Arithmetic, Auditor and
Curator need no model. Model-backed roles reply with one JSON object per role schema; the worker validates
it and stores it as candidate data. See [agents/README.md](agents/README.md).

## Permanent memory

Nothing that informs a decision is deleted: events and artifacts are immutable, claim labels keep their
history, summaries keep versions, failed approaches are recorded with the conditions under which a retry
makes sense, and reviews keep their findings. The recorded campaign exports all of it into one bundle
(`web/public/data/runs/bsd-campaign-1.json`); single claims export with `export-claim`.

## Sandboxing

`sandbox.py` runs computational code in a child process with a fresh temporary directory, a minimal
environment (no API keys, database URL or engine settings), CPU-time, address-space and file-size limits,
and no inherited file descriptors. This is process-level isolation for trusted tools and bounded
mathematical code. Running model-generated code needs a stronger boundary (container or gVisor, no
network); see [RUNBOOK.md](RUNBOOK.md).
