"""Long-running worker: claim → execute under lease with heartbeats → record.

Run one process per concurrency slot (NOETHER_CONCURRENCY, default 2) under a
supervisor that restarts it (systemd, Docker restart policy, Fly/Render
process groups). A killed worker loses nothing durable: its lease expires and
another worker resumes the task.
"""
from __future__ import annotations

import os
import platform
import socket
import threading
import time
import traceback

from psycopg.types.json import Jsonb

from .agents.roles import display_name

from . import artifacts, budget, db, queue
from .config import settings
from .handlers import HANDLERS, Blocked, Ctx, Retryable, _Cancelled


def register(conn, worker_id: str) -> None:
    caps = {"pari": True, "lean": os.path.exists(settings().lean_bin) or settings().lean_bin == "lean", "model": bool(os.environ.get("ANTHROPIC_API_KEY")), "python": platform.python_version()}
    conn.execute("""insert into worker(id, host, pid, version, capabilities) values (%s,%s,%s,'0.1.0',%s)
                    on conflict (id) do update set host=excluded.host, pid=excluded.pid, capabilities=excluded.capabilities, started_at=now(), last_heartbeat=now()""",
                 (worker_id, socket.gethostname(), os.getpid(), Jsonb(caps)))


def run(worker_id: str, *, stop_when_idle: bool = False, idle_grace: float = 20.0, poll: float = 1.0, log=print) -> int:
    s = settings()
    conn = db.connect()
    hb_conn = db.connect()
    register(conn, worker_id)
    done = 0
    idle_since = None
    while True:
        t = queue.claim(conn, worker_id, s.lease_seconds)
        if not t:
            conn.execute("update worker set last_heartbeat=now() where id=%s", (worker_id,))
            if stop_when_idle:
                idle_since = idle_since or time.monotonic()
                pending = conn.execute("select count(*) as n from research_task where state in ('queued','running')").fetchone()["n"]
                if pending == 0 or time.monotonic() - idle_since > idle_grace:
                    if pending == 0:
                        return done
            time.sleep(poll)
            continue
        idle_since = None
        log(f"[{worker_id}] claimed {t['id']} ({t['preset']}, attempt {t['attempts']})")
        flag = {"cancel": False, "lost": False}
        stop = threading.Event()

        def beat(task_id=t["id"]):
            while not stop.wait(s.heartbeat_seconds):
                try:
                    queue.heartbeat(hb_conn, task_id, worker_id, s.lease_seconds)
                except queue.Cancelled:
                    flag["cancel"] = True
                except queue.LeaseLost:
                    flag["lost"] = True
                except Exception:  # noqa: BLE001 - transient DB error: keep trying until the lease expires
                    pass

        th = threading.Thread(target=beat, daemon=True)
        th.start()

        def check():
            if flag["lost"]:
                raise queue.LeaseLost(t["id"])
            if flag["cancel"]:
                raise queue.Cancelled(t["id"])

        ctx = Ctx(conn, worker_id, check, lambda cp: queue.heartbeat(hb_conn, t["id"], worker_id, s.lease_seconds, cp))
        try:
            handler = HANDLERS[t["preset"]]
            result = handler(ctx, t)
            summary = result.pop("summary", None) or f"{display_name(t['role'])}: {t['objective']}"
            if queue.complete(conn, t["id"], worker_id, result, summary):
                done += 1
                log(f"[{worker_id}] completed {t['id']}")
            else:
                log(f"[{worker_id}] {t['id']} already completed elsewhere; result discarded (idempotent)")
        except Blocked as b:
            queue.block(conn, t["id"], worker_id, b.reason, b.capability)
            log(f"[{worker_id}] blocked {t['id']}: {b.reason}")
        except budget.BudgetExhausted as e:
            queue.defer(conn, t["id"], worker_id, f"ledger {e} exhausted")
            log(f"[{worker_id}] budget exhausted; {t['id']} deferred to the next budget period")
        except (_Cancelled, queue.Cancelled) as c:
            partial = []
            run_ = getattr(c, "run", None)
            if run_ is not None:
                partial.append(artifacts.put(conn, "partial.log", f"Partial output of {t['id']}", raw=(run_.stdout + "\n--- stderr ---\n" + run_.stderr).encode(), task_id=t["id"]))
            queue.mark_canceled(conn, t["id"], worker_id, partial)
            log(f"[{worker_id}] canceled {t['id']}")
        except queue.LeaseLost:
            log(f"[{worker_id}] lost lease on {t['id']}; another worker owns it")
        except Retryable as e:
            log(f"[{worker_id}] retryable failure on {t['id']}: {e}")
            queue.fail(conn, t["id"], worker_id, str(e), retryable=True)
        except Exception as e:  # noqa: BLE001
            log(f"[{worker_id}] error on {t['id']}: {e}")
            queue.fail(conn, t["id"], worker_id, f"{type(e).__name__}: {e}\n{traceback.format_exc()[-1500:]}", retryable=True)
        finally:
            stop.set()
            th.join(timeout=2)
