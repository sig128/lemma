"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceFrame, TimelineDock, useStageInset } from "@/components/shell/Workspace";
import { phaseRgb } from "@/lib/color";
import { Chart } from "@/components/charts/Chart";
import { Tex } from "@/components/Tex";
import { ExactnessTag, StatusGlyph } from "@/components/glyphs";
import { ProblemStatusBlock } from "@/components/views/StatusBlock";
import { useJson, useSize, useUrlState, usePersisted } from "@/lib/hooks";
import { useEventsFor, type EngineStatus } from "@/lib/engine";
import { borweinTerms, logGamma, makeZeta, psiExplicit, psiSteps } from "@/lib/zeta";
import { niceTicks } from "@/lib/scales";

type ZeroData = {
  zeros: { n: number; gamma: string; re: string; sign_change: boolean }[];
  zeros_provenance: Record<string, unknown> & { mpmath_version: string; mp_dps: number; computed_at: string; wall_seconds: number; method: string };
  count_checks: { T: number; listed_below_T: number; mpmath_nzeros: number }[];
  count_checks_meaning: string;
  Z: { t: number[]; Z: number[]; step: number; provenance: { mp_dps: number } };
  scope: string;
};

export default function RiemannWorkspace({ status }: { status: EngineStatus }) {
  const url = useUrlState();
  const inst = url.get("inst") ?? "strip";
  const { data } = useJson<ZeroData>("/data/riemann/zeros.json");
  const ev = useEventsFor("riemann", status);
  const [win, setWin] = usePersisted("riemann:window", { t0: 10, span: 40 });
  const zeroN = url.get("zero") ? Number(url.get("zero")) : null;
  const [K, setK] = usePersisted("riemann:K", 30);
  const [X, setX] = usePersisted("riemann:X", 60);
  const [diag, setDiag] = useState<{ n: number; ms: number; maxDiff: number | null } | null>(null);
  const [selEvent, setSelEvent] = useState<number | null>(null);
  const zero = data && zeroN ? data.zeros[zeroN - 1] : null;

  const stage = (
    <>
      <div className="stage-head">
        <div>
          <h1 className="stage-title">The critical strip</h1>
          <div className="stage-eq"><Tex tex={String.raw`\zeta(\rho)=0,\ \ 0<\operatorname{Re}\rho<1\ \ \Longrightarrow\ \ \operatorname{Re}\rho=\tfrac12`} /></div>
          <div className="stage-facts">
            <span>{data ? `${data.zeros.length} zeros computed here` : "loading zeros"}</span>
            <span>verified to height 3·10¹² (Platt and Trudgian)</span>
            <span>Clay status: Active</span>
          </div>
        </div>
        <div className="stage-head-tools">
          <div className="seg" role="radiogroup" aria-label="Instrument">
            <button role="radio" aria-checked={inst === "strip"} onClick={() => url.set({ inst: null })}>Strip and Z(t)</button>
            <button role="radio" aria-checked={inst === "primes"} onClick={() => url.set({ inst: "primes" })}>Primes from zeros</button>
          </div>
        </div>
      </div>
      {inst === "strip" && data && <StripView data={data} t0={win.t0} span={win.span} selected={zeroN} onSelect={(n) => url.set({ zero: n ? String(n) : null })} onDiag={setDiag} />}
      {inst === "strip" && data && (
        <div className="ctrl-panel riemann-window" style={{ right: 16, bottom: 16 }}>
          <h3>Height window</h3>
          <label className="field">
            <span className="field-row"><span>Start t₀</span><span className="mono">{win.t0.toFixed(0)}</span></span>
            <input type="range" min={0} max={380} step={1} value={win.t0} onChange={(e) => setWin({ ...win, t0: +e.target.value })} />
          </label>
          <div className="seg" role="radiogroup" aria-label="Window height">
            {[20, 40, 80].map((s) => <button key={s} role="radio" aria-checked={win.span === s} onClick={() => setWin({ ...win, span: s })}>{s}</button>)}
          </div>
          {diag && <p className="note" style={{ margin: 0 }}>Browser ζ: Borwein series, {diag.n} terms, {diag.ms.toFixed(0)} ms.{diag.maxDiff !== null ? ` Max |Z_browser − Z_mpmath| on this window: ${diag.maxDiff.toExponential(1)}.` : ""}</p>}
        </div>
      )}
      {inst === "primes" && data && <PrimesView data={data} K={K} setK={setK} X={X} setX={setX} />}
    </>
  );

  return (
    <WorkspaceFrame problem="riemann" stage={stage}
      inspector={<RiemannInspector data={data} zero={zero} inst={inst} K={K} />}
      dock={<TimelineDock events={ev.events} mode={ev.mode} loading={ev.loading} error={ev.error} selected={selEvent} onSelect={(e) => setSelEvent(e?.seq ?? null)} lastUpdate={ev.lastUpdate} />} />
  );
}

function hardyZ(zeta: (s: number, t: number) => [number, number], t: number): number {
  const [zr, zi] = zeta(0.5, t);
  const lg = logGamma(0.25, t / 2);
  const theta = lg[1] - (t / 2) * Math.log(Math.PI);
  return zr * Math.cos(theta) - zi * Math.sin(theta);
}

function StripView({ data, t0, span, selected, onSelect, onDiag }: { data: ZeroData; t0: number; span: number; selected: number | null; onSelect: (n: number | null) => void; onDiag: (d: { n: number; ms: number; maxDiff: number | null }) => void }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const [busy, setBusy] = useState(false);
  const inset = useStageInset();
  const narrow = size.w > 0 && size.w < 640;
  const top = narrow ? inset + 10 : Math.min(inset + 10, Math.max(110, size.h * 0.45));
  const H = narrow ? Math.min(460, Math.max(280, size.h - top - 96)) : Math.max(180, size.h - top - 96);
  const W = Math.max(300, size.w);
  const left = narrow ? 44 : 72;
  const stripW = narrow ? Math.round((W - left - 16) * 0.5) : Math.min(420, Math.max(220, W * 0.36));
  useEffect(() => { (ref.current?.closest(".stage") as HTMLElement | null)?.style.setProperty("--graph-h", `${H}px`); }, [H, ref]);
  const s0 = -0.6, s1 = 1.6;
  const t1 = t0 + span;
  const ty = (t: number) => top + H - ((t - t0) / span) * H;
  const sx = (s: number) => left + ((s - s0) / (s1 - s0)) * stripW;
  const zx0 = left + stripW + (narrow ? 30 : 56), zW = narrow ? Math.max(90, W - zx0 - 16) : Math.max(160, W - zx0 - 300);

  useEffect(() => {
    worker.current = new Worker(new URL("../../workers/zeta.worker.ts", import.meta.url), { type: "module" });
    return () => worker.current?.terminate();
  }, []);
  useEffect(() => {
    const w = worker.current, c = canvas.current;
    if (!w || !c || size.w === 0) return;
    const id = ++reqId.current;
    const cw = Math.round(stripW / 2), ch = Math.round(H / 2);
    setBusy(true);
    w.onmessage = (e: MessageEvent<{ id: number; buf: Uint8ClampedArray; w: number; h: number; n: number; ms: number }>) => {
      if (e.data.id !== reqId.current) return;
      c.width = e.data.w; c.height = e.data.h;
      const ctx = c.getContext("2d");
      ctx?.putImageData(new ImageData(new Uint8ClampedArray(e.data.buf), e.data.w, e.data.h), 0, 0);
      setBusy(false);
      // cross-check browser Z(t) against the mpmath reference where both exist
      const zeta = makeZeta(e.data.n);
      let maxDiff: number | null = null;
      for (let i = 0; i < data.Z.t.length; i += 7) {
        const t = data.Z.t[i];
        if (t < t0 || t > t1) continue;
        const d = Math.abs(hardyZ(zeta, t) - data.Z.Z[i]);
        maxDiff = Math.max(maxDiff ?? 0, d);
      }
      onDiag({ n: e.data.n, ms: e.data.ms, maxDiff });
    };
    w.postMessage({ id, w: cw, h: ch, s0, s1, t0, t1 });
  }, [t0, t1, stripW, H, size.w, data, onDiag]);

  // Z(t) along the line, aligned with the strip's t axis (computed in browser for the window)
  const zcurve = useMemo(() => {
    const zeta = makeZeta(borweinTerms(t1 + 2));
    const pts: [number, number][] = [];
    const N = 600;
    for (let i = 0; i <= N; i++) { const t = t0 + (i / N) * span; pts.push([t, hardyZ(zeta, t)]); }
    return pts;
  }, [t0, t1, span]);
  const zmax = Math.max(2, ...zcurve.map((p) => Math.abs(p[1])));
  const zxs = (z: number) => zx0 + zW / 2 + (z / zmax) * (zW / 2);
  const zPath = zcurve.map((p, i) => `${i ? "L" : "M"}${zxs(p[1]).toFixed(1)},${ty(p[0]).toFixed(1)}`).join("");
  const inWin = data.zeros.filter((z) => +z.gamma >= t0 && +z.gamma <= t1);
  const ticks = niceTicks(t0, t1, Math.max(4, Math.round(H / 70)));

  return (
    <div ref={ref} className="instrument" aria-label="Domain coloring of zeta in the critical strip with Hardy's Z function">
      <canvas ref={canvas} style={{ position: "absolute", left, top, width: stripW, height: H, imageRendering: "auto", borderRadius: 2 }} aria-hidden />
      <svg className="scene" width={W} height={size.h} style={{ position: "absolute", inset: 0 }}>
        <g fontFamily="var(--font-mono)" fontSize="11" fill="var(--muted)">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left - 6} x2={left} y1={ty(t)} y2={ty(t)} stroke="var(--rule)" />
              <text x={left - 10} y={ty(t) + 4} textAnchor="end">{t}</text>
              <line x1={zx0} x2={zx0 + zW} y1={ty(t)} y2={ty(t)} stroke="#151c27" />
            </g>
          ))}
          {[0, 0.5, 1].map((s) => <text key={s} x={sx(s)} y={top + H + 14} textAnchor="middle">{s === 0.5 ? "½" : s}</text>)}
          <text x={sx(0.5)} y={top + H + 30} textAnchor="middle" fill="var(--text-2)" fontFamily="var(--font-sans)" fontSize="12">Re s</text>
          <text x={left - 40} y={top - 8} fill="var(--text-2)" fontFamily="var(--font-sans)" fontSize="12">Im s = t</text>
        </g>
        {[0, 1].map((s) => <line key={s} x1={sx(s)} x2={sx(s)} y1={top} y2={top + H} stroke="#e9e4da" strokeOpacity={0.35} strokeDasharray="3 5" />)}
        <line x1={sx(0.5)} x2={sx(0.5)} y1={top} y2={top + H} stroke="#e8e6ef" strokeOpacity={0.85} strokeWidth={1.2} />
        {/* Z(t) panel */}
        <line x1={zxs(0)} x2={zxs(0)} y1={top} y2={top + H} stroke="var(--rule)" />
        <path d={zPath} fill="none" stroke="var(--accent)" strokeWidth={1.6} />
        <text x={zx0 + zW / 2} y={top + H + 30} textAnchor="middle" fill="var(--text-2)" fontSize="12">Z(t), Hardy&apos;s function on the line</text>
        <text x={zxs(zmax)} y={top + H + 14} textAnchor="end" fill="var(--muted)" fontSize="11" fontFamily="var(--font-mono)">{zmax.toFixed(1)}</text>
        <text x={zxs(-zmax)} y={top + H + 14} textAnchor="start" fill="var(--muted)" fontSize="11" fontFamily="var(--font-mono)">−{zmax.toFixed(1)}</text>
        {/* zeros */}
        {inWin.map((z) => {
          const y = ty(+z.gamma), sel = selected === z.n;
          return (
            <g key={z.n} role="button" tabIndex={0} aria-pressed={sel} aria-label={`Zero number ${z.n} at height ${z.gamma}`} style={{ cursor: "pointer" }}
              onClick={() => onSelect(sel ? null : z.n)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(sel ? null : z.n); } }}>
              <rect x={sx(0.5) - 12} y={y - 7} width={zxs(0) - sx(0.5) + 24} height={14} fill="transparent" />
              <line x1={sx(0.5)} x2={zxs(0)} y1={y} y2={y} stroke="var(--accent)" strokeOpacity={sel ? 0.8 : 0.18} strokeDasharray="2 4" />
              <circle cx={sx(0.5)} cy={y} r={12} fill="transparent" />
              <circle cx={sx(0.5)} cy={y} r={sel ? 6 : 4} fill="#d9d1ff" stroke="#080b10" strokeWidth={1.5} />
              <circle cx={zxs(0)} cy={y} r={sel ? 4.5 : 3} fill="none" stroke="var(--accent)" strokeWidth={1.4} />
              {(sel || (span <= 40 && !narrow)) && <text x={zxs(0) + 10} y={y + 4} fontSize="11.5" fontFamily="var(--font-mono)" fill={sel ? "var(--text)" : "var(--text-2)"} paintOrder="stroke" stroke="var(--bg)" strokeWidth={3}>γ{sub(z.n)} = {(+z.gamma).toFixed(sel ? 12 : 4)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="legend-box" style={{ left, top: top + H - 4, transform: "translateY(-100%)", display: busy ? "block" : "none" }}>Computing ζ on {Math.round(stripW / 2)}×{Math.round(H / 2)} points…</div>
      <div className="legend-box narrow-hide" style={{ left: left + stripW + 12, top, width: 44, padding: 6, display: "grid", gap: 4, justifyItems: "center" }} aria-label="Legend: hue is the argument of zeta, rings are powers of two in the modulus">
        <PhaseWheel />
        <span style={{ fontSize: 10.5, textAlign: "center", lineHeight: 1.2 }}>arg ζ</span>
      </div>
      <div className="stage-caption riemann-caption" style={{ left, bottom: 10, maxWidth: Math.max(stripW + 200, 420) }}>
        <span>Hue is arg ζ(s) at equal lightness, soft bands mark |ζ| = 2ᵏ, and the field darkens where ζ → 0. Computed in this browser in double precision.</span>
      </div>
    </div>
  );
}

function PhaseWheel() {
  const segs = 36;
  return (
    <svg width="34" height="34" viewBox="-17 -17 34 34" aria-hidden>
      {Array.from({ length: segs }, (_, i) => {
        const a0 = (i / segs) * 2 * Math.PI - Math.PI, a1 = ((i + 1) / segs) * 2 * Math.PI - Math.PI;
        const [r, g, b] = phaseRgb((a0 + a1) / 2);
        const col = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        return <path key={i} d={`M0,0L${16 * Math.cos(a0)},${-16 * Math.sin(a0)}A16,16 0 0 0 ${16 * Math.cos(a1)},${-16 * Math.sin(a1)}Z`} fill={col} />;
      })}
      <circle r="6" fill="var(--bg)" />
    </svg>
  );
}

const sub = (n: number) => String(n).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[+d]).join("");

function PrimesView({ data, K, setK, X, setX }: { data: ZeroData; K: number; setK: (v: number) => void; X: number; setX: (v: number) => void }) {
  const steps = useMemo(() => psiSteps(X), [X]);
  const approx = useMemo(() => {
    const g = data.zeros.slice(0, K).map((z) => +z.gamma);
    const pts: { x: number; y: number }[] = [];
    const N = 700;
    for (let i = 0; i <= N; i++) { const x = 2 + (i / N) * (X - 2); pts.push({ x, y: psiExplicit(x, g) }); }
    return pts;
  }, [data, K, X]);
  const exact = steps.filter((p) => p.x <= X).flatMap((p, i, arr) => (i + 1 < arr.length ? [p, { x: arr[i + 1].x - 1e-9, y: p.y }] : [p, { x: X, y: p.y }]));
  return (
    <div className="view-scroll stage-scroll">
      <div className="view-pad" style={{ paddingTop: 4, maxWidth: 1060 }}>
        <div className="field-row" style={{ gap: 24, alignItems: "end", flexWrap: "wrap" }}>
          <label className="field" style={{ minWidth: 260 }}>
            <span className="field-row"><span>Zeros used, K</span><span className="mono">{K}</span></span>
            <input type="range" min={1} max={data.zeros.length} value={K} onChange={(e) => setK(+e.target.value)} />
          </label>
          <label className="field" style={{ minWidth: 220 }}>
            <span className="field-row"><span>Range up to x</span><span className="mono">{X}</span></span>
            <input type="range" min={20} max={200} step={5} value={X} onChange={(e) => setX(+e.target.value)} />
          </label>
        </div>
        <div className="panel" style={{ marginTop: 16 }}>
          <Chart height={360} series={[
            { id: "psi", label: "ψ(x), from the primes (exact steps)", color: "var(--series-2)", kind: "line", points: exact },
            { id: "approx", label: `Explicit formula with the first ${K} zeros`, color: "var(--series-1)", kind: "line", points: approx },
          ]} x={{ label: "x", domain: [2, X] }} y={{ label: "ψ(x)" }} tooltipX={(v) => v.toFixed(2)} tooltipY={(v) => v.toFixed(3)} />
        </div>
        <p className="dim" style={{ maxWidth: "72ch", fontSize: 14 }}>
          Von Mangoldt&apos;s explicit formula <Tex tex={String.raw`\psi_0(x)=x-\sum_\rho \frac{x^\rho}{\rho}-\log 2\pi-\tfrac12\log(1-x^{-2})`} /> is exact when the sum runs over all nontrivial zeros, paired by conjugates. Here it is truncated to the first K zeros of the computed list, each taken on the critical line where the run located it. The oscillation around the jumps is the truncation; it shrinks as K grows.
        </p>
      </div>
    </div>
  );
}

function RiemannInspector({ data, zero, inst, K }: { data: ZeroData | null; zero: ZeroData["zeros"][number] | null; inst: string; K: number }) {
  return (
    <div className="insp">
      <section className="insp-section">
        <h2 className="insp-h">Selected</h2>
        {zero && data ? (
          <>
            <p className="insp-title">Zero ρ{sub(zero.n)} <span className="muted" style={{ fontSize: 14 }}>n = {zero.n}</span></p>
            <dl className="kv">
              <dt>Re ρ</dt><dd className="mono">1/2 (on the line)</dd>
              <dt>Im ρ</dt><dd className="mono">{zero.gamma}</dd>
              <dt>Certificate</dt><dd>{zero.sign_change ? "Z(t) changes sign across γ (±10⁻⁶)" : "no sign change recorded"}</dd>
              <dt>Method</dt><dd className="mono">mpmath {data.zeros_provenance.mpmath_version} zetazero, {data.zeros_provenance.mp_dps} digits</dd>
            </dl>
            <p className="note" style={{ marginTop: 8 }}>A sign change of the real function Z(t) places a zero exactly on the line, given correct evaluation. This is evidence about this zero only.</p>
            <div style={{ marginTop: 6 }}><ExactnessTag kind="numerical" /></div>
          </>
        ) : inst === "primes" ? (
          <>
            <p className="insp-title">Primes from {K} zeros</p>
            <p>The staircase is computed from the primes; the smooth curve uses only zeros of ζ. Their agreement illustrates the explicit formula, which is a theorem; it does not test the Riemann hypothesis.</p>
          </>
        ) : (
          <>
            <p className="insp-title">Critical strip</p>
            <p>Select a zero on the line or in the Z(t) panel to inspect its computation.</p>
          </>
        )}
      </section>
      <ProblemStatusBlock problem="riemann" />
      {data && (
        <section className="insp-section">
          <h2 className="insp-h">Evidence in this run</h2>
          <ul className="list">
            <li><StatusGlyph status="numerically-supported" /><span>{data.zeros.length} zeros up to t = {(+data.zeros[data.zeros.length - 1].gamma).toFixed(2)}, each with a sign change of Z(t).</span></li>
            {data.count_checks.map((c) => <li key={c.T}><StatusGlyph status="numerically-supported" /><span>Below T = {c.T}: {c.listed_below_T} listed, mpmath.nzeros gives {c.mpmath_nzeros}.</span></li>)}
          </ul>
          <p className="note" style={{ marginTop: 8 }}>{data.count_checks_meaning}</p>
        </section>
      )}
    </div>
  );
}
