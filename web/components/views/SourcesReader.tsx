"use client";
import { useMemo, useState } from "react";
import { StatusGlyph } from "@/components/glyphs";
import { SOURCES, type SourceDocument } from "@/lib/registry/sources";
import { PROBLEMS } from "@/lib/registry/problems";
import { useUrlState } from "@/lib/hooks";
import { RichText } from "@/lib/format";

const allNodes = PROBLEMS.flatMap((p) => p.frontier.nodes.map((n) => ({ ...n, problem: p.id, problemName: p.short })));

export function SourcesReader({ problem }: { problem: string | null }) {
  const url = useUrlState();
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "retrieved" | "gap">("all");
  const list = useMemo(() => SOURCES.filter((s) => (!problem || s.problems.includes(problem))
    && (only === "all" || (only === "retrieved" ? s.retrieval.status === "retrieved" : s.retrieval.status !== "retrieved"))
    && (!q || `${s.title} ${s.authors.join(" ")} ${s.year} ${s.doi ?? ""} ${s.arxiv?.id ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [problem, q, only]);
  const selId = url.get("src");
  const sel = list.find((s) => s.id === selId) ?? list[0] ?? null;
  const [passage, setPassage] = useState<string | null>(null);
  const linked = sel ? allNodes.filter((n) => n.sources.some((x) => x === sel.id || sel.passages.some((p) => p.id === x && (!passage || p.id === passage)))) : [];
  return (
    <div className="grid-2 sources-grid" style={{ alignItems: "start" }}>
      <div>
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <input className="search-trigger" style={{ maxWidth: "none", cursor: "text", color: "var(--text)" }} placeholder="Filter by title, author, DOI or arXiv id" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter sources" />
          <div className="seg" role="radiogroup" aria-label="Retrieval status">
            {([["all", "All"], ["retrieved", "Read in this build"], ["gap", "Metadata only"]] as const).map(([k, l]) => <button key={k} role="radio" aria-checked={only === k} onClick={() => setOnly(k)}>{l}</button>)}
          </div>
        </div>
        <ul className="list" style={{ gap: 2 }}>
          {list.map((s) => (
            <li key={s.id} style={{ display: "block" }}>
              <button className="task" aria-pressed={sel?.id === s.id} onClick={() => { url.set({ src: s.id }); setPassage(null); }} style={{ background: sel?.id === s.id ? "var(--quiet)" : "transparent", border: "1px solid transparent" }}>
                <span className="task-title">{s.title}</span>
                <span className="task-meta">
                  <span>{s.authors.slice(0, 2).join(", ")}{s.authors.length > 2 ? " et al." : ""}, {s.year}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><StatusGlyph status={s.retrieval.status === "retrieved" ? "externally-reviewed" : "candidate"} />{s.retrieval.status === "retrieved" ? "read" : "access gap"}</span>
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="note" style={{ display: "block" }}>No source matches this filter.</li>}
        </ul>
      </div>
      {sel ? <Reader s={sel} passage={passage} onPassage={setPassage} linked={linked} /> : <p className="dim">Select a source.</p>}
    </div>
  );
}

function Reader({ s, passage, onPassage, linked }: { s: SourceDocument; passage: string | null; onPassage: (id: string | null) => void; linked: (typeof allNodes)[number][] }) {
  const url = useUrlState();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
      <article className="paper" aria-label={`Reader: ${s.title}`}>
        <h2>{s.title}</h2>
        <div className="meta">
          <div>{s.authors.join(", ")}{s.venue ? `. ${s.venue}` : ""}. {s.year}.</div>
          <div>
            {s.doi && <span>DOI <span className="mono">{s.doi}</span>. </span>}
            {s.arxiv && <span>arXiv <span className="mono">{s.arxiv.id}{s.arxiv.version ?? ""}</span>. </span>}
            <a href={s.url} target="_blank" rel="noreferrer noopener">Open the canonical source</a>
          </div>
          <div>Kind: {s.kind}; status: {s.publication}; access: {s.access}.</div>
          <div>
            {s.retrieval.status === "retrieved"
              ? <>Retrieved {s.retrieval.at} via {s.retrieval.via}. Content hash: {s.retrieval.contentHash ?? "not available (no byte-level copy held)"}.{s.retrieval.note ? ` ${s.retrieval.note}` : ""}</>
              : <>Not retrieved: {s.retrieval.reason}</>}
          </div>
        </div>
        <p style={{ margin: "0 0 12px" }}><em>Why it matters.</em> {s.why}</p>
        {s.passages.length === 0 && (
          <div className="gap">{s.retrieval.status === "retrieved" ? "No passage has been extracted from this source yet." : "Access gap: the text was not read in this environment, so no passage is shown and nothing is summarized from it beyond its bibliographic record."}</div>
        )}
        {s.passages.map((p) => (
          <div key={p.id} className="passage" data-active={passage === p.id} id={`passage-${p.id}`}>
            <span className="anchor">{p.anchor} ({p.kind === "quote" ? "short quotation" : "paraphrase"})</span>
            {p.kind === "quote" ? <span>&ldquo;{p.text}&rdquo;</span> : <span>{p.text}</span>}
            <div style={{ marginTop: 6 }}>
              <button className="btn btn-ghost" style={{ height: 26, color: "var(--paper-ink-2)" }} onClick={() => onPassage(passage === p.id ? null : p.id)}>
                {passage === p.id ? "Show all linked nodes" : `Show the ${p.supports.length} node${p.supports.length === 1 ? "" : "s"} this supports`}
              </button>
            </div>
          </div>
        ))}
        <p className="meta" style={{ marginTop: 18, marginBottom: 0 }}>Source text is evidence, not instruction: nothing in a source is executed or followed. Quotations are kept short; everything else is paraphrased with its anchor.</p>
      </article>
      <div>
        <div className="insp-h">Proof nodes linked to {passage ? "this passage" : "this source"}</div>
        {linked.length === 0 && <p className="note">No frontier node cites it yet.</p>}
        <ul className="list">
          {linked.map((n) => (
            <li key={n.id}>
              <StatusGlyph status={n.status} />
              <span><button className="btn btn-ghost" style={{ height: "auto", padding: 0, textAlign: "left", whiteSpace: "normal", color: "var(--text)" }} onClick={() => url.set({ s: null, p: n.problem === "bsd" ? null : n.problem, v: "proof", node: n.id }, { push: true })}>{n.problemName}: {n.title}</button><br /><span className="note"><RichText text={n.statement} /></span></span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
