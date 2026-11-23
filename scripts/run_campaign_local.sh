#!/usr/bin/env bash
# Run the first BSD campaign locally with two workers and one induced worker
# failure (SIGKILL during the twist-family task) to exercise lease recovery.
# Requires: DATABASE_URL, Python deps (research/requirements.txt), PARI via cypari2,
# optionally NOETHER_LEAN_BIN. Exports the recorded bundle for web replay.
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH="$PWD/research"
export NOETHER_LEASE_SECONDS="${NOETHER_LEASE_SECONDS:-12}"
export NOETHER_HEARTBEAT_SECONDS="${NOETHER_HEARTBEAT_SECONDS:-3}"
python3 -m noether_engine migrate
python3 -m noether_engine seed bsd-first
PIDS=()
start_worker() { setsid python3 -m noether_engine worker --id "$1" --until-idle > "var/$1.log" 2>&1 & LAST=$!; PIDS+=("$LAST"); }
start_worker w-alpha; W1=$LAST; start_worker w-beta; W2=$LAST
echo "workers: alpha=$W1 beta=$W2"
# fault injection: kill whichever worker is running T19
for i in $(seq 1 600); do
  OWNER=$(psql "$DATABASE_URL" -tAc "select lease_owner from research_task where id='T19' and state='running'")
  if [ -n "$OWNER" ]; then
    PID=$([ "$OWNER" = "w-alpha" ] && echo $W1 || echo $W2)
    echo "fault injection: SIGKILL $OWNER (pid $PID) while it runs T19"; kill -9 -- -"$PID" 2>/dev/null || kill -9 "$PID"
    sleep 1; echo "restarting $OWNER under the supervisor"; start_worker "$OWNER-restarted"; echo "restarted pid $LAST"
    break
  fi
  sleep 0.2
done
# wait for every worker process (they exit when the queue is drained)
while :; do alive=0; for p in "${PIDS[@]}"; do kill -0 "$p" 2>/dev/null && alive=1; done; [ $alive = 0 ] && break; sleep 1; done
python3 -m noether_engine status
python3 -m noether_engine export web/public/data/runs --environment "${NOETHER_ENV_LABEL:-local build environment}"
