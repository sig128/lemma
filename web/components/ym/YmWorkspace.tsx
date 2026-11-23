"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceFrame, TimelineDock, InsetProbe } from "@/components/shell/Workspace";
import { Chart } from "@/components/charts/Chart";
import { Tex } from "@/components/Tex";
import { Icon, StatusGlyph } from "@/components/glyphs";
import { ProblemStatusBlock } from "@/components/views/StatusBlock";
import { useSize, usePersisted, useVisible } from "@/lib/hooks";
import { useEventsFor, type EngineStatus } from "@/lib/engine";
import { besselI, blocking, exactPlaquette, exactWilson } from "@/lib/ym";

type State = { sweeps: number; therm: number; measuring: boolean; plaq: Float32Array; L: number; delta: number; mean: number; loops: { R: number; T: number; w: number }[] | null };

export default function YmWorkspace({ status }: { status: EngineStatus }) {
  const [cfg, setCfg] = usePersisted("ym:cfg", { L: 16, beta: 2, seed: 5 });
  const worker = useRef<Worker | null>(null);
  const [running, setRunning] = useState(false);
  const [st, setSt] = useState<State | null>(null);
  const series = useRef<{ plaq: number[]; loops: Map<string, number[]>; trace: { x: number; y: number }[] }>({ plaq: [], loops: new Map(), trace: [] });
  const [, force] = useState(0);
  const [loopSel, setLoopSel] = useState("2x2");
  const [selEvent, setSelEvent] = useState<number | null>(null);
  const ev = useEventsFor("ym", status);
  const [ref, size] = useSize<HTMLDivElement>();
  const vis = useVisible(ref);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const w = new Worker(new URL("../../workers/ym.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (e) => {
      const d = e.data as State;
      setSt(d);
      const s = series.current;
      s.trace.push({ x: d.sweeps, y: d.mean }); if (s.trace.length > 1500) s.trace.splice(0, s.trace.length - 1500);
      if (d.measuring) {
        s.plaq.push(d.mean);
        d.loops?.forEach((l) => { const k = `${l.R}x${l.T}`; const a = s.loops.get(k) ?? []; a.push(l.w); s.loops.set(k, a); });
      }
      force((x) => x + 1);
    };
    return () => w.terminate();
  }, []);
  useEffect(() => {
    setRunning(false);
    series.current = { plaq: [], loops: new Map(), trace: [] };
    worker.current?.postMessage({ type: "init", L: cfg.L, beta: cfg.beta, seed: cfg.seed, therm: 200 });
  }, [cfg.L, cfg.beta, cfg.seed]);
  useEffect(() => { if (!vis && running) { worker.current?.postMessage({ type: "pause" }); setRunning(false); } }, [vis, running]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !st) return;
    const L = st.L;
    c.width = L; c.height = L;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const img = ctx.createImageData(L, L);
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
      const v = (st.plaq[(L - 1 - y) * L + x] + 1) / 2; // 0..1
      const k = (y * L + x) * 4;
      // sequential: dark neutral -> jade
      img.data[k] = 18 + (95 - 18) * v; img.data[k + 1] = 24 + (196 - 24) * v; img.data[k + 2] = 30 + (160 - 30) * v; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [st]);

  const V = cfg.L * cfg.L;
  const exactP = useMemo(() => exactPlaquette(cfg.beta, V), [cfg.beta, V]);
  const r1 = besselI(1, cfg.beta) / besselI(0, cfg.beta);
  const pStat = blocking(series.current.plaq);
  const loopRows = [...series.current.loops.entries()].map(([k, xs]) => {
    const [R, T] = k.split("x").map(Number);
    const b = blocking(xs);
    const ex = exactWilson(cfg.beta, V, R * T);
    return { k, R, T, A: R * T, mean: b.mean, err: b.err, plateau: b.plateau, bin: b.bin, n: xs.length, exact: ex, z: Number.isFinite(b.err) && b.err > 0 ? (b.mean - ex) / b.err : NaN };
  }).sort((a, b) => a.A - b.A);
  const [sR, sT] = loopSel.split("x").map(Number);

  const [top, setTop] = useState(150);
  const narrow = size.w > 0 && size.w < 640;
  const side = narrow ? Math.min(size.w - 32, 460) : Math.max(220, Math.min(size.w - 470, size.h - top - 30));
  const toggle = () => { worker.current?.postMessage({ type: running ? "pause" : "run" }); setRunning(!running); };

  const stage = (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <InsetProbe onInset={setTop} />
      <div className="stage-head">
        <div>
          <h1 className="stage-title">A toy lattice gauge theory</h1>
          <div className="stage-eq"><Tex tex={String.raw`S=\beta\sum_{p}\bigl(1-\cos\theta_p\bigr),\qquad \langle W(R,T)\rangle \to \Bigl(\tfrac{I_1(\beta)}{I_0(\beta)}\Bigr)^{RT}`} /></div>
          <div className="stage-facts">
            <span>gauge group U(1), dimension 2</span>
            <span>{cfg.L}×{cfg.L} periodic lattice, β = {cfg.beta.toFixed(2)}</span>
            <span>{st ? (st.sweeps === 0 ? "cold start, not yet run" : `${st.sweeps} sweeps${st.measuring ? "" : ", thermalizing"}`) : "initializing"}</span>
          </div>
        </div>
      </div>
      <div data-export data-export-note={`Plaquette cos θp on a ${cfg.L}×${cfg.L} lattice at β = ${cfg.beta.toFixed(2)}; gold outline is the ${sR}×${sT} Wilson loop`} style={{ position: "absolute", left: narrow ? 16 : 32, top, width: side, height: side }}>
        <canvas ref={canvas} style={{ width: "100%", height: "100%", imageRendering: "pixelated", outline: "1px solid var(--rule-soft)" }} role="img" aria-label="Plaquette values cos θ_p over the lattice" />
        <svg data-export-layer style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} viewBox={`0 0 ${cfg.L} ${cfg.L}`} preserveAspectRatio="none" aria-hidden>
          {Array.from({ length: cfg.L + 1 }, (_, i) => <g key={i}><line x1={i} x2={i} y1={0} y2={cfg.L} stroke="#080b10" strokeWidth={0.06} /><line y1={i} y2={i} x1={0} x2={cfg.L} stroke="#080b10" strokeWidth={0.06} /></g>)}
          <rect x={2} y={cfg.L - 2 - sT} width={sR} height={sT} fill="none" stroke="var(--accent-2)" strokeWidth={0.12} />
        </svg>
        <div className="legend-box" style={{ left: 8, bottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="mono">−1</span><span style={{ width: 110, height: 8, borderRadius: 2, background: "linear-gradient(90deg, rgb(18,24,30), rgb(95,196,160))" }} /><span className="mono">+1</span>
          </div>
          <div style={{ marginTop: 4 }}>plaquette cos θ<sub>p</sub>; gold outline: Wilson loop {sR}×{sT}</div>
        </div>
      </div>
      <div style={narrow ? { position: "absolute", left: 16, right: 16, top: top + side + 16, paddingBottom: 24 } : { position: "absolute", left: side + 64, top, right: 24, bottom: 24, overflow: "auto" }}>
        <div className="ctrl-panel" style={{ position: "relative", width: "100%", maxWidth: 380 }}>
          <h3>Ensemble</h3>
          <label className="field"><span className="field-row"><span>Coupling β</span><span className="mono">{cfg.beta.toFixed(2)}</span></span>
            <input type="range" min={0.5} max={4} step={0.05} value={cfg.beta} onChange={(e) => setCfg({ ...cfg, beta: +e.target.value })} /></label>
          <div className="seg" role="radiogroup" aria-label="Lattice size">
            {[8, 16, 32].map((L) => <button key={L} role="radio" aria-checked={cfg.L === L} onClick={() => setCfg({ ...cfg, L })}>{L}×{L}</button>)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-accent" onClick={toggle}><Icon name={running ? "pause" : "play"} />{running ? "Pause" : "Run Metropolis"}</button>
            <button className="btn" onClick={() => setCfg({ ...cfg, seed: cfg.seed + 1 })}>New seed</button>
          </div>
          <p className="note" style={{ margin: 0 }}>200 thermalization sweeps, then one measurement per batch. Step size tuned toward 50% acceptance (now {st?.delta.toFixed(2) ?? "–"}).</p>
        </div>
        {series.current.trace.length > 2 && (
          <div style={{ marginTop: 16, maxWidth: 520 }}>
            <Chart height={170} series={[{ id: "p", label: "mean plaquette", color: "var(--series-4)", kind: "line", points: series.current.trace }]}
              x={{ label: "sweep" }} y={{ label: "⟨cos θp⟩" }}
              annotations={[{ type: "hline", y: exactP, label: `exact, finite volume: ${exactP.toFixed(6)}`, color: "var(--accent-2)" }]}
              tooltipX={(v) => String(Math.round(v))} tooltipY={(v) => v.toFixed(5)} />
          </div>
        )}
        {loopRows.length > 0 && (
          <div style={{ marginTop: 16, maxWidth: 520 }}>
            <Chart height={200} series={[
              { id: "mc", label: "Monte Carlo −ln⟨W⟩ (blocking error)", color: "var(--series-4)", kind: "errorbars", points: loopRows.filter((r) => r.mean > 0).map((r) => ({ x: r.A, y: -Math.log(r.mean), yerr: r.err / r.mean, meta: `${r.R}×${r.T}` })) },
              { id: "ex", label: "Exact, finite volume", color: "var(--series-2)", kind: "line", points: Array.from({ length: 17 }, (_, A) => ({ x: A, y: -Math.log(exactWilson(cfg.beta, V, A)) })) },
            ]} x={{ label: "loop area R·T", domain: [0, 16.5] }} y={{ label: "−ln ⟨W⟩" }} tooltipX={(v) => String(Math.round(v))} tooltipY={(v) => v.toFixed(4)} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <WorkspaceFrame problem="ym" stage={stage}
      inspector={
        <div className="insp">
          <section className="insp-section">
            <h2 className="insp-h">Selected</h2>
            <p className="insp-title">Wilson loop {sR}×{sT}</p>
            <div className="seg" role="radiogroup" aria-label="Wilson loop" style={{ flexWrap: "wrap", marginBottom: 8 }}>
              {["1x1", "2x2", "3x3", "2x4", "4x4"].map((k) => <button key={k} role="radio" aria-checked={loopSel === k} onClick={() => setLoopSel(k)}>{k.replace("x", "×")}</button>)}
            </div>
            <p className="callout">Group U(1), two dimensions, finite periodic lattice. The required theory is four-dimensional, non-abelian, in the continuum. Agreement here checks the code against an exact solution; it is not evidence for a mass gap.</p>
          </section>
          <section className="insp-section">
            <h2 className="insp-h">Monte Carlo against the exact solution</h2>
            <table className="data">
              <thead><tr><th>observable</th><th className="num">MC</th><th className="num">exact</th><th className="num">dev.</th></tr></thead>
              <tbody>
                <tr><td>⟨cos θp⟩</td><td className="num mono">{Number.isFinite(pStat.err) ? `${pStat.mean.toFixed(5)} ± ${pStat.err.toFixed(5)}${pStat.plateau ? "" : "*"}` : "–"}</td><td className="num mono">{exactP.toFixed(5)}</td><td className="num mono">{Number.isFinite(pStat.err) ? `${((pStat.mean - exactP) / pStat.err).toFixed(1)}σ` : "–"}</td></tr>
                {loopRows.map((r) => <tr key={r.k}><td>W({r.R},{r.T})</td><td className="num mono">{Number.isFinite(r.err) ? `${r.mean.toFixed(5)} ± ${r.err.toFixed(5)}${r.plateau ? "" : "*"}` : r.mean.toFixed(5)}</td><td className="num mono">{r.exact.toFixed(5)}</td><td className="num mono">{Number.isFinite(r.z) ? `${r.z.toFixed(1)}σ` : "–"}</td></tr>)}
              </tbody>
            </table>
            <p className="note" style={{ marginTop: 6 }}>
              Errors by blocking analysis: the bin size doubles until the error estimate stops growing.
              {Number.isFinite(pStat.err) ? (pStat.plateau ? ` Plaquette: bins of ${pStat.bin}, integrated autocorrelation time about ${pStat.tau.toFixed(1)} measurements.` : " The plaquette error has not reached a plateau yet.") : " At least 32 measurements are needed before an error is shown."}
              {[pStat, ...loopRows].some((r) => Number.isFinite(r.err) && !r.plateau) ? " An asterisk marks an error that has not plateaued; read it as a lower bound." : ""}
              {" "}Infinite-volume string tension σ = −ln(I₁/I₀) = {(-Math.log(r1)).toFixed(5)} at this β.
            </p>
          </section>
          <section className="insp-section">
            <h2 className="insp-h"><StatusGlyph status="blocked" /> Spectral and mass-gap estimates</h2>
            <p>Not computed. Correlation-function and glueball-mass estimates need four-dimensional SU(N) ensembles with smeared operators and a continuum extrapolation; no such adapter exists here, and none is simulated.</p>
          </section>
          <ProblemStatusBlock problem="ym" compact />
        </div>
      }
      dock={<TimelineDock events={ev.events} mode={ev.mode} loading={ev.loading} error={ev.error} selected={selEvent} onSelect={(e) => setSelEvent(e?.seq ?? null)} lastUpdate={ev.lastUpdate} />} />
  );
}
