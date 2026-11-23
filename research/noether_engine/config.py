"""Runtime configuration, read from the environment. No secrets are logged."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=lambda: os.environ.get("DATABASE_URL", ""))
    anthropic_api_key_present: bool = field(default_factory=lambda: bool(os.environ.get("ANTHROPIC_API_KEY")))
    anthropic_model: str = field(default_factory=lambda: os.environ.get("ANTHROPIC_MODEL", "claude-opus-5-5"))
    concurrency: int = field(default_factory=lambda: int(os.environ.get("NOETHER_CONCURRENCY", "2")))
    lease_seconds: int = field(default_factory=lambda: int(os.environ.get("NOETHER_LEASE_SECONDS", "60")))
    heartbeat_seconds: int = field(default_factory=lambda: int(os.environ.get("NOETHER_HEARTBEAT_SECONDS", "10")))
    daily_usd: float = field(default_factory=lambda: float(os.environ.get("NOETHER_DAILY_USD", "25")))
    daily_tokens: int = field(default_factory=lambda: int(os.environ.get("NOETHER_DAILY_TOKENS", "4000000")))
    artifact_dir: Path = field(default_factory=lambda: Path(os.environ.get("NOETHER_ARTIFACT_DIR", str(ROOT / "var" / "artifacts"))))
    lean_bin: str = field(default_factory=lambda: os.environ.get("NOETHER_LEAN_BIN", "lean"))
    arxiv_contact: str = field(default_factory=lambda: os.environ.get("NOETHER_ARXIV_CONTACT", "noether-observatory (contact via repository)"))
    sandbox_memory_mb: int = field(default_factory=lambda: int(os.environ.get("NOETHER_SANDBOX_MEMORY_MB", "2048")))


def settings() -> Settings:
    return Settings()


# Model pricing used for budget *estimates* before dispatch (USD per million tokens).
# Source: platform.claude.com model overview for claude-opus-5-5 (input $4, output $20).
PRICING = {"claude-opus-5-5": (4.0, 20.0)}
