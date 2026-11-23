"use client";
import { useMemo, useState } from "react";
import { Tex } from "@/components/Tex";
import { ExactnessTag, StatusGlyph, STATUS_LABEL, toExactness } from "@/components/glyphs";
import { ProofGraph, EdgeLegend } from "@/components/views/ProofGraph";
import { ResearchBoard } from "@/components/views/ResearchBoard";
import { SourcesReader } from "@/components/views/SourcesReader";
import { eventGlyph } from "@/components/shell/Workspace";
import { useResearchData, type Snapshot } from "@/lib/research";
import { PROBLEM_BY_ID, type ProblemId, type ClaimStatus } from "@/lib/registry/problems";
import { SOURCE_BY_ID } from "@/lib/registry/sources";
import type { EngineStatus } from "@/lib/engine";
import { useUrlState } from "@/lib/hooks";
import { RichText, roleName } from "@/lib/format";

export default function ProblemViews({ problem, view, status, onToast }: { problem: ProblemId; view: string; status: EngineStatus; onToast: (t: string) => void }) {
  const { data, mode, loading, error } = useResearchData(status);
  const p = PROBLEM_BY_ID[problem];
  const titles: Record<string, [string, string]> = {
    research: ["Research", "Bounded tasks for this problem, who is working on what, and the controls that act on a connected engine."],
    evidence: ["Evidence", "Experiments and computations with their inputs, exactness, conditional flags, hashes and the command that reproduces them."],
    proof: ["Proof", "The named plan for this problem: known theorems, conditional deductions, checked instances, blocked obligations and rejected claims, with every verification record."],
    sources: ["Sources", "Papers, official descriptions and statements, with retrieval status. Passages link to the proof nodes they support."],
    history: ["History", "Every persisted event for this problem, in order, and what changed in the last recorded run."],
  };
  const [h, lede] = titles[view] ?? titles.research;
  return (
    <div className="view-scroll" id="workspace-panel" role="tabpanel" aria-labelledby={`tab-${problem}`}>
      <div className="view-pad">
        <h1 className="h-view">{h}: {p.name}</h1>
        <p className="lede">{lede}</p>
        {error && view !== "sources" && <p className="callout callout-bad">Research records could not be loaded: {error}</p>}
        {loading && view !== "sources" && <span className="skeleton" style={{ display: "block", width: 320, height: 14 }} />}
        {view === "research" && <ResearchBoard data={data} mode={mode} status={status} problem={problem} onToast={onToast} />}
        {view === "evidence" && <EvidenceView problem={problem} data={data} />}
        {view === "proof" && <ProofView problem={problem} data={data} />}
        {view === "sources" && <SourcesReader problem={problem} />}
        {view === "history" && <HistoryView problem={problem} data={data} mode={mode} />}
      </div>
    </div>
  );
}

const STATIC_DATASETS: Record<string, { title: string; file: string; exactness: "exact" | "numerical" | "mixed"; how: string }[]> = {
  bsd: [
    { title: "Flagship curves 11a1, 37a1, 389a1, 5077a1, 234446a1", file: "/data/bsd/index.json", exactness: "mixed", how: "python3 -I research/scripts/gen_bsd.py web/public/data/bsd 2000" },
    { title: "Quadratic twists of 11a1, |d| ≤ 2000 (1,116 curves)", file: "/data/bsd/twists-11a1.json", exactness: "mixed", how: "same script" },
  ],
  riemann: [{ title: "First 300 zeros and Z(t) on [0, 100]", file: "/data/riemann/zeros.json", exactness: "numerical", how: "python3 -I research/scripts/gen_riemann.py web/public/data/riemann 300" }],
  hodge: [{ title: "27 lines of the Clebsch cubic, intersection matrix", file: "/data/hodge/clebsch.json", exactness: "exact", how: "python3 -I research/scripts/gen_hodge.py web/public/data/hodge" }],
  pnp: [], ns: [], ym: [],
};
const BROWSER: Record<string, string> = {
  pnp: "SAT instances, CDCL traces, DRUP certificates and the benchmark are computed in the browser with seeded generators; each run is reproducible from n, m/n and the seed.",
  ns: "The 2D solver runs in the browser; runs are reproducible from the initial condition, resolution, viscosity and seed.",
  ym: "Monte Carlo runs in the browser from (L, β, seed); the exact reference values are computed in closed form.",
};

function EvidenceView({ problem, data }: { problem: ProblemId; data: Snapshot | null }) {
  const arts = (data?.artifacts ?? []).filter((a) => data?.tasks.find((t) => t.id === a.task_id)?.problem_id === problem)
    .sort((a, b) => (a.task_id ?? "").localeCompare(b.task_id ?? "") || a.title.localeCompare(b.title));
  const vers = (data?.verification ?? []).filter((v) => (v.statement_id ?? "").startsWith(problem));
  return (
    <div style={{ display: "grid", gap: 28 }}>
      <section>
        <h3 className="h-sec" style={{ marginTop: 0 }}>Artifacts from the recorded run</h3>
        {arts.length === 0 && <p className="note">No artifact recorded for this problem.</p>}
        <table className="data">
          <thead><tr><th>Artifact</th><th>Exactness</th><th>Conditional flags</th><th>Task</th><th>SHA-256</th></tr></thead>
          <tbody>
            {arts.map((a) => (
              <tr key={a.id}>
                <td>
                  <span style={{ color: "var(--text)" }}>{a.title}</span>
                  <div className="note mono">{a.kind}</div>
                  {a.reproducer && <code className="repro" title="Command that reproduces this artifact">{a.reproducer}</code>}
                </td>
                <td><ExactnessTag kind={toExactness(a.exactness)} /></td>
                <td className="mono">{(a as { conditional_flags?: string[] }).conditional_flags?.join(", ") || "none"}</td>
                <td className="mono">{a.task_id}</td>
                <td className="mono" title={a.sha256}>{a.sha256.slice(0, 12)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3 className="h-sec" style={{ marginTop: 0 }}>Datasets behind the instrument</h3>
        {STATIC_DATASETS[problem].map((d) => (
          <div key={d.file} className="panel" style={{ marginBottom: 12 }}>
            <div className="field-row"><strong style={{ fontWeight: 550 }}>{d.title}</strong><ExactnessTag kind={d.exactness === "exact" ? "exact" : "numerical"} /></div>
            <p className="note" style={{ margin: "6px 0 0" }}>Reproduce: <span className="mono">{d.how}</span>. File: <a href={d.file} target="_blank" rel="noreferrer">{d.file}</a></p>
          </div>
        ))}
        {BROWSER[problem] && <p className="dim" style={{ fontSize: 14 }}>{BROWSER[problem]}</p>}
      </section>
      {vers.length > 0 && <VerificationTable rows={vers} />}
    </div>
  );
}

function VerificationTable({ rows }: { rows: Snapshot["verification"] }) {
  return (
    <section>
      <h3 className="h-sec" style={{ marginTop: 0 }}>Verification records</h3>
      <table className="data">
        <thead><tr><th>Statement</th><th>Kind</th><th>Result</th><th>Axioms</th><th>Findings</th><th>Toolchain</th></tr></thead>
        <tbody>
          {(rows ?? []).map((v) => (
            <tr key={v.id}>
              <td className="mono">{v.statement_id}<div className="note">hash {v.statement_hash.slice(0, 10)}…</div></td>
              <td>{v.kind}</td>
              <td><span className="mark"><StatusGlyph status={v.result === "passed" ? "formally-checked" : v.result === "flagged" ? "conditionally-derived" : "refuted"} />{v.result}</span></td>
              <td className="mono">{v.axioms?.length ? v.axioms.join(", ") : v.kind === "lean" ? "none" : "—"}</td>
              <td>{v.findings?.join("; ") || "—"}</td>
              <td className="mono" style={{ fontSize: 11.5 }}>{Object.values(v.toolchain ?? {}).filter((x) => typeof x === "string").join(", ").slice(0, 120)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ProofView({ problem, data }: { problem: ProblemId; data: Snapshot | null }) {
  const p = PROBLEM_BY_ID[problem];
  const url = useUrlState();
  const [showRejected, setShowRejected] = useState(true);
  const nodes = useMemo(() => p.frontier.nodes.filter((n) => showRejected || n.kind !== "rejected"), [p, showRejected]);
  const selId = url.get("node") ?? p.campaign.obligation;
  const node = p.frontier.nodes.find((n) => n.id === selId) ?? null;
  const checked = p.frontier.nodes.filter((n) => ["literature-theorem", "verified-instance", "independently-reproduced", "formally-checked", "externally-reviewed"].includes(n.status)).length;
  const history = (data?.claim_history ?? []).filter((h) => h.statement_id.startsWith(problem));
  const claims = (data?.claims ?? []).filter((c) => c.problem_id === problem);
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div className="callout" style={{ maxWidth: "80ch" }}>
        Plan “{p.frontier.plan}”, version {p.frontier.version}: {checked} of {p.frontier.nodes.length} nodes are theorems, checked instances or formally checked. This counts nodes in this particular plan; the plan changes as nodes are added, and the count is not an estimate of distance to solving the problem.
      </div>
      <div className="field-row" style={{ justifyContent: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <EdgeLegend />
        <label className="mark" style={{ cursor: "pointer" }}><input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> Show rejected claims</label>
      </div>
      <ProofGraph nodes={nodes} edges={p.frontier.edges} selected={node?.id ?? null} onSelect={(id) => url.set({ node: id })} />
      {node && (
        <div className="grid-2" style={{ alignItems: "start" }}>
          <div className="panel">
            <div className="mark" style={{ marginBottom: 6 }}><StatusGlyph status={node.status} />{STATUS_LABEL[node.status]}, version {node.version}{node.novelty ? `; novelty: ${node.novelty.replace(/-/g, " ")}` : ""}</div>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 450, fontSize: 24, margin: "0 0 8px" }}>{node.title}</h3>
            {node.tex && <div style={{ fontSize: 18, margin: "6px 0 10px", overflowX: "auto" }}><Tex tex={node.tex} display /></div>}
            <p style={{ color: "var(--text-2)" }}><RichText text={node.statement} /></p>
            <dl className="kv">
              <dt>Scope</dt><dd>{node.scope || "—"}</dd>
              <dt>Assumptions</dt><dd>{node.assumptions.length ? node.assumptions.join("; ") : "none beyond the listed sources"}</dd>
              {node.why && <><dt>Why it matters</dt><dd>{node.why}</dd></>}
              {node.remains && <><dt>What remains</dt><dd>{node.remains}</dd></>}
            </dl>
            {node.instrument && <button className="btn btn-accent" style={{ marginTop: 12 }} onClick={() => url.set({ v: null, curve: node.instrument?.curve ?? null, inst: node.instrument?.view ?? null, k: node.instrument?.object === "L''" ? "2" : null }, { push: true })}>Open in the instrument</button>}
          </div>
          <div className="panel">
            <div className="insp-h">Sources and passages</div>
            <ul className="list">
              {node.sources.map((sid) => {
                const doc = SOURCE_BY_ID.get(sid) ?? [...SOURCE_BY_ID.values()].find((d) => d.passages.some((x) => x.id === sid));
                const pas = doc?.passages.find((x) => x.id === sid);
                return (
                  <li key={sid}><StatusGlyph status={doc?.retrieval.status === "retrieved" ? "externally-reviewed" : "candidate"} />
                    <span>{doc ? <button className="btn btn-ghost" style={{ height: "auto", padding: 0, textAlign: "left", whiteSpace: "normal", color: "var(--text)" }} onClick={() => url.set({ v: "sources", src: doc.id }, { push: true })}>{doc.title}</button> : <span className="mono">{sid}</span>}
                      {pas && <><br /><span className="note">{pas.anchor}: {pas.kind === "quote" ? `“${pas.text}”` : pas.text}</span></>}</span></li>
                );
              })}
              {node.sources.length === 0 && <li className="note" style={{ display: "block" }}>Originates in this app&apos;s own runs.</li>}
            </ul>
            {history.length > 0 && (
              <>
                <div className="insp-h" style={{ marginTop: 16 }}>Label history from the recorded run</div>
                <ul className="list">{history.map((h, i) => <li key={i}><StatusGlyph status={(h.new_status as ClaimStatus) ?? "candidate"} /><span><span className="mono muted">{h.statement_id}</span> {h.old_status ?? "new"} → {h.new_status}: {h.reason}</span></li>)}</ul>
              </>
            )}
          </div>
        </div>
      )}
      {claims.length > 0 && (
        <section>
          <h3 className="h-sec" style={{ marginTop: 0 }}>Claims ledger (recorded run)</h3>
          <table className="data">
            <thead><tr><th>Claim</th><th>Status</th><th>Novelty</th></tr></thead>
            <tbody>{claims.map((c) => <tr key={c.id}><td><span style={{ color: "var(--text)" }}>{c.title}</span><div className="note mono">{c.id}</div></td><td><span className="mark"><StatusGlyph status={(c.status as ClaimStatus) in STATUS_LABEL ? (c.status as ClaimStatus) : "candidate"} />{STATUS_LABEL[c.status as ClaimStatus] ?? c.status}</span></td><td>{c.novelty.replace(/-/g, " ")}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      <VerificationTable rows={(data?.verification ?? []).filter((v) => (v.statement_id ?? "").startsWith(problem))} />
    </div>
  );
}

function HistoryView({ problem, data, mode }: { problem: ProblemId; data: Snapshot | null; mode: "live" | "replay" }) {
  const url = useUrlState();
  const [filter, setFilter] = useState("all");
  const evs = (data?.events ?? []).filter((e) => e.problem_id === problem);
  const types = ["all", ...new Set(evs.map((e) => e.type.split(".")[0]))];
  const shown = evs.filter((e) => filter === "all" || e.type.startsWith(filter));
  const rep = problem === "bsd" ? data?.report : null;
  return (
    <div style={{ display: "grid", gap: 24 }}>
      {rep && (
        <section className="panel">
          <h3 className="h-sec" style={{ marginTop: 4 }}>What changed in the recorded run</h3>
          <div className="grid-2">
            <div>
              <div className="insp-h">New evidence</div><ul className="list">{rep.changed.evidence.map((x, i) => <li key={i}><StatusGlyph status="numerically-supported" /><span><RichText text={x} /></span></li>)}</ul>
              <div className="insp-h" style={{ marginTop: 12 }}>Verified deductions</div><ul className="list">{rep.changed.verified.map((x, i) => <li key={i}><StatusGlyph status="verified-instance" /><span><RichText text={x} /></span></li>)}</ul>
              <div className="insp-h" style={{ marginTop: 12 }}>Rejected ideas</div><ul className="list">{rep.changed.rejected.map((x, i) => <li key={i}><StatusGlyph status="refuted" /><span><RichText text={x} /></span></li>)}</ul>
            </div>
            <div>
              <div className="insp-h">Remaining gap</div><p className="callout callout-warn"><RichText text={rep.changed.remaining_gap} /></p>
              <div className="insp-h" style={{ marginTop: 12 }}>Recommended next task</div><p className="dim"><RichText text={rep.changed.next_task} /></p>
              <div className="insp-h" style={{ marginTop: 12 }}>Campaign steps</div>
              <ol style={{ margin: 0, paddingLeft: 20, color: "var(--text-2)", fontSize: 13.5 }}>{rep.steps.map((s) => <li key={s.n}>{s.title}: <span style={{ color: "var(--text)" }}>{s.status}</span></li>)}</ol>
            </div>
          </div>
        </section>
      )}
      <section>
        <div className="field-row" style={{ flexWrap: "wrap", gap: 12 }}>
          <span className="mark"><span className="engine-dot" data-state={mode === "live" ? "live" : "replay"} />{mode === "live" ? "Live events" : `Recorded run${data?.recorded_at ? ` from ${data.recorded_at.replace("T", " ").slice(0, 19)} UTC` : ""}: replay only`}</span>
          <div className="seg" role="radiogroup" aria-label="Event type">{types.map((t) => <button key={t} role="radio" aria-checked={filter === t} onClick={() => setFilter(t)}>{t}</button>)}</div>
        </div>
        {data?.environment && <p className="note">Environment: {data.environment}</p>}
        <table className="data" style={{ marginTop: 10 }}>
          <thead><tr><th style={{ width: 54 }}>#</th><th style={{ width: 90 }}>Time (UTC)</th><th>Event</th><th style={{ width: 130 }}>Actor</th><th style={{ width: 90 }}></th></tr></thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.seq}>
                <td className="mono">{e.seq}</td>
                <td className="mono">{e.ts.slice(11, 19)}</td>
                <td><span className="mark" style={{ whiteSpace: "normal" }}><span style={{ width: 12, display: "inline-grid" }}>{eventGlyph(e.type)}</span><span><span className="mono muted">{e.type}</span> {e.summary}</span></span></td>
                <td style={{ fontSize: 13 }}>{roleName(e.actor.role)}{e.actor.worker_id ? <div className="note mono">{e.actor.worker_id}</div> : null}</td>
                <td>{e.view && <button className="btn btn-ghost" style={{ height: 26 }} onClick={() => url.set({ v: null, curve: e.view?.curve ?? null, inst: e.view?.view ?? null, k: e.view?.object === "L''" ? "2" : null }, { push: true })}>Restore view</button>}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={5} className="note">No events of this type.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
