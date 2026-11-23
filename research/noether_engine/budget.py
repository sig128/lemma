"""Restart-safe budget accounting.

Capacity is reserved atomically *before* dispatch with a single conditional
UPDATE (no read-modify-write race under concurrency), then reconciled with the
provider's reported usage. If usage is unknown (e.g. the process died after the
request), the reservation stays held and is marked 'uncertain' rather than
released: the conservative choice.
"""
from __future__ import annotations

import uuid
from datetime import date

from . import events


class BudgetExhausted(Exception):
    pass


def ensure_ledger(conn, scope: str, limit_usd: float, limit_tokens: int, period: str | None = None) -> str:
    period = period or date.today().isoformat()
    lid = f"{scope}:{period}"
    conn.execute("""insert into budget_ledger(id, scope, period, limit_usd, limit_tokens) values (%s,%s,%s,%s,%s)
                    on conflict (scope, period) do nothing""", (lid, scope, period, limit_usd, limit_tokens))
    return lid


def reserve(conn, ledger_id: str, est_usd: float, est_tokens: int, task_id: str | None, problem_id: str = "bsd") -> str:
    row = conn.execute(
        """update budget_ledger set reserved_usd = reserved_usd + %s, reserved_tokens = reserved_tokens + %s, updated_at = now()
           where id = %s and spent_usd + reserved_usd + %s <= limit_usd and spent_tokens + reserved_tokens + %s <= limit_tokens
           returning id""",
        (est_usd, est_tokens, ledger_id, est_usd, est_tokens),
    ).fetchone()
    if not row:
        events.emit(conn, "budget.exhausted", problem_id, f"Reservation of ${est_usd:.2f} / {est_tokens} tokens refused for {task_id}: ledger {ledger_id} would exceed its limit",
                    task_id=task_id, role="SYSTEM", provenance={"ledger": ledger_id})
        raise BudgetExhausted(ledger_id)
    rid = f"res-{uuid.uuid4().hex[:12]}"
    conn.execute("""insert into budget_reservation(id, ledger_id, task_id, est_usd, est_tokens, state) values (%s,%s,%s,%s,%s,'held')""",
                 (rid, ledger_id, task_id, est_usd, est_tokens))
    return rid


def reconcile(conn, reservation_id: str, actual_usd: float, actual_tokens: int) -> None:
    with conn.transaction():
        r = conn.execute("select * from budget_reservation where id=%s for update", (reservation_id,)).fetchone()
        if not r or r["state"] not in ("held", "uncertain"):
            return
        conn.execute("""update budget_ledger set reserved_usd = reserved_usd - %s, reserved_tokens = reserved_tokens - %s,
                          spent_usd = spent_usd + %s, spent_tokens = spent_tokens + %s, updated_at = now() where id=%s""",
                     (r["est_usd"], r["est_tokens"], actual_usd, actual_tokens, r["ledger_id"]))
        conn.execute("""update budget_reservation set state='reconciled', actual_usd=%s, actual_tokens=%s, reconciled_at=now() where id=%s""",
                     (actual_usd, actual_tokens, reservation_id))


def release(conn, reservation_id: str) -> None:
    """Only for reservations that provably never reached the provider."""
    with conn.transaction():
        r = conn.execute("select * from budget_reservation where id=%s for update", (reservation_id,)).fetchone()
        if not r or r["state"] != "held":
            return
        conn.execute("""update budget_ledger set reserved_usd = reserved_usd - %s, reserved_tokens = reserved_tokens - %s, updated_at=now() where id=%s""",
                     (r["est_usd"], r["est_tokens"], r["ledger_id"]))
        conn.execute("update budget_reservation set state='released', reconciled_at=now() where id=%s", (reservation_id,))


def mark_uncertain(conn, reservation_id: str, problem_id: str = "bsd") -> None:
    conn.execute("update budget_reservation set state='uncertain' where id=%s and state='held'", (reservation_id,))
    events.emit(conn, "budget.reserved", problem_id, f"Usage for {reservation_id} unknown; reservation kept held conservatively", role="SYSTEM")
