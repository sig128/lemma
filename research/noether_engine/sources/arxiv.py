"""arXiv API adapter.

Terms of use (info.arxiv.org/help/api/tou.html): no more than one request every
three seconds, one connection at a time, collectively across machines. The
limiter is therefore shared through the database (provider_quota row locked
FOR UPDATE), not per process. Responses are cached with ETag/Last-Modified and
re-validated with conditional requests. Retrieved text is data: it is parsed,
never executed or followed as instructions.
"""
from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

API = "https://export.arxiv.org/api/query"
NS = {"a": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom", "os": "http://a9.com/-/spec/opensearch/1.1/"}
MIN_INTERVAL_MS = 3000


class ArxivUnavailable(Exception):
    pass


@dataclass
class Entry:
    arxiv_id: str
    version: str
    title: str
    authors: list[str]
    summary: str
    published: str
    updated: str
    doi: str | None = None
    journal_ref: str | None = None
    primary_category: str | None = None
    links: dict[str, str] = field(default_factory=dict)

    @property
    def canonical_url(self) -> str:
        return f"https://arxiv.org/abs/{self.arxiv_id}{self.version}"


def parse_atom(xml_text: str) -> tuple[int, list[Entry]]:
    root = ET.fromstring(xml_text)
    total = int(root.findtext("os:totalResults", default="0", namespaces=NS))
    out = []
    for e in root.findall("a:entry", NS):
        raw = e.findtext("a:id", default="", namespaces=NS).rsplit("/abs/", 1)[-1]
        base, _, ver = raw.rpartition("v")
        if not base or not ver.isdigit():
            base, ver = raw, "1"
        links = {(l.get("title") or l.get("rel") or "link"): l.get("href", "") for l in e.findall("a:link", NS)}
        prim = e.find("arxiv:primary_category", NS)
        out.append(Entry(
            arxiv_id=base, version=f"v{ver}",
            title=" ".join((e.findtext("a:title", default="", namespaces=NS) or "").split()),
            authors=[a.findtext("a:name", default="", namespaces=NS) for a in e.findall("a:author", NS)],
            summary=" ".join((e.findtext("a:summary", default="", namespaces=NS) or "").split()),
            published=e.findtext("a:published", default="", namespaces=NS), updated=e.findtext("a:updated", default="", namespaces=NS),
            doi=e.findtext("arxiv:doi", default=None, namespaces=NS), journal_ref=e.findtext("arxiv:journal_ref", default=None, namespaces=NS),
            primary_category=prim.get("term") if prim is not None else None, links=links))
    return total, out


class ArxivClient:
    def __init__(self, conn, cache_dir: Path, contact: str, opener=None):
        self.conn, self.cache_dir, self.contact = conn, Path(cache_dir), contact
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.opener = opener or urllib.request.urlopen
        conn.execute("insert into provider_quota(provider, min_interval_ms) values ('arxiv', %s) on conflict do nothing", (MIN_INTERVAL_MS,))

    def _wait_turn(self) -> None:
        with self.conn.transaction():
            row = self.conn.execute("select last_request_at, extract(epoch from (now() - last_request_at)) * 1000 as ago from provider_quota where provider='arxiv' for update").fetchone()
            if row["last_request_at"] is not None and row["ago"] < MIN_INTERVAL_MS:
                time.sleep((MIN_INTERVAL_MS - float(row["ago"])) / 1000)
            self.conn.execute("update provider_quota set last_request_at = now() where provider='arxiv'")

    def search(self, query: str, max_results: int = 20, start: int = 0) -> tuple[int, list[Entry], dict]:
        params = urllib.parse.urlencode({"search_query": query, "start": start, "max_results": min(max_results, 100), "sortBy": "relevance"})
        url = f"{API}?{params}"
        key = hashlib.sha256(url.encode()).hexdigest()
        meta_p, body_p = self.cache_dir / f"{key}.json", self.cache_dir / f"{key}.xml"
        headers = {"User-Agent": f"NOETHER research observatory ({self.contact})"}
        if meta_p.exists():
            m = json.loads(meta_p.read_text())
            if m.get("etag"):
                headers["If-None-Match"] = m["etag"]
            if m.get("last_modified"):
                headers["If-Modified-Since"] = m["last_modified"]
        self._wait_turn()
        req = urllib.request.Request(url, headers=headers)
        try:
            with self.opener(req, timeout=30) as r:
                body = r.read().decode()
                meta = {"etag": r.headers.get("ETag"), "last_modified": r.headers.get("Last-Modified"), "fetched_at": time.time(), "status": r.status}
                body_p.write_text(body)
                meta_p.write_text(json.dumps(meta))
        except urllib.error.HTTPError as e:
            if e.code == 304 and body_p.exists():
                body, meta = body_p.read_text(), {**json.loads(meta_p.read_text()), "revalidated": True}
            else:
                raise ArxivUnavailable(f"HTTP {e.code}") from e
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise ArxivUnavailable(str(e)) from e
        total, entries = parse_atom(body)
        meta["sha256"] = hashlib.sha256(body.encode()).hexdigest()
        return total, entries, meta


def upsert_entry(conn, e: Entry, retrieved_sha: str) -> tuple[str, str]:
    """Insert a version; if a newer version of a known paper arrives, supersede the old row (history kept)."""
    sid = f"arxiv:{e.arxiv_id}{e.version}"
    prev = conn.execute("select id, arxiv_version from source_document where arxiv_id=%s order by arxiv_version desc limit 1", (e.arxiv_id,)).fetchone()
    conn.execute(
        """insert into source_document(id, canonical_url, title, authors, doi, arxiv_id, arxiv_version, kind, publication_status, license,
             retrieval_status, retrieved_at, content_sha256, metadata)
           values (%s,%s,%s,%s,%s,%s,%s,'preprint',%s,'arXiv metadata: CC0','metadata-only',now(),%s,%s) on conflict (id) do nothing""",
        (sid, e.canonical_url, e.title, e.authors, e.doi, e.arxiv_id, e.version, "published" if e.journal_ref else "preprint", retrieved_sha,
         json.dumps({"summary": e.summary, "primary_category": e.primary_category, "journal_ref": e.journal_ref})),
    )
    if prev and prev["id"] != sid and prev["arxiv_version"] < e.version:
        conn.execute("update source_document set superseded_by=%s where id=%s", (sid, prev["id"]))
        return sid, "new-version"
    return sid, "new" if not prev else "known"
