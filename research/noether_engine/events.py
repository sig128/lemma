"""Typed, persisted research events (schema version 1). Append-only."""
from __future__ import annotations

import uuid
from typing import Any

from psycopg.types.json import Jsonb

EVENT_TYPES = {
    "source.discovered", "source.ingested", "statement.extracted",
    "task.queued", "task.started", "task.checkpointed", "task.completed", "task.failed", "task.canceled", "task.retried",
    "experiment.started", "experiment.completed",
    "claim.proposed", "claim.refuted", "claim.promoted",
    "proof.check.started", "proof.check.failed", "proof.check.passed",
    "dependency.blocked", "capability.unavailable", "agent.waiting",
    "run.paused", "run.resumed", "budget.reserved", "budget.exhausted",
    "worker.recovered", "report.published",
}


def emit(conn, type: str, problem_id: str, summary: str, *, campaign_id: str | None = None, task_id: str | None = None,
         run_id: str | None = None, role: str = "SYSTEM", worker_id: str | None = None,
         artifacts: list[dict[str, str]] | None = None, provenance: dict[str, Any] | None = None,
         verification: dict[str, Any] | None = None, view: dict[str, Any] | None = None) -> int:
    if type not in EVENT_TYPES:
        raise ValueError(f"unknown event type {type!r}")
    if not summary or len(summary) > 600:
        raise ValueError("event summary must be 1-600 characters")
    row = conn.execute(
        """insert into research_event(event_id, type, problem_id, campaign_id, task_id, run_id, actor, artifacts, summary, provenance, verification, view)
           values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning seq""",
        (str(uuid.uuid4()), type, problem_id, campaign_id, task_id, run_id, Jsonb({"role": role, "worker_id": worker_id}),
         Jsonb(artifacts or []), summary, Jsonb(provenance or {}), Jsonb(verification) if verification else None, Jsonb(view) if view else None),
    ).fetchone()
    return int(row["seq"])


def after(conn, seq: int, problem_id: str | None = None, limit: int = 500) -> list[dict]:
    return conn.execute(
        "select * from research_event where seq > %s and (%s::text is null or problem_id = %s) order by seq limit %s",
        (seq, problem_id, problem_id, limit),
    ).fetchall()
