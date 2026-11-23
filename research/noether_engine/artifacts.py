"""Content-addressed, immutable artifacts. Writing the same content twice is a no-op."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from psycopg.types.json import Jsonb

from .config import settings


def canonical(obj: Any) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str).encode()


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def put(conn, kind: str, title: str, data: Any = None, *, raw: bytes | None = None, task_id: str | None = None,
        exactness: str = "text", conditional_flags: list[str] | None = None, reproducer: str | None = None,
        keep_inline: bool = True) -> dict[str, str]:
    payload = raw if raw is not None else canonical(data)
    h = sha256(payload)
    aid = f"art-{h[:16]}"
    d = settings().artifact_dir / h[:2]
    d.mkdir(parents=True, exist_ok=True)
    p = d / h
    if not p.exists():
        tmp = p.with_suffix(".tmp")
        tmp.write_bytes(payload)
        tmp.replace(p)  # atomic: a crash never leaves a partial artifact under its hash
    inline = data if (keep_inline and raw is None and len(payload) < 200_000) else None
    conn.execute(
        """insert into artifact(id, sha256, kind, title, task_id, exactness, conditional_flags, uri, bytes, reproducer, data)
           values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict (sha256) do nothing""",
        (aid, h, kind, title, task_id, exactness, conditional_flags or [], str(p), len(payload), reproducer, Jsonb(inline) if inline is not None else None),
    )
    return {"id": aid, "sha256": h}


def read(conn, artifact_id: str) -> bytes:
    row = conn.execute("select uri from artifact where id = %s", (artifact_id,)).fetchone()
    return Path(row["uri"]).read_bytes()
