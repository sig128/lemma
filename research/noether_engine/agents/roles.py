"""Role registry: prompts, scoped tools, and whether a model call is needed."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

PROMPTS = Path(__file__).parent / "prompts"


@dataclass(frozen=True)
class Role:
    name: str
    needs_model: bool
    tools: tuple[str, ...]
    summary: str

    def prompt(self) -> str:
        return (PROMPTS / "_common.md").read_text() + "\n\n" + (PROMPTS / f"{self.name}.md").read_text()

    def prompt_sha256(self) -> str:
        return hashlib.sha256(self.prompt().encode()).hexdigest()


ROLES = {r.name: r for r in [
    Role("DIRECTOR", True, ("read:frontier", "read:budget", "write:proposals"), "Plans bounded tasks by expected information value per cost."),
    Role("SCOUT", True, ("arxiv.search", "read:registry"), "Finds and records literature with exact metadata."),
    Role("LIBRARIAN", True, ("read:passages", "write:statements"), "Extracts precise statements with anchors."),
    Role("ARITHMETIC", False, ("pari", "sandbox"), "Runs PARI/GP computations in the sandbox."),
    Role("SYNTHESIST", True, ("read:frontier", "read:statements"), "Proposes candidate lemmas and strategies."),
    Role("SKEPTIC", True, ("read:claim", "read:evidence", "rules"), "Challenges claims; rule-based checks run without a model."),
    Role("FORMALIZER", True, ("lean",), "States and proves isolated lemmas in Lean."),
    Role("AUDITOR", False, ("sandbox", "lean", "hash"), "Re-runs computations and checks in a fresh process."),
    Role("CURATOR", False, ("read:all", "write:summaries"), "Maintains summaries, failures and reports."),
]}


def display_name(role: str) -> str:
    """Human-facing role name for summaries and reports: 'SKEPTIC' -> 'Skeptic'. Identifiers stay upper case."""
    return role[:1].upper() + role[1:].lower() if role else role
