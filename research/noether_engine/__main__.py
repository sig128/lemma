"""NOETHER research engine CLI.

  python -m noether_engine migrate
  python -m noether_engine seed bsd-first
  python -m noether_engine worker [--id w1] [--until-idle]
  python -m noether_engine status
  python -m noether_engine pause [global|problem:<id>] / resume ...
  python -m noether_engine cancel <task-id>
  python -m noether_engine export <out-dir> [--campaign bsd-campaign-1]
  python -m noether_engine export-claim <claim-id> <out-dir>
  python -m noether_engine evaluate [--report path.json]
"""
from __future__ import annotations

import argparse
import json
import os
import socket
from pathlib import Path

from . import claim_export, db, evaluation, export, queue, worker
from .campaigns import bsd_first


def main() -> None:
    ap = argparse.ArgumentParser(prog="noether_engine")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("migrate")
    s = sub.add_parser("seed"); s.add_argument("campaign", choices=["bsd-first"])
    w = sub.add_parser("worker"); w.add_argument("--id", default=f"{socket.gethostname()}-{os.getpid()}"); w.add_argument("--until-idle", action="store_true")
    sub.add_parser("status")
    p = sub.add_parser("pause"); p.add_argument("scope", default="global", nargs="?")
    r = sub.add_parser("resume"); r.add_argument("scope", default="global", nargs="?")
    c = sub.add_parser("cancel"); c.add_argument("task")
    e = sub.add_parser("export"); e.add_argument("out"); e.add_argument("--campaign", default=bsd_first.CID); e.add_argument("--environment", default="local")
    x = sub.add_parser("export-claim"); x.add_argument("claim"); x.add_argument("out")
    v = sub.add_parser("evaluate"); v.add_argument("--report", default=None)
    a = ap.parse_args()
    conn = db.connect()
    if a.cmd == "migrate":
        print("applied:", db.migrate(conn) or "nothing new")
    elif a.cmd == "seed":
        res = bsd_first.seed(conn)
        print(f"queued {sum(1 for _, new in res if new)} new tasks ({len(res)} total in campaign)")
    elif a.cmd == "worker":
        n = worker.run(a.id, stop_when_idle=a.until_idle)
        print(f"worker {a.id} finished {n} tasks")
    elif a.cmd == "status":
        rows = conn.execute("select state, count(*) n from research_task group by state order by state").fetchall()
        ws = conn.execute("select id, last_heartbeat from worker order by last_heartbeat desc").fetchall()
        print(json.dumps({"tasks": {r["state"]: r["n"] for r in rows}, "workers": [{"id": x["id"], "last_heartbeat": str(x["last_heartbeat"])} for x in ws]}, indent=1))
    elif a.cmd in ("pause", "resume"):
        queue.set_paused(conn, a.scope, a.cmd == "pause")
        print(f"{a.cmd}d {a.scope}")
    elif a.cmd == "cancel":
        queue.request_cancel(conn, a.task)
        print(f"cancellation requested for {a.task}")
    elif a.cmd == "export":
        print("wrote", export.write(conn, Path(a.out), a.campaign, a.environment))
    elif a.cmd == "export-claim":
        print("wrote", claim_export.write(conn, a.claim, Path(a.out)))
    elif a.cmd == "evaluate":
        res = evaluation.run_bsd_suite(conn)
        if a.report:
            evaluation.write_report(res, Path(a.report))
        print(json.dumps({n: v["splits"] for n, v in res["strategies"].items()}, indent=1))


if __name__ == "__main__":
    main()
