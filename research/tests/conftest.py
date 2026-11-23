import os
import sys
from pathlib import Path

import psycopg
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
ADMIN = os.environ.get("NOETHER_TEST_ADMIN_URL", "postgresql://noether@localhost:5433/postgres")
TEST_DB = "noether_test"


@pytest.fixture()
def conn(tmp_path, monkeypatch):
    with psycopg.connect(ADMIN, autocommit=True) as a:
        a.execute(f"drop database if exists {TEST_DB} with (force)")
        a.execute(f"create database {TEST_DB}")
    url = ADMIN.rsplit("/", 1)[0] + f"/{TEST_DB}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("NOETHER_ARTIFACT_DIR", str(tmp_path / "artifacts"))
    from noether_engine import db
    c = db.connect(url)
    db.migrate(c)
    yield c
    c.close()


@pytest.fixture()
def url(conn):
    return os.environ["DATABASE_URL"]
