# Research worker image: Python engine, PARI/GP (via cypari2 wheels), pinned Lean core toolchain.
# Not built in the environment that produced this repository (no container runtime there);
# see docs/RUNBOOK.md for the tested bare-metal path.
FROM python:3.13-slim

ARG LEAN_VERSION=4.36.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip libgmp10 \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL -o /tmp/lean.zip "https://github.com/leanprover/lean4/releases/download/v${LEAN_VERSION}/lean-${LEAN_VERSION}-linux.zip" \
 && unzip -q /tmp/lean.zip -d /opt/lean && rm /tmp/lean.zip

WORKDIR /app
COPY research/requirements.txt research/requirements.txt
RUN pip install --no-cache-dir -r research/requirements.txt
COPY research research
COPY lean lean
COPY db db

RUN useradd --create-home --uid 10001 noether && mkdir -p /var/lib/noether/artifacts && chown -R noether /var/lib/noether
USER noether
ENV PYTHONPATH=/app/research \
    NOETHER_LEAN_BIN=/opt/lean/lean-${LEAN_VERSION}-linux/bin/lean \
    NOETHER_ARTIFACT_DIR=/var/lib/noether/artifacts \
    PYTHONUNBUFFERED=1

# Migrations are idempotent; each container is one worker with its own id.
CMD ["sh", "-c", "python -m noether_engine migrate && exec python -m noether_engine worker --id \"${WORKER_ID:-$(hostname)}\""]
