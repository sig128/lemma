"""Durable task queue on PostgreSQL.

Semantics: at-least-once delivery with leases. A task is claimed under a lease
(lease_owner, lease_expires_at). Workers renew the lease with heartbeats; if a
worker dies, the lease expires and another worker reclaims the task
(attempt + 1, `worker.recovered`). Completion is conditional on still holding
the lease, and results are content-addressed, so a duplicate delivery cannot
create a second final artifact or overwrite a completed result.
Exactly-once execution is NOT claimed: handlers may run more than once and
must be idempotent in their side effects (artifacts are; events are labelled).
"""
from __future__ import annotations

import hashlib
import json
import random
from dataclasses import dataclass, field
from typing import Any

from psycopg.types.json import Jsonb

from .agents.roles import display_name

from . import events

PROBLEMS = {"bsd", "riemann", "pnp", "ns", "ym", "hodge"}


@dataclass
class TaskSpec:
    id: str
    problem_id: str
    role: str
    preset: str
    objective: str
    question: str
    success_criteria: str
    failure_criteria: str
    limits: dict[str, Any] = field(default_factory=lambda: {"seconds": 600, "tokens": 0, "usd": 0.0, "memory_mb": 2048})
    inputs: dict[str, Any] = field(default_factory=dict)
    allowed_tools: list[str] = field(default_factory=list)
    expected_artifacts: list[str] = field(default_factory=list)
    depends_on: list[str] = field(default_factory=list)
    priority: float = 0.0
    campaign_id: str | None = None
    max_attempts: int = 3

    def validate(self) -> None:
        if self.problem_id not in PROBLEMS:
            raise ValueError(f"unknown problem {self.problem_id}")
        for k in ("seconds", "tokens", "usd"):
            if k not in self.limits:
                raise ValueError(f"task limits must include {k}")
        if self.limits["seconds"] <= 0 or self.limits["seconds"] > 6 * 3600:
            raise ValueError("time limit must be within (0, 6h]")
        if not self.success_criteria or not self.failure_criteria:
            raise ValueError("bounded tasks need explicit success and failure criteria")


class LeaseLost(Exception):
    pass


class Cancelled(Exception):
    pass


def enqueue(conn, spec: TaskSpec, idempotency_key: str | None = None) -> tuple[str, bool]:
    spec.validate()
    key = idempotency_key or spec.id
    row = conn.execute(
        """insert into research_task(id, campaign_id, problem_id, role, preset, objective, question, inputs, allowed_tools, limits,
             success_criteria, failure_criteria, expected_artifacts, priority, depends_on, idempotency_key, max_attempts)
           values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
           on conflict do nothing returning id""",
        (spec.id, spec.campaign_id, spec.problem_id, spec.role, spec.preset, spec.objective, spec.question, Jsonb(spec.inputs),
         spec.allowed_tools, Jsonb(spec.limits), spec.success_criteria, spec.failure_criteria, spec.expected_artifacts,
         spec.priority, spec.depends_on, key, spec.max_attempts),
    ).fetchone()
    if row:
        events.emit(conn, "task.queued", spec.problem_id, f"Queued {display_name(spec.role)}: {spec.objective}", campaign_id=spec.campaign_id,
                    task_id=spec.id, role="DIRECTOR", provenance={"preset": spec.preset, "limits": spec.limits, "depends_on": spec.depends_on})
        return spec.id, True
    return conn.execute("select id from research_task where idempotency_key = %s", (key,)).fetchone()["id"], False


def paused_scopes(conn) -> tuple[bool, set[str]]:
    rows = conn.execute("select scope, paused from control_flag").fetchall()
    g = any(r["scope"] == "global" and r["paused"] for r in rows)
    return g, {r["scope"][8:] for r in rows if r["scope"].startswith("problem:") and r["paused"]}


def claim(conn, worker_id: str, lease_seconds: int = 60) -> dict | None:
    """Claim the highest-priority runnable task, or reclaim one whose lease expired."""
    with conn.transaction():
        g, paused = paused_scopes(conn)
        if g:
            return None
        row = conn.execute(
            """select t.* from research_task t
               where ((t.state = 'queued' and t.not_before <= now())
                      or (t.state = 'running' and t.lease_expires_at < now()))
                 and not (t.problem_id = any(%s))
                 and not exists (select 1 from unnest(t.depends_on) d join research_task u on u.id = d where u.state <> 'completed')
               order by t.priority desc, t.created_at asc
               limit 1 for update of t skip locked""",
            (list(paused),),
        ).fetchone()
        if not row:
            return None
        recovered = row["state"] == "running"
        if recovered and row["attempts"] >= row["max_attempts"]:
            conn.execute("update research_task set state='dead', lease_owner=null, finished_at=now(), updated_at=now() where id=%s", (row["id"],))
            events.emit(conn, "task.failed", row["problem_id"], f"{row['id']} exhausted {row['max_attempts']} attempts after worker loss; moved to dead letter",
                        task_id=row["id"], campaign_id=row["campaign_id"], role="SYSTEM", worker_id=worker_id)
            return None
        t = conn.execute(
            """update research_task set state='running', lease_owner=%s, lease_expires_at=now() + make_interval(secs => %s),
                 attempts = attempts + 1, started_at = coalesce(started_at, now()), updated_at=now()
               where id=%s returning *""",
            (worker_id, lease_seconds, row["id"]),
        ).fetchone()
        if recovered:
            events.emit(conn, "worker.recovered", t["problem_id"], f"Lease of {row['lease_owner']} expired; {worker_id} resumes {t['id']} (attempt {t['attempts']})",
                        task_id=t["id"], campaign_id=t["campaign_id"], role="SYSTEM", worker_id=worker_id,
                        provenance={"previous_owner": row["lease_owner"], "checkpoint": row["checkpoint"]})
        events.emit(conn, "task.started", t["problem_id"], f"{display_name(t['role'])} started: {t['objective']}", task_id=t["id"],
                    campaign_id=t["campaign_id"], role=t["role"], worker_id=worker_id, provenance={"attempt": t["attempts"]})
        return t


def heartbeat(conn, task_id: str, worker_id: str, lease_seconds: int = 60, checkpoint: dict | None = None) -> None:
    """Renew the lease. Raises LeaseLost if another worker owns it, Cancelled if cancellation was requested."""
    row = conn.execute(
        """update research_task set lease_expires_at = now() + make_interval(secs => %s), checkpoint = coalesce(%s, checkpoint), updated_at=now()
           where id=%s and lease_owner=%s and state='running' returning cancel_requested""",
        (lease_seconds, Jsonb(checkpoint) if checkpoint is not None else None, task_id, worker_id),
    ).fetchone()
    conn.execute("update worker set last_heartbeat = now() where id = %s", (worker_id,))
    if row is None:
        raise LeaseLost(task_id)
    if row["cancel_requested"]:
        raise Cancelled(task_id)


def result_hash(result: Any) -> str:
    return hashlib.sha256(json.dumps(result, sort_keys=True, default=str).encode()).hexdigest()


def complete(conn, task_id: str, worker_id: str, result: dict, summary: str) -> bool:
    """Idempotent completion. Returns True if this call completed the task."""
    h = result_hash(result)
    with conn.transaction():
        row = conn.execute(
            """update research_task set state='completed', result=%s, result_sha256=%s, result_summary=%s, finished_at=now(),
                 lease_owner=null, lease_expires_at=null, updated_at=now()
               where id=%s and state='running' and lease_owner=%s returning problem_id, campaign_id, role""",
            (Jsonb(result), h, summary, task_id, worker_id),
        ).fetchone()
        if not row:
            return False
        events.emit(conn, "task.completed", row["problem_id"], summary[:600], task_id=task_id, campaign_id=row["campaign_id"],
                    role=row["role"], worker_id=worker_id, provenance={"result_sha256": h})
        return True


def backoff_seconds(attempt: int, base: float = 5.0, cap: float = 900.0) -> float:
    return min(cap, base * 2 ** (attempt - 1)) * (0.75 + 0.5 * random.random())


def fail(conn, task_id: str, worker_id: str, error: str, retryable: bool) -> str:
    with conn.transaction():
        t = conn.execute("select * from research_task where id=%s for update", (task_id,)).fetchone()
        if not t or t["state"] != "running" or t["lease_owner"] != worker_id:
            return "ignored"
        if retryable and t["attempts"] < t["max_attempts"]:
            delay = backoff_seconds(t["attempts"])
            conn.execute("""update research_task set state='queued', lease_owner=null, lease_expires_at=null,
                              not_before = now() + make_interval(secs => %s), updated_at=now() where id=%s""", (delay, task_id))
            events.emit(conn, "task.retried", t["problem_id"], f"{task_id} failed (attempt {t['attempts']}): {error[:300]}; retry in {delay:.0f}s",
                        task_id=task_id, campaign_id=t["campaign_id"], role="SYSTEM", worker_id=worker_id, provenance={"error": error[:2000]})
            return "retry"
        conn.execute("""update research_task set state='dead', lease_owner=null, lease_expires_at=null, finished_at=now(),
                          result_summary=%s, updated_at=now() where id=%s""", (f"Dead letter: {error[:500]}", task_id))
        events.emit(conn, "task.failed", t["problem_id"], f"{task_id} moved to dead letter: {error[:400]}", task_id=task_id,
                    campaign_id=t["campaign_id"], role="SYSTEM", worker_id=worker_id, provenance={"error": error[:2000], "attempts": t["attempts"]})
        return "dead"


def defer(conn, task_id: str, worker_id: str, reason: str) -> bool:
    """Put a running task back in the queue until the next UTC day without spending an attempt.
    Used when the budget ledger refuses a reservation: that is a limit, not a task failure."""
    with conn.transaction():
        t = conn.execute("""update research_task set state='queued', lease_owner=null, lease_expires_at=null,
                              attempts = greatest(attempts - 1, 0),
                              not_before = date_trunc('day', now() at time zone 'utc') at time zone 'utc' + interval '1 day',
                              updated_at=now()
                            where id=%s and lease_owner=%s and state='running' returning problem_id, campaign_id, not_before""",
                         (task_id, worker_id)).fetchone()
        if t:
            events.emit(conn, "agent.waiting", t["problem_id"], f"{task_id} waits for the next budget period ({reason[:200]})", task_id=task_id,
                        campaign_id=t["campaign_id"], role="SYSTEM", worker_id=worker_id, provenance={"not_before": t["not_before"].isoformat()})
        return bool(t)


def block(conn, task_id: str, worker_id: str, reason: str, capability: str | None = None) -> None:
    with conn.transaction():
        t = conn.execute("""update research_task set state='blocked', blocked_reason=%s, lease_owner=null, lease_expires_at=null, finished_at=now(), updated_at=now()
                            where id=%s and lease_owner=%s returning problem_id, campaign_id, role""", (reason, task_id, worker_id)).fetchone()
        if t:
            events.emit(conn, "capability.unavailable" if capability else "dependency.blocked", t["problem_id"], reason[:600], task_id=task_id,
                        campaign_id=t["campaign_id"], role=t["role"], worker_id=worker_id, provenance={"capability": capability})


def mark_canceled(conn, task_id: str, worker_id: str, partial_artifacts: list[dict]) -> None:
    with conn.transaction():
        t = conn.execute("""update research_task set state='canceled', lease_owner=null, lease_expires_at=null, finished_at=now(), updated_at=now()
                            where id=%s returning problem_id, campaign_id""", (task_id,)).fetchone()
        if t:
            events.emit(conn, "task.canceled", t["problem_id"], f"{task_id} stopped after cancellation; partial logs preserved",
                        task_id=task_id, campaign_id=t["campaign_id"], role="SYSTEM", worker_id=worker_id, artifacts=partial_artifacts)


def request_cancel(conn, task_id: str) -> None:
    conn.execute("""update research_task set cancel_requested=true,
                      state = case when state in ('queued','waiting','paused','blocked') then 'canceled' else state end, updated_at=now()
                    where id=%s""", (task_id,))


def set_paused(conn, scope: str, paused: bool, by: str = "owner") -> None:
    conn.execute("""insert into control_flag(scope, paused, updated_by) values (%s,%s,%s)
                    on conflict (scope) do update set paused=excluded.paused, updated_by=excluded.updated_by, updated_at=now()""", (scope, paused, by))
    events.emit(conn, "run.paused" if paused else "run.resumed", "bsd" if scope == "global" else scope.split(":", 1)[1],
                f"{'Paused' if paused else 'Resumed'} {scope}", role="OWNER")
