"""Write docs/CAPABILITY_MATRIX.md from the exported registry (web/public/data/registry/problems.json).

The registry in web/lib/registry/problems.ts is the single source of truth; the web app's
settings page renders the same rows. Run after `node scripts/export-registry.mjs` in web/.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = {
    "available": "Implemented, runs on a research host",
    "available-in-browser": "Runs in the browser",
    "needs-credentials": "Needs credentials",
    "needs-network": "Needs network access",
    "not-implemented": "Not implemented",
    "blocked": "Blocked",
}


def main() -> None:
    reg = json.loads((ROOT / "web/public/data/registry/problems.json").read_text())
    out = ["# Capability matrix", "",
           "Generated from the problem registry by `research/scripts/gen_capability_doc.py`; the settings page of the app shows the same rows.",
           "A capability is listed as implemented only if code for it exists in this repository and was exercised in the build environment.",
           "Nothing below is simulated: a missing capability is recorded as such, and tasks that need it block with the reason.", ""]
    for p in reg["problems"]:
        out += [f"## {p['name']}", "",
                f"Official status: {p['official']['label']} (verified {p['official'].get('verifiedAt', p.get('lastVerified', ''))}). "
                f"Community: {p['community']['label']}. This app: {p['campaign']['title']} ({p['campaign']['state']}).", "",
                "| Area | Capability | State | Detail |", "|---|---|---|---|"]
        for c in p["capabilities"]:
            detail = c["detail"].replace("|", "\\|")
            out.append(f"| {c['area']} | {c['name']} | {STATE.get(c['state'], c['state'])} | {detail} |")
        out.append("")
    out += ["## Shared infrastructure", "",
            "| Capability | State | Detail |", "|---|---|---|",
            "| Durable queue, leases, retries, dead letters | Implemented, runs on a research host | PostgreSQL; exercised with two workers and an induced SIGKILL in the recorded run. |",
            "| Budget ledger with atomic reservation | Implemented, runs on a research host | Reserve before any model call; unit-tested for concurrent reservations. |",
            "| Append-only event log and SSE replay | Implemented | Database triggers forbid update and delete; the stream honours Last-Event-ID. |",
            "| Claude provider | Needs credentials | ANTHROPIC_API_KEY and ANTHROPIC_MODEL=claude-opus-5-5. Without them, model roles block with a recorded reason. |",
            "| arXiv adapter | Needs network access | Rate limit shared through the database; conditional requests; tested against a recorded fixture only. |",
            "| Container isolation for generated code | Not implemented | Process-level sandbox (rlimits, clean environment, temp directory). See docs/RUNBOOK.md for the container or gVisor boundary to add. |",
            "| Always-on hosting | Needs an always-on host | The deployed web app replays recorded runs; continuous research needs workers and PostgreSQL on a host that stays up. |",
            ""]
    target = ROOT / "docs/CAPABILITY_MATRIX.md"
    target.write_text("\n".join(out))
    print("wrote", target, file=sys.stderr)


if __name__ == "__main__":
    main()
