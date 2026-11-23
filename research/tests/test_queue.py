import time

import pytest

from noether_engine import artifacts, db, events, queue
from noether_engine.queue import TaskSpec


def spec(i="t1", **kw):
    base = dict(id=i, problem_id="bsd", role="ARITHMETIC", preset="compute", objective="obj", question="q",
                success_criteria="s", failure_criteria="f", limits={"seconds": 60, "tokens": 0, "usd": 0})
    base.update(kw)
    return TaskSpec(**base)


def count(conn, type_):
    return conn.execute("select count(*) n from research_event where type=%s", (type_,)).fetchone()["n"]


def test_enqueue_is_idempotent(conn):
    assert queue.enqueue(conn, spec()) == ("t1", True)
    assert queue.enqueue(conn, spec()) == ("t1", False)
    assert count(conn, "task.queued") == 1


def test_bounded_task_validation(conn):
    with pytest.raises(ValueError):
        queue.enqueue(conn, spec(success_criteria=""))
    with pytest.raises(ValueError):
        queue.enqueue(conn, spec(limits={"seconds": 0, "tokens": 0, "usd": 0}))


def test_duplicate_completion_does_not_duplicate_results(conn):
    queue.enqueue(conn, spec())
    t = queue.claim(conn, "w1")
    a1 = artifacts.put(conn, "x", "result", {"v": 1}, task_id=t["id"])
    a2 = artifacts.put(conn, "x", "result", {"v": 1}, task_id=t["id"])
    assert a1 == a2
    assert conn.execute("select count(*) n from artifact").fetchone()["n"] == 1
    assert queue.complete(conn, "t1", "w1", {"a": a1}, "done") is True
    assert queue.complete(conn, "t1", "w1", {"a": a1}, "done") is False
    assert count(conn, "task.completed") == 1


def test_worker_loss_lease_expiry_and_recovery(conn):
    queue.enqueue(conn, spec())
    t = queue.claim(conn, "w-dead", lease_seconds=1)
    assert t["attempts"] == 1
    assert queue.claim(conn, "w2") is None  # still leased
    time.sleep(1.4)
    t2 = queue.claim(conn, "w2", lease_seconds=30)
    assert t2["id"] == "t1" and t2["attempts"] == 2 and t2["lease_owner"] == "w2"
    assert count(conn, "worker.recovered") == 1
    with pytest.raises(queue.LeaseLost):
        queue.heartbeat(conn, "t1", "w-dead")
    assert queue.complete(conn, "t1", "w-dead", {}, "late") is False
    assert queue.complete(conn, "t1", "w2", {"ok": True}, "done") is True


def test_pause_prevents_dispatch(conn):
    queue.enqueue(conn, spec("a", problem_id="bsd"))
    queue.enqueue(conn, spec("b", problem_id="riemann"))
    queue.set_paused(conn, "global", True)
    assert queue.claim(conn, "w1") is None
    queue.set_paused(conn, "global", False)
    queue.set_paused(conn, "problem:bsd", True)
    t = queue.claim(conn, "w1")
    assert t["id"] == "b"
    assert queue.claim(conn, "w1") is None
    assert count(conn, "run.paused") == 2


def test_cancellation_reaches_running_task_and_keeps_partial_logs(conn):
    queue.enqueue(conn, spec())
    queue.claim(conn, "w1")
    queue.request_cancel(conn, "t1")
    with pytest.raises(queue.Cancelled):
        queue.heartbeat(conn, "t1", "w1")
    part = artifacts.put(conn, "partial.log", "partial", raw=b"step 1 done\n", task_id="t1")
    queue.mark_canceled(conn, "t1", "w1", [part])
    row = conn.execute("select state from research_task where id='t1'").fetchone()
    assert row["state"] == "canceled"
    assert conn.execute("select count(*) n from artifact where id=%s", (part["id"],)).fetchone()["n"] == 1
    assert count(conn, "task.canceled") == 1


def test_queued_task_cancels_immediately(conn):
    queue.enqueue(conn, spec())
    queue.request_cancel(conn, "t1")
    assert conn.execute("select state from research_task where id='t1'").fetchone()["state"] == "canceled"
    assert queue.claim(conn, "w1") is None


def test_retry_backoff_then_dead_letter(conn):
    queue.enqueue(conn, spec(max_attempts=2))
    queue.claim(conn, "w1")
    assert queue.fail(conn, "t1", "w1", "boom", retryable=True) == "retry"
    nb = conn.execute("select not_before > now() as later from research_task where id='t1'").fetchone()
    assert nb["later"]
    conn.execute("update research_task set not_before = now() where id='t1'")
    queue.claim(conn, "w1")
    assert queue.fail(conn, "t1", "w1", "boom again", retryable=True) == "dead"
    assert conn.execute("select state from research_task where id='t1'").fetchone()["state"] == "dead"


def test_dependencies_gate_dispatch(conn):
    queue.enqueue(conn, spec("a"))
    queue.enqueue(conn, spec("b", depends_on=["a"], priority=10))
    t = queue.claim(conn, "w1")
    assert t["id"] == "a"
    assert queue.claim(conn, "w2") is None
    queue.complete(conn, "a", "w1", {}, "ok")
    assert queue.claim(conn, "w2")["id"] == "b"


def test_budget_refusal_defers_without_spending_an_attempt(conn):
    queue.enqueue(conn, spec("D1"))
    t = queue.claim(conn, "w1", 30)
    assert t["id"] == "D1" and t["attempts"] == 1
    assert queue.defer(conn, "D1", "w1", "ledger global exhausted")
    row = conn.execute("select state, attempts, not_before > now() as later from research_task where id='D1'").fetchone()
    assert row["state"] == "queued" and row["attempts"] == 0 and row["later"]
    assert queue.claim(conn, "w1", 30) is None   # not before the next budget period
    ev = conn.execute("select type from research_event where task_id='D1' order by seq desc limit 1").fetchone()
    assert ev["type"] == "agent.waiting"
