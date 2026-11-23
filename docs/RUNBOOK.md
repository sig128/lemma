# Runbook

## What runs where

| Piece | Where it runs | Needs |
|---|---|---|
| Web app (instruments, replay, live views) | Vercel or any Node 22 host | Nothing for demonstration mode; `DATABASE_URL` and `NOETHER_ADMIN_TOKEN` for live mode |
| Research workers | An always-on Linux host (VM, bare metal or containers) | Python 3.13, PARI via cypari2, Lean 4.36.0, PostgreSQL access, optional `ANTHROPIC_API_KEY` |
| PostgreSQL 16+ | Managed database or the same host | Persistent storage, daily backups |
| Artifact store | A persistent directory shared by the workers | Survives restarts; back it up with the database |

The deployed web app on its own never runs research: with no database it replays the recorded run.
Continuous (24/7) research needs the workers and the database on a host that stays up. A laptop that sleeps,
a serverless function or a stopped container does not provide it.

## First deployment on a VM (the path exercised in the build environment)

```sh
# as an unprivileged user, from the repository root
python3 -m venv .venv && . .venv/bin/activate
pip install -r research/requirements.txt
curl -fsSLO https://github.com/leanprover/lean4/releases/download/v4.36.0/lean-4.36.0-linux.zip
unzip -q lean-4.36.0-linux.zip -d ~/lean

cp .env.example .env            # fill in DATABASE_URL, NOETHER_ADMIN_TOKEN, optionally ANTHROPIC_API_KEY
set -a; . ./.env; set +a
export PYTHONPATH=$PWD/research NOETHER_LEAN_BIN=$HOME/lean/lean-4.36.0-linux/bin/lean
python -m noether_engine migrate
python -m noether_engine seed bsd-first
```

Run each worker under systemd so it restarts after crashes and reboots:

```ini
# /etc/systemd/system/noether-worker@.service
[Unit]
Description=NOETHER research worker %i
After=network-online.target postgresql.service

[Service]
User=noether
WorkingDirectory=/srv/noether
EnvironmentFile=/srv/noether/.env
Environment=PYTHONPATH=/srv/noether/research
Environment=NOETHER_LEAN_BIN=/srv/noether/lean/lean-4.36.0-linux/bin/lean
ExecStart=/srv/noether/.venv/bin/python -m noether_engine worker --id %H-%i
Restart=always
RestartSec=5
MemoryMax=6G
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/noether /tmp
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl enable --now noether-worker@1 noether-worker@2
```

Point the web app at the same database: set `DATABASE_URL` and `NOETHER_ADMIN_TOKEN` in the hosting
provider's environment settings and redeploy. The top bar switches from "Demonstration" to "Engine live".
On Vercel the database must accept connections from Vercel's network (use a managed provider with TLS, and a
pooled connection string).

`docker-compose.yml` describes the same stack in containers (database, two workers, web). It was written
for this layout but not run in the build environment, which had no container runtime.

## Operating it

| Task | Command or endpoint |
|---|---|
| See queue and workers | `python -m noether_engine status`, or the Research view |
| Pause everything / one problem | `python -m noether_engine pause global` / `pause problem:bsd`, or `POST /api/control {"action":"pause","scope":"global"}` |
| Resume | `python -m noether_engine resume global` |
| Cancel a task | `python -m noether_engine cancel T12`, or `POST /api/control {"action":"cancel","task":"T12"}` |
| Add a bounded task | Research view, "New bounded task", or `POST /api/tasks` (validated: role, preset, limits, criteria) |
| Export a recorded run for the static site | `python -m noether_engine export web/public/data/runs` |
| Export one claim with its evidence | `python -m noether_engine export-claim bsd:rank-eq:389a1 exports` |
| Measure a strategy | `python -m noether_engine evaluate --report exports/evaluation/bsd-rank-labels.json` |

Write endpoints require `Authorization: Bearer $NOETHER_ADMIN_TOKEN` and are disabled when the token is unset.
Read endpoints: `GET /api/status`, `GET /api/snapshot`, `GET /api/events?after=<seq>&problem=<id>`, and
`GET /api/events/stream` (Server-Sent Events, resumes from `Last-Event-ID`).

## Budgets

`NOETHER_DAILY_USD` and `NOETHER_DAILY_TOKENS` cap model spending per day. Every model call reserves its
estimate first; when the ledger cannot cover it, the refusal is recorded (`budget.exhausted`) and the task
goes back to the queue until the next UTC day (`agent.waiting`) without spending one of its attempts. Pricing estimates for `claude-opus-5-5` are in `research/noether_engine/config.py`; check them
against the provider's current price list when you change models.

## Failure handling

- **Worker crash**: the lease expires (`NOETHER_LEASE_SECONDS`, default 60) and another worker resumes the
  task with attempt + 1. The recorded campaign includes one induced SIGKILL and its recovery.
- **Repeated failure**: after `max_attempts` (default 3) a task moves to the dead-letter state. Inspect
  `research_task.result` and the events, fix the cause, and enqueue a new task.
- **Provider errors**: retried with backoff; unknown usage is reconciled as uncertain.
- **Database outage**: a worker that loses its connection exits and the supervisor (systemd or the container
  runtime) restarts it; nothing is lost, because results are written only on completion under a valid lease
  and an interrupted task is reclaimed when its lease expires.
- **Network blocked** (arXiv, archives): the task blocks with `capability.unavailable` and the exact error.

## Security

- Workers hold no credentials they do not need; the sandbox strips the environment before running code.
- Migration `002_roles.sql` creates least-privilege roles: workers cannot change the verification policy
  tables, the audit log or budget limits; the web role can read, set control flags and create tasks.
  Connect workers and the web app with those roles in production.
- Retrieved documents and model output are data. Nothing they contain is executed or followed.
- Before running model-generated code, add an isolation boundary around the sandbox: a container with no
  network (`--network none`), a read-only root filesystem, dropped capabilities and a memory limit, or gVisor.
  The process-level sandbox alone is meant for trusted tooling (PARI, Lean) and bounded computations.

## Backups

Back up PostgreSQL daily (`pg_dump -Fc`) together with the artifact directory. Artifacts are
content-addressed, so a restore can be checked by recomputing their SHA-256 hashes.
