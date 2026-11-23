"use client";
import { useState } from "react";
import { StatusGlyph, STATUS_LABEL } from "@/components/glyphs";
import { ResearchBoard } from "@/components/views/ResearchBoard";
import { SourcesReader } from "@/components/views/SourcesReader";
import { eventGlyph } from "@/components/shell/Workspace";
import { useResearchData } from "@/lib/research";
import { PROBLEMS, PROBLEM_BY_ID, type ClaimStatus } from "@/lib/registry/problems";
import type { EngineStatus } from "@/lib/engine";
import { useUrlState } from "@/lib/hooks";
import { RichText, roleName } from "@/lib/format";

export default function GlobalViews({ section, status, onToast }: { section: string; status: EngineStatus; onToast: (t: string) => void }) {
  const { data, mode } = useResearchData(status);
  const url = useUrlState();
  const [prob, setProb] = useState<string>("all");
  const head: Record<string, [string, string]> = {
    research: ["Research cockpit", "Every bounded task across the six workspaces, the agent roster, workers, queue health and owner controls."],
    sources: ["Source library", "Every recorded source with retrieval status. Metadata-only entries are access gaps, reported as such."],
    proofs: ["Proofs and verification", "Claims and their status ladder, with every formal and computational check. Statuses are separate dimensions, not one progress bar."],
    runs: ["Runs", "The persisted event log. In live mode the stream replays missed events after reconnection; here it replays a recorded run."],
    settings: ["Settings and capabilities", "What runs now, what needs credentials or an always-on host, and what is not implemented."],
  };
  const [h, lede] = head[section] ?? head.research;
  const evs = (data?.events ?? []).filter((e) => prob === "all" || e.problem_id === prob);
  return (
    <div className="view-scroll">
      <div className="view-pad">
        <h1 className="h-view">{h}</h1>
        <p className="lede">{lede}</p>
        {section === "research" && <ResearchBoard data={data} mode={mode} status={status} problem={null} onToast={onToast} />}
        {section === "sources" && <SourcesReader problem={null} />}
        {section === "proofs" && (
          <div style={{ display: "grid", gap: 24 }}>
            <section>
              <h3 className="h-sec" style={{ marginTop: 0 }}>Status dimensions</h3>
              <div className="grid-2">
                <dl className="kv">
                  <dt>Global problem status</dt><dd>What Clay and the research community report, with sources and dates (per problem tab)</dd>
                  <dt>Task status</dt><dd>queued, running, waiting, paused, failed, canceled, completed, blocked</dd>
                </dl>
                <dl className="kv">
                  <dt>Claim status</dt><dd>candidate, refuted, numerically supported, conditionally derived, verified instance, independently reproduced, formally checked (for a specified statement), externally reviewed, accepted</dd>
                  <dt>Novelty status</dt><dd>unchecked, found in literature, potentially new, assessed by an identified expert</dd>
                </dl>
              </div>
            </section>
            <section>
              <h3 className="h-sec" style={{ marginTop: 0 }}>Claims ledger</h3>
              <table className="data">
                <thead><tr><th>Claim</th><th>Problem</th><th>Status</th><th>Novelty</th></tr></thead>
                <tbody>{(data?.claims ?? []).map((c) => <tr key={c.id}><td><span style={{ color: "var(--text)" }}>{c.title}</span><div className="note"><RichText text={c.statement} /></div></td><td>{PROBLEM_BY_ID[c.problem_id as keyof typeof PROBLEM_BY_ID]?.short}</td><td><span className="mark"><StatusGlyph status={c.status as ClaimStatus} />{STATUS_LABEL[c.status as ClaimStatus] ?? c.status}</span></td><td>{c.novelty.replace(/-/g, " ")}</td></tr>)}</tbody>
              </table>
            </section>
            <section>
              <h3 className="h-sec" style={{ marginTop: 0 }}>Verification records</h3>
              <table className="data">
                <thead><tr><th>Statement</th><th>Kind</th><th>Result</th><th>Axioms</th><th>Findings</th><th>Reviewer</th></tr></thead>
                <tbody>{(data?.verification ?? []).map((v) => <tr key={v.id}><td className="mono">{v.statement_id}</td><td>{v.kind}</td><td><span className="mark"><StatusGlyph status={v.result === "passed" ? "formally-checked" : v.result === "flagged" ? "conditionally-derived" : "refuted"} />{v.result}</span></td><td className="mono">{v.axioms?.join(", ") || (v.kind === "lean" ? "none" : "—")}</td><td>{v.findings?.join("; ")}</td><td>{v.reviewer}</td></tr>)}</tbody>
              </table>
              <p className="note">Lean checks build the file with the pinned toolchain (4.36.0), audit the axioms of the target, and elaborate <span className="mono">example : intended := @target</span> to check statement correspondence. A formal check says nothing about novelty or about the informal reading of the statement.</p>
            </section>
            {(data?.reviews ?? []).length > 0 && (
              <section>
                <h3 className="h-sec" style={{ marginTop: 0 }}>Reviews</h3>
                <ul className="list">{data!.reviews!.map((r) => <li key={r.id}><StatusGlyph status={r.verdict === "accept" ? "verified-instance" : "refuted"} /><span><strong style={{ color: "var(--text)", fontWeight: 550 }}>{r.reviewer_role}</strong>{r.fresh_context ? " (fresh context)" : ""}: {r.verdict}. {r.findings?.reasons?.join("; ")}<div className="note">{r.findings?.argument}</div></span></li>)}</ul>
              </section>
            )}
          </div>
        )}
        {section === "runs" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div className="field-row" style={{ flexWrap: "wrap", gap: 12 }}>
              <span className="mark"><span className="engine-dot" data-state={mode === "live" ? "live" : "replay"} />{mode === "live" ? "Live stream (SSE with Last-Event-ID replay)" : `Recorded run, ${data?.events.length ?? 0} events, recorded ${data?.recorded_at?.replace("T", " ").slice(0, 19) ?? ""} UTC`}</span>
              <div className="seg" role="radiogroup" aria-label="Problem">{["all", ...PROBLEMS.map((p) => p.id)].map((p) => <button key={p} role="radio" aria-checked={prob === p} onClick={() => setProb(p)}>{p === "all" ? "All" : PROBLEM_BY_ID[p as keyof typeof PROBLEM_BY_ID].short}</button>)}</div>
            </div>
            {data?.environment && <p className="note" style={{ margin: 0 }}>Environment: {data.environment}</p>}
            <table className="data">
              <thead><tr><th>#</th><th>Time (UTC)</th><th>Problem</th><th>Event</th><th>Actor</th></tr></thead>
              <tbody>{evs.map((e) => <tr key={e.seq}><td className="mono">{e.seq}</td><td className="mono">{e.ts.slice(11, 19)}</td><td>{PROBLEM_BY_ID[e.problem_id]?.short}</td><td><span className="mark" style={{ whiteSpace: "normal" }}><span style={{ width: 12, display: "inline-grid" }}>{eventGlyph(e.type)}</span><span><span className="mono muted">{e.type}</span> {e.summary}</span></span></td><td style={{ fontSize: 13 }}>{roleName(e.actor.role)}{e.actor.worker_id ? <div className="note mono">{e.actor.worker_id}</div> : null}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {section === "settings" && <Settings status={status} onToast={onToast} onGo={(p) => url.set({ s: null, p }, { push: true })} />}
      </div>
    </div>
  );
}

function Settings({ status, onToast, onGo }: { status: EngineStatus; onToast: (t: string) => void; onGo: (p: string) => void }) {
  const stateLabel: Record<string, string> = { available: "Implemented, runs on a research host", "available-in-browser": "Runs in this browser", "needs-credentials": "Needs credentials", "needs-network": "Needs network access", "not-implemented": "Not implemented", blocked: "Blocked" };
  const glyph = (s: string) => (s.startsWith("available") ? "literature-theorem" : s === "not-implemented" ? "candidate" : "blocked") as ClaimStatus;
  return (
    <div style={{ display: "grid", gap: 28 }}>
      <section>
        <h3 className="h-sec" style={{ marginTop: 0 }}>Engine</h3>
        <dl className="kv" style={{ maxWidth: 760 }}>
          <dt>Mode</dt><dd>{status.mode === "live" ? "Live research" : status.mode === "disconnected" ? "Disconnected" : "Demonstration: recorded runs and in-browser instruments; no live research is configured"}</dd>
          <dt>Database</dt><dd>{status.db ? "Connected" : "Not configured (DATABASE_URL)"}</dd>
          <dt>Model provider</dt><dd>{status.provider.configured ? `Configured, model ${status.provider.model}` : "Not configured (ANTHROPIC_API_KEY; model id claude-opus-5-5 by default)"}</dd>
          <dt>Workers</dt><dd>{status.workers.length ? status.workers.map((w) => `${w.id}${w.stale ? " (stale)" : ""}`).join(", ") : "None reporting"}</dd>
          <dt>Last check</dt><dd className="mono">{status.checkedAt ?? "—"}</dd>
          {status.detail && <><dt>Detail</dt><dd>{status.detail}</dd></>}
        </dl>
        <p className="callout" style={{ maxWidth: "80ch", marginTop: 14 }}>
          Continuous (24/7) research needs an always-on host for the worker processes, a PostgreSQL database with persistent storage, a persistent artifact volume, model credentials and enough compute for PARI and Lean. A closed laptop or a stopped container does not provide it. The web app alone, as deployed here, replays recorded runs and runs the browser instruments. The runbook in the repository gives the exact steps.
        </p>
      </section>
      <section>
        <h3 className="h-sec" style={{ marginTop: 0 }}>Capability matrix</h3>
        <table className="data">
          <thead><tr><th>Workspace</th><th>Area</th><th>Capability</th><th>State</th><th>Detail</th></tr></thead>
          <tbody>
            {PROBLEMS.flatMap((p) => p.capabilities.map((c, i) => (
              <tr key={`${p.id}-${i}`}>
                <td>{i === 0 ? <button className="btn btn-ghost" style={{ height: 24, padding: 0 }} onClick={() => onGo(p.id === "bsd" ? "" : p.id)}>{p.short}</button> : ""}</td>
                <td>{c.area}</td><td>{c.name}</td>
                <td><span className="mark"><StatusGlyph status={glyph(c.state)} />{stateLabel[c.state]}</span></td>
                <td>{c.detail}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </section>
      <section>
        <h3 className="h-sec" style={{ marginTop: 0 }}>Display</h3>
        <button className="btn" onClick={() => { const h = document.documentElement; h.dataset.motion = h.dataset.motion === "reduce" ? "" : "reduce"; try { localStorage.setItem("noether:motion", h.dataset.motion); } catch { /* ignore */ } onToast(h.dataset.motion === "reduce" ? "Reduced motion on" : "Reduced motion off"); }}>Toggle reduced motion</button>
        <p className="note">The operating-system setting is always respected; this toggle adds to it.</p>
      </section>
    </div>
  );
}
