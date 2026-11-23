"use client";
import { useEffect, useRef, useState } from "react";
import { WorkspaceFrame, TimelineDock, InsetProbe } from "@/components/shell/Workspace";
import { Chart } from "@/components/charts/Chart";
import { Tex } from "@/components/Tex";
import { Icon, StatusGlyph } from "@/components/glyphs";
import { ProblemStatusBlock } from "@/components/views/StatusBlock";
import { useSize, useUrlState, usePersisted, useVisible } from "@/lib/hooks";
import { useEventsFor, type EngineStatus } from "@/lib/engine";
import type { IC } from "@/lib/ns";

type Diag = { t: number; E: number; Z: number; div: number; wmax: number; tailRatio: number; tgError: number | null; steps: number };
type Frame = { N: number; omega: Float32Array; diag: Diag };
type RefineRow = { N: number; T: number; dt: number; E: number; Z: number; div: number; tail: number; tgError: number | null; ms: number };

const IC_LABEL: Record<IC, string> = { tg: "Taylor–Green vortex (exact solution known)", shear: "Double shear layer", turb: "Decaying turbulence (seeded)" };

/** Diverging map: ice blue (negative) through a dark neutral to coral (positive). */
function colour(v: number): [number, number, number] {
  const a = Math.min(1, Math.abs(v)) ** 0.75;
  const neu = [22, 27, 36];
  const pos = [231, 149, 127], neg = [140, 203, 235];
  const c = v >= 0 ? pos : neg;
  return [neu[0] + (c[0] - neu[0]) * a, neu[1] + (c[1] - neu[1]) * a, neu[2] + (c[2] - neu[2]) * a];
}

export default function NsWorkspace({ status }: { status: EngineStatus }) {
  const url = useUrlState();
  const ic = ((url.get("ic") as IC) ?? "shear") as IC;
  const [cfg, setCfg] = usePersisted("ns:cfg", { N: 64, nuExp: -3, seed: 11 });
  const nu = 10 ** cfg.nuExp;
  const worker = useRef<Worker | null>(null);
  const [running, setRunning] = useState(false);
  const [latest, setLatest] = useState<Frame | null>(null);
  const history = useRef<{ t: number; omega: Float32Array; N: number }[]>([]);
  const [diags, setDiags] = useState<Diag[]>([]);
  const [replayI, setReplayI] = useState<number | null>(null);
  const [refine, setRefine] = useState<{ rows: RefineRow[] | null; busy: boolean }>({ rows: null, busy: false });
  const [selEvent, setSelEvent] = useState<number | null>(null);
  const ev = useEventsFor("ns", status);
  const [ref, size] = useSize<HTMLDivElement>();
  const vis = useVisible(ref);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const w = new Worker(new URL("../../workers/ns.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === "frame") {
        setLatest(d as Frame);
        setDiags((p) => (p.length && d.diag.t <= p[p.length - 1].t ? [d.diag] : [...p, d.diag].slice(-2000)));
        const N: number = d.N, step = Math.max(1, N / 64), n = Math.floor(N / step);
        const small = new Float32Array(n * n);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) small[j * n + i] = d.omega[j * step * N + i * step];
        history.current = (history.current.length && d.diag.t <= history.current[history.current.length - 1].t ? [] : history.current).concat([{ t: d.diag.t, omega: small, N: n }]).slice(-400);
      }
      if (d.type === "refine-done") setRefine({ rows: d.rows, busy: false });
    };
    return () => w.terminate();
  }, []);
  useEffect(() => {
    setRunning(false); setReplayI(null); history.current = []; setDiags([]); setRefine({ rows: null, busy: false });
    worker.current?.postMessage({ type: "init", N: cfg.N, nu, ic, seed: cfg.seed });
  }, [cfg.N, nu, ic, cfg.seed]);
  useEffect(() => { if (!vis && running) { worker.current?.postMessage({ type: "pause" }); setRunning(false); } }, [vis, running]);

  // draw
  const shown = replayI !== null ? history.current[replayI] : latest ? { omega: latest.omega, N: latest.N, t: latest.diag.t } : null;
  const scale = latest ? Math.max(1e-9, latest.diag.wmax) : 1;
  useEffect(() => {
    const c = canvas.current;
    if (!c || !shown) return;
    const N = shown.N;
    c.width = N; c.height = N;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const [r, g, b] = colour(shown.omega[(N - 1 - j) * N + i] / scale);
      const k = (j * N + i) * 4;
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [shown, scale]);

  const [top, setTop] = useState(150);
  const narrow = size.w > 0 && size.w < 640;
  const side = narrow ? Math.min(size.w - 32, 460) : Math.max(200, Math.min(size.w - 420, size.h - top - 30));
  const d0 = diags[0];
  const toggle = () => { worker.current?.postMessage({ type: running ? "pause" : "run" }); setRunning(!running); setReplayI(null); };

  const stage = (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <InsetProbe onInset={setTop} />
      <div className="stage-head">
        <div>
          <h1 className="stage-title">Vorticity on the torus</h1>
          <div className="stage-eq"><Tex tex={String.raw`\partial_t\omega+u\cdot\nabla\omega=\nu\Delta\omega,\qquad u=\nabla^{\perp}\psi,\ \ \Delta\psi=-\omega`} /></div>
          <div className="stage-facts">
            <span><span className="badge-computed"><StatusGlyph status="numerically-supported" />2D numerical experiment</span></span>
            <span>{cfg.N}×{cfg.N} modes, ν = {nu.toExponential(0)}</span>
            <span>t = {(shown?.t ?? 0).toFixed(3)}{replayI !== null ? " (replay)" : ""}</span>
          </div>
        </div>
      </div>
      <div data-export data-export-note={`Vorticity ω at t = ${(shown?.t ?? 0).toFixed(3)}, color scale ±${scale.toFixed(1)} (coral positive, ice blue negative)`} style={{ position: "absolute", left: narrow ? 16 : 32, top, width: side, height: side }}>
        <canvas ref={canvas} style={{ width: "100%", height: "100%", imageRendering: "auto", borderRadius: 2, outline: "1px solid var(--rule-soft)" }} aria-label={`Vorticity field at t = ${(shown?.t ?? 0).toFixed(3)}; coral positive, ice blue negative`} role="img" />
        <div className="legend-box" style={{ left: 8, bottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="mono">−{scale.toFixed(1)}</span>
            <span style={{ width: 120, height: 8, borderRadius: 2, background: "linear-gradient(90deg, rgb(140,203,235), rgb(22,27,36), rgb(231,149,127))" }} />
            <span className="mono">+{scale.toFixed(1)}</span>
          </div>
          <div style={{ marginTop: 4 }}>vorticity ω (color scale fixed to the current max |ω|)</div>
        </div>
      </div>
      <div style={narrow ? { position: "absolute", left: 16, right: 16, top: top + side + 16, paddingBottom: 24 } : { position: "absolute", left: side + 64, top, right: 24, bottom: 24, overflow: "auto" }}>
        <div className="ctrl-panel" style={{ position: "relative", width: "100%", maxWidth: 380 }}>
          <h3>Initial condition and numerics</h3>
          <div className="seg" role="radiogroup" aria-label="Initial condition" style={{ flexWrap: "wrap" }}>
            {(["tg", "shear", "turb"] as IC[]).map((k) => <button key={k} role="radio" aria-checked={ic === k} onClick={() => url.set({ ic: k === "shear" ? null : k })}>{k === "tg" ? "Taylor–Green" : k === "shear" ? "Shear layer" : "Turbulence"}</button>)}
          </div>
          <div className="seg" role="radiogroup" aria-label="Resolution">
            {[32, 64, 128].map((N) => <button key={N} role="radio" aria-checked={cfg.N === N} onClick={() => setCfg({ ...cfg, N })}>{N}²</button>)}
          </div>
          <label className="field"><span className="field-row"><span>Viscosity ν</span><span className="mono">{nu.toExponential(1)}</span></span>
            <input type="range" min={-4} max={-1} step={0.25} value={cfg.nuExp} onChange={(e) => setCfg({ ...cfg, nuExp: +e.target.value })} /></label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-accent" onClick={toggle}><Icon name={running ? "pause" : "play"} />{running ? "Pause" : "Run"}</button>
            <button className="btn" onClick={() => setCfg({ ...cfg })}>Reset</button>
            <button className="btn" disabled={refine.busy} onClick={() => { setRefine({ rows: null, busy: true }); worker.current?.postMessage({ type: "refine", ic, nu, seed: cfg.seed, T: ic === "tg" ? 1 : 0.6, dt: 0.004, Ns: [32, 64, 128] }); }}>{refine.busy ? "Refining…" : "Mesh refinement"}</button>
          </div>
          {history.current.length > 1 && (
            <label className="field"><span className="field-row"><span>Replay recorded frames</span><span className="mono">{replayI === null ? "live" : `${replayI + 1}/${history.current.length}`}</span></span>
              <input type="range" min={0} max={history.current.length - 1} value={replayI ?? history.current.length - 1} onChange={(e) => { if (running) toggle(); setReplayI(+e.target.value); }} /></label>
          )}
          <p className="note" style={{ margin: 0 }}>Time step from CFL 0.5 each step; classical RK4; 2/3 dealiasing. Stops automatically when the stage is hidden.</p>
        </div>
        {diags.length > 1 && d0 && (
          <div style={{ marginTop: 16, maxWidth: 520 }}>
            <Chart height={190} series={[
              { id: "E", label: "Energy E(t)/E(0)", color: "var(--series-1)", kind: "line", points: diags.map((d) => ({ x: d.t, y: d.E / d0.E })) },
              { id: "Z", label: "Enstrophy Z(t)/Z(0)", color: "var(--series-2)", kind: "line", points: diags.map((d) => ({ x: d.t, y: d.Z / d0.Z })) },
            ]} x={{ label: "t" }} y={{ label: "ratio to t = 0" }} hideTable={false} tooltipX={(v) => v.toFixed(3)} tooltipY={(v) => v.toFixed(5)} />
          </div>
        )}
      </div>
    </div>
  );

  const dl = latest?.diag;
  return (
    <WorkspaceFrame problem="ns" stage={stage}
      inspector={
        <div className="insp">
          <section className="insp-section">
            <h2 className="insp-h">Selected</h2>
            <p className="insp-title">{IC_LABEL[ic]}</p>
            <p className="callout">This is a two-dimensional numerical experiment. In 2D, global smooth solutions are a classical theorem; nothing here bears on the three-dimensional problem, and numerical blow-up would be an instability, not a singularity.</p>
          </section>
          {dl && (
            <section className="insp-section">
              <h2 className="insp-h">Diagnostics, step {dl.steps}</h2>
              <dl className="kv">
                <dt>Time</dt><dd className="mono">{dl.t.toFixed(4)}</dd>
                <dt>Energy</dt><dd className="mono">{dl.E.toExponential(6)}</dd>
                <dt>Enstrophy</dt><dd className="mono">{dl.Z.toExponential(6)}</dd>
                <dt>max |∇·u|</dt><dd className="mono">{dl.div.toExponential(1)} <span className="note">(divergence-free by construction)</span></dd>
                <dt>Spectral tail</dt><dd className="mono">{dl.tailRatio.toExponential(1)} <span className="note">{dl.tailRatio > 1e-4 ? "under-resolved: raise N or ν" : "resolved"}</span></dd>
                {dl.tgError !== null && <><dt>Error vs exact</dt><dd className="mono">{dl.tgError.toExponential(2)} <span className="note">L∞ against 2 sin x sin y e^(−2νt)</span></dd></>}
              </dl>
            </section>
          )}
          {refine.rows && (
            <section className="insp-section">
              <h2 className="insp-h">Mesh refinement at t = {refine.rows[0].T.toFixed(2)}, dt = {refine.rows[0].dt}</h2>
              <table className="data">
                <thead><tr><th>N</th><th className="num">E</th><th className="num">Z</th><th className="num">{ic === "tg" ? "error" : "tail"}</th></tr></thead>
                <tbody>{refine.rows.map((r) => <tr key={r.N}><td className="mono">{r.N}²</td><td className="num mono">{r.E.toPrecision(8)}</td><td className="num mono">{r.Z.toPrecision(8)}</td><td className="num mono">{(ic === "tg" ? r.tgError! : r.tail).toExponential(1)}</td></tr>)}</tbody>
              </table>
              <p className="note" style={{ marginTop: 6 }}>Agreement across resolutions indicates the run is resolved at this time; it is not a proof of anything about the continuum equations.</p>
            </section>
          )}
          <ProblemStatusBlock problem="ns" />
        </div>
      }
      dock={<TimelineDock events={ev.events} mode={ev.mode} loading={ev.loading} error={ev.error} selected={selEvent} onSelect={(e) => setSelEvent(e?.seq ?? null)} lastUpdate={ev.lastUpdate} />} />
  );
}
