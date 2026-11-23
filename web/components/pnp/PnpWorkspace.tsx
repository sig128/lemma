"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceFrame, TimelineDock, useStageInset } from "@/components/shell/Workspace";
import { Chart } from "@/components/charts/Chart";
import { Tex } from "@/components/Tex";
import { Icon, StatusGlyph, ExactnessTag } from "@/components/glyphs";
import { ProblemStatusBlock } from "@/components/views/StatusBlock";
import { useSize, useUrlState, usePersisted } from "@/lib/hooks";
import { useEventsFor, type EngineStatus } from "@/lib/engine";
import type { CNF, TraceEv } from "@/lib/sat";

type Solved = {
  cnf: CNF; result: "SAT" | "UNSAT" | "UNKNOWN"; assignment: number[] | null;
  stats: { decisions: number; propagations: number; conflicts: number; learned: number; restarts: number; work: number };
  trace: TraceEv[]; traceTruncated: boolean; lemmas: number; solveMs: number;
  check: { kind: "witness" | "drup"; ok: boolean; work: number; ms: number; lemmas?: number; firstFalse?: number | null; satisfiedBy?: number[] } | null;
};
type BenchRow = { n: number; m: number; seed: number; result: string; searchWork: number; conflicts: number; verifyWork: number | null; refuteWork: number | null; certified: boolean; ms: number };

const lit = (l: number) => (l > 0 ? `x${l}` : `¬x${-l}`);
const describe = (e: TraceEv) => {
  switch (e.k) {
    case "decide": return `Decide ${lit(e.lit)} at level ${e.level}`;
    case "prop": return `Propagate ${lit(e.lit)} from clause ${e.clause + 1}`;
    case "conflict": return `Conflict in clause ${e.clause + 1} at level ${e.level}`;
    case "learn": return `Learn (${e.lemma.map(lit).join(" ∨ ") || "empty clause"}), backjump to level ${e.backjump}`;
    case "restart": return "Restart (keep learned clauses)";
    case "done": return e.result === "SAT" ? "Satisfying assignment found" : "Empty clause derived: unsatisfiable";
  }
};

function replay(n: number, trace: TraceEv[], upto: number) {
  const val = new Int8Array(n + 1), lev = new Int32Array(n + 1);
  for (let i = 0; i <= upto && i < trace.length; i++) {
    const e = trace[i];
    if (e.k === "decide" || e.k === "prop") { const v = Math.abs(e.lit); val[v] = e.lit > 0 ? 1 : -1; lev[v] = e.level; }
    else if (e.k === "learn") {
      for (let v = 1; v <= n; v++) if (lev[v] > e.backjump) { val[v] = 0; lev[v] = 0; }
      const a = e.lemma[0];
      if (a) { val[Math.abs(a)] = a > 0 ? 1 : -1; lev[Math.abs(a)] = e.backjump; }
    } else if (e.k === "restart") for (let v = 1; v <= n; v++) if (lev[v] > 0) { val[v] = 0; lev[v] = 0; }
  }
  return val;
}

export default function PnpWorkspace({ status }: { status: EngineStatus }) {
  const url = useUrlState();
  const inst = url.get("inst") ?? "instance";
  const [cfg, setCfg] = usePersisted("pnp:cfg", { n: 20, alpha: 4.26, seed: 3 });
  const [solved, setSolved] = useState<Solved | null>(null);
  const [busy, setBusy] = useState(false);
  const [stepI, setStepI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [verifyI, setVerifyI] = useState<number | null>(null);
  const [bench, setBench] = useState<{ rows: BenchRow[] | null; progress: number; total: number; at: string | null }>({ rows: null, progress: 0, total: 0, at: null });
  const worker = useRef<Worker | null>(null);
  const ev = useEventsFor("pnp", status);
  const [selEvent, setSelEvent] = useState<number | null>(null);

  useEffect(() => {
    const w = new Worker(new URL("../../workers/sat.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === "solved") { setSolved(d as Solved); setStepI(Math.max(0, d.trace.length - 1)); setBusy(false); setVerifyI(null); }
      if (d.type === "bench-progress") setBench((b) => ({ ...b, progress: d.done, total: d.total }));
      if (d.type === "bench-done") setBench({ rows: d.rows, progress: d.rows.length, total: d.rows.length, at: new Date().toISOString() });
    };
    return () => w.terminate();
  }, []);
  const solve = () => { setBusy(true); setPlaying(false); worker.current?.postMessage({ type: "solve", n: cfg.n, m: Math.round(cfg.alpha * cfg.n), seed: cfg.seed }); };
  useEffect(() => { if (worker.current) solve(); }, [worker.current]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing || !solved) return;
    const id = window.setInterval(() => setStepI((i) => { if (i + 1 >= solved.trace.length) { setPlaying(false); return i; } return i + 1; }), 90);
    return () => window.clearInterval(id);
  }, [playing, solved]);
  useEffect(() => {
    if (verifyI === null || !solved) return;
    if (verifyI >= solved.cnf.clauses.length) return;
    const id = window.setTimeout(() => setVerifyI((v) => (v === null ? null : v + 1)), 30);
    return () => window.clearTimeout(id);
  }, [verifyI, solved]);

  const val = useMemo(() => (solved ? (verifyI !== null && solved.assignment ? Int8Array.from(solved.assignment) : replay(solved.cnf.n, solved.trace, stepI)) : null), [solved, stepI, verifyI]);
  const cur = solved?.trace[stepI] ?? null;

  const stage = (
    <>
      <div className="stage-head">
        <div>
          <h1 className="stage-title">Finding versus checking</h1>
          <div className="stage-eq"><Tex tex={String.raw`\mathsf P\overset{?}{=}\mathsf{NP}\quad\Longleftrightarrow\quad \mathrm{SAT}\overset{?}{\in}\mathsf P`} /></div>
          <div className="stage-facts">
            <span>random 3-SAT, n = {cfg.n}, m = {Math.round(cfg.alpha * cfg.n)}</span>
            <span>seed {cfg.seed}</span>
            <span>{solved ? `${solved.result}${solved.check ? (solved.check.ok ? ", certificate checked" : ", certificate failed") : ""}` : busy ? "solving" : "not solved"}</span>
          </div>
        </div>
        <div className="stage-head-tools">
          <div className="seg" role="radiogroup" aria-label="Instrument">
            <button role="radio" aria-checked={inst === "instance"} onClick={() => url.set({ inst: null })}>Instance and trace</button>
            <button role="radio" aria-checked={inst === "bench"} onClick={() => url.set({ inst: "bench" })}>Search versus verification</button>
          </div>
        </div>
      </div>
      {inst === "instance" && (
        <>
          {solved && val && <ClauseGraph cnf={solved.cnf} val={val} focusClause={verifyI !== null ? verifyI : cur && (cur.k === "prop" || cur.k === "conflict") ? cur.clause : null} conflict={cur?.k === "conflict" && verifyI === null} verifyUpTo={verifyI} />}
          <div className="side-col">
          <div className="ctrl-panel">
            <h3>Instance</h3>
            <label className="field"><span className="field-row"><span>Variables n</span><span className="mono">{cfg.n}</span></span>
              <input type="range" min={6} max={40} value={cfg.n} onChange={(e) => setCfg({ ...cfg, n: +e.target.value })} /></label>
            <label className="field"><span className="field-row"><span>Clause ratio m/n</span><span className="mono">{cfg.alpha.toFixed(2)}</span></span>
              <input type="range" min={3} max={5.5} step={0.02} value={cfg.alpha} onChange={(e) => setCfg({ ...cfg, alpha: +e.target.value })} /></label>
            <label className="field"><span className="field-row"><span>Seed</span></span>
              <input type="number" min={1} max={99999} value={cfg.seed} onChange={(e) => setCfg({ ...cfg, seed: Math.max(1, +e.target.value || 1) })} /></label>
            <button className="btn btn-accent" onClick={solve} disabled={busy}>{busy ? "Solving…" : "Solve with CDCL"}</button>
            {solved?.result === "SAT" && <button className="btn" onClick={() => setVerifyI(0)}>Replay witness check</button>}
          </div>
          {solved && (
            <div className="ctrl-panel">
              <h3>Solver trace</h3>
              <div className="field-row">
                <span style={{ display: "inline-flex", gap: 4 }}>
                  <button className="btn btn-ghost btn-icon" aria-label="Previous solver event" onClick={() => { setVerifyI(null); setStepI((i) => Math.max(0, i - 1)); }}><Icon name="back" /></button>
                  <button className="btn btn-ghost btn-icon" aria-label={playing ? "Pause trace" : "Play trace from the start"} onClick={() => { setVerifyI(null); if (!playing && stepI >= solved.trace.length - 1) setStepI(0); setPlaying((p) => !p); }}><Icon name={playing ? "pause" : "play"} /></button>
                  <button className="btn btn-ghost btn-icon" aria-label="Next solver event" onClick={() => { setVerifyI(null); setStepI((i) => Math.min(solved.trace.length - 1, i + 1)); }}><Icon name="step" /></button>
                </span>
                <span className="mono muted">event {stepI + 1} / {solved.trace.length}{solved.traceTruncated ? " (truncated)" : ""}</span>
              </div>
              <input type="range" min={0} max={Math.max(0, solved.trace.length - 1)} value={stepI} aria-label="Solver trace position" onChange={(e) => { setVerifyI(null); setStepI(+e.target.value); }} />
              <div style={{ fontSize: 13.5 }}>{verifyI !== null ? `Checking clause ${Math.min(verifyI + 1, solved.cnf.clauses.length)} of ${solved.cnf.clauses.length} under the witness` : cur ? describe(cur) : ""}</div>
            </div>
          )}
          </div>
        </>
      )}
      {inst === "bench" && <BenchView bench={bench} onRun={() => { setBench({ rows: null, progress: 0, total: 70, at: null }); worker.current?.postMessage({ type: "bench", ns: [10, 20, 30, 40, 50, 60, 70], seeds: 10, alpha: 4.26 }); }} />}
    </>
  );

  return (
    <WorkspaceFrame problem="pnp" stage={stage}
      inspector={<PnpInspector solved={solved} cfg={cfg} inst={inst} bench={bench.rows} />}
      dock={<TimelineDock events={ev.events} mode={ev.mode} loading={ev.loading} error={ev.error} selected={selEvent} onSelect={(e) => setSelEvent(e?.seq ?? null)} lastUpdate={ev.lastUpdate} />} />
  );
}

function ClauseGraph({ cnf, val, focusClause, conflict, verifyUpTo }: { cnf: CNF; val: Int8Array; focusClause: number | null; conflict: boolean; verifyUpTo: number | null }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const inset = useStageInset();
  const narrow = size.w > 0 && size.w < 640;
  const top = inset + (narrow ? 84 : 40);
  const W = narrow ? size.w - 16 : Math.max(280, size.w - 340), H = narrow ? Math.min(size.w - 24, 380) : Math.max(220, size.h - top - 14);
  useEffect(() => { (ref.current?.closest(".stage") as HTMLElement | null)?.style.setProperty("--graph-h", `${H + (narrow ? 44 : 0)}px`); }, [H, narrow, ref]);
  const R = Math.max(80, Math.min(W - 40, H) / 2 - 20), cx = 44 + R + 16, cy = top + H / 2;
  const vpos = (v: number) => { const a = ((v - 1) / cnf.n) * 2 * Math.PI - Math.PI / 2; return [cx + R * Math.cos(a), cy + R * Math.sin(a)] as const; };
  const cpos = cnf.clauses.map((c) => {
    let sx = 0, sy = 0;
    for (const l of c) { const a = ((Math.abs(l) - 1) / cnf.n) * 2 * Math.PI - Math.PI / 2; sx += Math.cos(a); sy += Math.sin(a); }
    const a = Math.atan2(sy, sx), mag = Math.hypot(sx, sy) / 3;
    const rr = R * (0.18 + 0.5 * mag);
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)] as const;
  });
  const lv = (l: number) => (l > 0 ? val[l] : -val[-l]);
  return (
    <div ref={ref} className="instrument" aria-label={`Clause-variable graph with ${cnf.n} variables on the outer ring and ${cnf.clauses.length} clauses inside`}>
      <svg className="scene" width={size.w} height={size.h}>
        {cnf.clauses.map((c, i) => c.map((l, j) => {
          const [x1, y1] = cpos[i], [x2, y2] = vpos(Math.abs(l));
          const hot = i === focusClause;
          return <line key={`${i}-${j}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={l > 0 ? "var(--accent)" : "var(--accent-2)"} strokeOpacity={hot ? 0.95 : 0.13} strokeWidth={hot ? 1.6 : 0.8} strokeDasharray={l > 0 ? undefined : "3 3"} />;
        }))}
        {cnf.clauses.map((c, i) => {
          const [x, y] = cpos[i];
          const sat = c.some((l) => lv(l) === 1), dead = c.every((l) => lv(l) === -1);
          const checked = verifyUpTo !== null && i < verifyUpTo;
          const hot = i === focusClause;
          return (
            <g key={`c${i}`}>
              {dead ? <path d={`M${x - 3.5},${y - 3.5}L${x + 3.5},${y + 3.5}M${x + 3.5},${y - 3.5}L${x - 3.5},${y + 3.5}`} stroke="var(--rejected)" strokeWidth={1.8} />
                : <rect x={x - 3} y={y - 3} width={6} height={6} fill={sat || checked ? "var(--text-2)" : "none"} stroke={hot ? "var(--text)" : "var(--muted)"} strokeWidth={1.1} />}
              {hot && <circle cx={x} cy={y} r={9} fill="none" stroke={conflict ? "var(--rejected)" : "var(--text)"} strokeWidth={1.2} />}
            </g>
          );
        })}
        {Array.from({ length: cnf.n }, (_, k) => k + 1).map((v) => {
          const [x, y] = vpos(v);
          const s = val[v];
          const a = ((v - 1) / cnf.n) * 2 * Math.PI - Math.PI / 2;
          return (
            <g key={`v${v}`}>
              {s === 1 ? <circle cx={x} cy={y} r={6} fill="var(--accent)" /> : s === -1 ? <circle cx={x} cy={y} r={6} fill="var(--bg)" stroke="var(--accent-2)" strokeWidth={1.8} /> : <circle cx={x} cy={y} r={2.5} fill="var(--muted)" />}
              {cnf.n <= 30 && <text x={x + 16 * Math.cos(a)} y={y + 16 * Math.sin(a) + 4} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill="var(--muted)">{v}</text>}
            </g>
          );
        })}
      </svg>
      <div className="legend-box" style={{ left: narrow ? 12 : 24, top: inset - 6, maxWidth: narrow ? size.w - 24 : undefined }}>
        <div className="chart-legend" style={{ margin: 0, gap: 14 }}>
          <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="var(--accent)" /></svg> true</span>
          <span><svg width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--accent-2)" strokeWidth="1.8" /></svg> false</span>
          <span><svg width="12" height="12"><circle cx="6" cy="6" r="2.5" fill="var(--muted)" /></svg> unassigned</span>
          <span><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--accent)" /></svg> positive literal</span>
          <span><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--accent-2)" strokeDasharray="3 3" /></svg> negated</span>
        </div>
      </div>
    </div>
  );
}

function median(xs: number[]) { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; }

function BenchView({ bench, onRun }: { bench: { rows: BenchRow[] | null; progress: number; total: number; at: string | null }; onRun: () => void }) {
  const rows = bench.rows ?? [];
  const ns = [...new Set(rows.map((r) => r.n))];
  const series = [
    { id: "search", label: "CDCL search work (median)", color: "var(--series-1)", kind: "line" as const, points: ns.map((n) => ({ x: n, y: median(rows.filter((r) => r.n === n).map((r) => r.searchWork)) })) },
    { id: "verify", label: "Witness check work, satisfiable instances (median)", color: "var(--series-2)", kind: "line" as const, points: ns.map((n) => ({ x: n, y: median(rows.filter((r) => r.n === n && r.verifyWork !== null).map((r) => r.verifyWork!)) })).filter((p) => Number.isFinite(p.y)) },
    { id: "refute", label: "Refutation check work, unsatisfiable instances (median)", color: "var(--series-3)", kind: "line" as const, points: ns.map((n) => ({ x: n, y: median(rows.filter((r) => r.n === n && r.refuteWork !== null).map((r) => r.refuteWork!)) })).filter((p) => Number.isFinite(p.y)) },
  ];
  return (
    <div className="view-scroll stage-scroll">
      <div className="view-pad" style={{ paddingTop: 4, maxWidth: 1060 }}>
        <p className="callout callout-warn" style={{ maxWidth: "76ch" }}>A finite benchmark for one solver on one distribution. It measures this solver&apos;s work on these instances; it is not an asymptotic statement and proves no lower bound for any algorithm.</p>
        <div className="field-row" style={{ margin: "16px 0", justifyContent: "flex-start", gap: 16 }}>
          <button className="btn btn-accent" onClick={onRun} disabled={!!bench.total && !bench.rows}>{bench.rows ? "Run the benchmark again" : bench.total ? `Running ${bench.progress} / ${bench.total}` : "Run the benchmark in this browser"}</button>
          <span className="note">Random 3-SAT at m/n = 4.26, n = 10 to 70, 10 seeds each (7001–7010). Work = clause visits and literal evaluations counted by instrumented code.</span>
        </div>
        {bench.rows && (
          <>
            <div className="panel"><Chart height={320} series={series} x={{ label: "variables n" }} y={{ label: "work (counted operations)", scale: "log" }} tooltipX={(v) => String(Math.round(v))} tooltipY={(v) => Math.round(v).toLocaleString("en-US")} /></div>
            <p className="note">Measured {bench.at?.replace("T", " ").slice(0, 19)} UTC in this browser ({typeof navigator !== "undefined" ? `${navigator.hardwareConcurrency ?? "?"} logical cores reported` : ""}). {rows.filter((r) => r.result === "SAT").length} satisfiable, {rows.filter((r) => r.result === "UNSAT").length} unsatisfiable, {rows.filter((r) => !r.certified).length} without a checked certificate.</p>
            <p className="dim" style={{ maxWidth: "76ch", fontSize: 14 }}>Checking a satisfying assignment touches each clause once. Checking a refutation replays a proof whose length is not polynomially bounded in general; that asymmetry is the NP versus coNP question, which this chart does not settle either.</p>
          </>
        )}
      </div>
    </div>
  );
}

function PnpInspector({ solved, cfg, inst, bench }: { solved: Solved | null; cfg: { n: number; alpha: number; seed: number }; inst: string; bench: BenchRow[] | null }) {
  return (
    <div className="insp">
      <section className="insp-section">
        <h2 className="insp-h">Selected</h2>
        {inst === "bench" ? (
          <>
            <p className="insp-title">Benchmark dataset</p>
            <p>{bench ? `${bench.length} instances measured in this browser.` : "Not run yet. The benchmark runs only when you start it, in a Web Worker."}</p>
          </>
        ) : solved ? (
          <>
            <p className="insp-title">Instance n = {solved.cnf.n}, m = {solved.cnf.clauses.length}</p>
            <dl className="kv">
              <dt>Distribution</dt><dd>Uniform random 3-SAT, seed {cfg.seed}</dd>
              <dt>Solver</dt><dd>CDCL, 1-UIP, VSIDS, Luby restarts (this app, TypeScript)</dd>
              <dt>Result</dt><dd><strong>{solved.result}</strong> in {solved.solveMs.toFixed(1)} ms</dd>
              <dt>Decisions</dt><dd className="mono">{solved.stats.decisions}</dd>
              <dt>Conflicts</dt><dd className="mono">{solved.stats.conflicts}</dd>
              <dt>Search work</dt><dd className="mono">{solved.stats.work.toLocaleString("en-US")}</dd>
            </dl>
          </>
        ) : <p>Solving…</p>}
      </section>
      {solved?.check && inst !== "bench" && (
        <section className="insp-section">
          <h2 className="insp-h">{solved.check.kind === "witness" ? "Witness verification" : "Unsatisfiability certificate"}</h2>
          <ul className="list">
            <li><StatusGlyph status={solved.check.ok ? "verified-instance" : "refuted"} /><span>{solved.check.kind === "witness" ? `Every clause evaluated under the assignment: ${solved.check.ok ? "all satisfied" : `clause ${(solved.check.firstFalse ?? 0) + 1} is false`}.` : `${solved.check.lemmas} DRUP lemmas checked by an independent reverse-unit-propagation checker: ${solved.check.ok ? "valid, ends in the empty clause" : "rejected"}.`}</span></li>
            <li><StatusGlyph status="exact" /><span>Check work: {solved.check.work.toLocaleString("en-US")} operations, against {solved.stats.work.toLocaleString("en-US")} for the search.</span></li>
          </ul>
          <div style={{ marginTop: 8 }}><ExactnessTag kind="exact" /></div>
        </section>
      )}
      <ProblemStatusBlock problem="pnp" compact />
      <section className="insp-section">
        <h2 className="insp-h">Relevant barriers</h2>
        <p>Relativization (Baker, Gill, Solovay), natural proofs (Razborov, Rudich) and algebrization (Aaronson, Wigderson) each rule out a family of proof techniques. Measured solver behaviour is outside all three: it is evidence about one algorithm, not about P.</p>
      </section>
      <section className="insp-section">
        <h2 className="insp-h">Next useful test</h2>
        <p>Fix the exact computational model and a candidate lower-bound statement for a restricted class, then check which barrier it is subject to before any computation.</p>
      </section>
    </div>
  );
}
