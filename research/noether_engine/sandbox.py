"""Run generated or computational code in a constrained child process.

The child gets: a fresh temporary working directory, a minimal environment with
no credentials (ANTHROPIC_API_KEY, DATABASE_URL and NOETHER_* are stripped),
CPU-time, address-space and file-size limits, and no inherited file
descriptors. This is process-level isolation suitable for trusted tooling and
bounded mathematical code; production deployments should add a container or
gVisor boundary with network egress disabled (see docs/RUNBOOK.md).
"""
from __future__ import annotations

import os
import resource
import signal
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

SAFE_ENV_KEYS = {"PATH", "LANG", "LC_ALL", "HOME", "TMPDIR", "PYTHONHASHSEED"}


@dataclass
class RunResult:
    exit_code: int
    stdout: str
    stderr: str
    seconds: float
    timed_out: bool
    canceled: bool


def clean_env(extra: dict[str, str] | None = None) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if k in SAFE_ENV_KEYS}
    env["PYTHONHASHSEED"] = "0"
    env.update(extra or {})
    for k in list(env):
        if k.startswith(("ANTHROPIC", "DATABASE", "NOETHER_ADMIN", "AWS_", "GH_", "GITHUB")):
            env.pop(k)
    return env


def _limits(cpu_seconds: int, memory_mb: int):
    def apply():
        os.setsid()
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 5))
        mem = memory_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (mem, mem))
        resource.setrlimit(resource.RLIMIT_FSIZE, (256 * 1024 * 1024, 256 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))
    return apply


def run(argv: list[str], *, timeout: float, memory_mb: int = 2048, stdin: str | None = None, cwd: Path | None = None,
        env: dict[str, str] | None = None, should_cancel=None, poll: float = 0.5) -> RunResult:
    work = Path(cwd) if cwd else Path(tempfile.mkdtemp(prefix="noether-sbx-"))
    t0 = time.monotonic()
    p = subprocess.Popen(argv, cwd=work, env=clean_env(env), stdin=subprocess.PIPE if stdin is not None else subprocess.DEVNULL,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, close_fds=True,
                         preexec_fn=_limits(int(timeout) + 1, memory_mb))
    if stdin is not None:
        p.stdin.write(stdin)
        p.stdin.close()
    timed_out = canceled = False
    while True:
        try:
            out, err = p.communicate(timeout=poll)
            break
        except subprocess.TimeoutExpired:
            if time.monotonic() - t0 > timeout:
                timed_out = True
            elif should_cancel is not None and should_cancel():
                canceled = True
            if timed_out or canceled:
                os.killpg(p.pid, signal.SIGKILL)
                out, err = p.communicate()
                break
    return RunResult(p.returncode, out, err, time.monotonic() - t0, timed_out, canceled)


def python(code_module: str, payload: str, *, timeout: float, memory_mb: int = 2048, should_cancel=None) -> RunResult:
    """Run `python -I -m <module>` with JSON on stdin (isolated mode: no user site, no cwd imports)."""
    root = Path(__file__).resolve().parents[1]
    return run([sys.executable, "-I", "-c", f"import sys; sys.path.insert(0, {str(root)!r}); import runpy; runpy.run_module({code_module!r}, run_name='__main__')"],
               timeout=timeout, memory_mb=memory_mb, stdin=payload, should_cancel=should_cancel)
