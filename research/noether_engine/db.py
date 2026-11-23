"""Database access and migrations (PostgreSQL via psycopg 3)."""
from __future__ import annotations

import contextlib
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

from .config import ROOT, settings

MIGRATIONS = ROOT / "db" / "migrations"


def connect(url: str | None = None, autocommit: bool = True) -> psycopg.Connection:
    url = url or settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not set: the engine needs PostgreSQL. The web app runs without it in demonstration mode.")
    return psycopg.connect(url, autocommit=autocommit, row_factory=dict_row, options="-c timezone=UTC")


@contextlib.contextmanager
def tx(conn: psycopg.Connection):
    with conn.transaction():
        yield conn


def migrate(conn: psycopg.Connection) -> list[str]:
    conn.execute("create table if not exists schema_migrations (version text primary key, applied_at timestamptz default now())")
    done = {r["version"] for r in conn.execute("select version from schema_migrations").fetchall()}
    applied = []
    for f in sorted(Path(MIGRATIONS).glob("*.sql")):
        if f.name in done:
            continue
        with conn.transaction():
            conn.execute(f.read_text())
            conn.execute("insert into schema_migrations(version) values (%s)", (f.name,))
        applied.append(f.name)
    return applied


def reset(conn: psycopg.Connection) -> None:
    """Drop everything (tests only)."""
    conn.execute("drop schema public cascade; create schema public;")
