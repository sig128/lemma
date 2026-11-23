import threading

import psycopg
import pytest

from noether_engine import artifacts, budget, db, events


def test_budget_enforced_under_concurrent_dispatch(conn, url):
    lid = budget.ensure_ledger(conn, "global", 1.00, 10_000_000)
    ok, refused = [], []

    def go(i):
        c = db.connect(url)
        try:
            ok.append(budget.reserve(c, lid, 0.10, 1000, f"t{i}"))
        except budget.BudgetExhausted:
            refused.append(i)
        finally:
            c.close()

    th = [threading.Thread(target=go, args=(i,)) for i in range(25)]
    [t.start() for t in th]
    [t.join() for t in th]
    assert len(ok) == 10 and len(refused) == 15
    row = conn.execute("select reserved_usd, spent_usd from budget_ledger where id=%s", (lid,)).fetchone()
    assert float(row["reserved_usd"]) == pytest.approx(1.0)
    budget.reconcile(conn, ok[0], 0.04, 400)
    row = conn.execute("select reserved_usd, spent_usd from budget_ledger where id=%s", (lid,)).fetchone()
    assert float(row["reserved_usd"]) == pytest.approx(0.9) and float(row["spent_usd"]) == pytest.approx(0.04)
    budget.mark_uncertain(conn, ok[1])
    row = conn.execute("select reserved_usd from budget_ledger where id=%s", (lid,)).fetchone()
    assert float(row["reserved_usd"]) == pytest.approx(0.9)  # uncertain stays reserved


def test_event_log_is_append_only(conn):
    seq = events.emit(conn, "task.queued", "bsd", "hello")
    with pytest.raises(psycopg.errors.RaiseException):
        conn.execute("update research_event set summary='x' where seq=%s", (seq,))
    with pytest.raises(psycopg.errors.RaiseException):
        conn.execute("delete from research_event where seq=%s", (seq,))
    with pytest.raises(ValueError):
        events.emit(conn, "made.up", "bsd", "x")


def test_replay_after_sequence_number(conn):
    seqs = [events.emit(conn, "task.queued", "bsd" if i % 2 else "riemann", f"e{i}") for i in range(6)]
    got = events.after(conn, seqs[1])
    assert [g["seq"] for g in got] == seqs[2:]
    assert all(g["problem_id"] == "bsd" for g in events.after(conn, 0, "bsd"))


def test_artifacts_are_immutable(conn):
    a = artifacts.put(conn, "x", "t", {"v": 2})
    with pytest.raises(psycopg.errors.RaiseException):
        conn.execute("update artifact set title='y' where id=%s", (a["id"],))
