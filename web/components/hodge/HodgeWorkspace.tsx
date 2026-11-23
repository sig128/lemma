"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceFrame, TimelineDock } from "@/components/shell/Workspace";
import { Tex } from "@/components/Tex";
import { StatusGlyph, ExactnessTag } from "@/components/glyphs";
import { ProblemStatusBlock } from "@/components/views/StatusBlock";
import { useJson, useSize, useUrlState, usePersisted } from "@/lib/hooks";
import { useEventsFor, type EngineStatus } from "@/lib/engine";
import { FRAG, VERT, chartLines, chartMatrix, type ChartLine } from "@/components/hodge/surfaceGL";

type Line = { id: number; kind: "rational" | "golden"; field: string; name: string | null; P_exact: string[]; Q_exact: string[]; P_tex: string[]; Q_tex: string[]; P: number[]; Q: number[]; meets: number[] };
type Clebsch = {
  surface: { name: string; equations_tex: string[]; coordinates: string; facts_exact: { lines: number; lines_over_Q: number; lines_over_Q_sqrt5: number; each_line_meets: number; intersection_matrix_rank: number; signature: [number, number]; tritangent_planes: number; H_squared: number; double_six: [number[], number[]] | null } };
  lines: Line[]; intersection_matrix: number[][];
  provenance: { tools: Record<string, string>; method: string; computed_at: string; wall_seconds: number; script: string };
};
type Cam = { yaw: number; pitch: number; dist: number };

function basis(c: Cam) {
  const eye: [number, number, number] = [c.dist * Math.cos(c.pitch) * Math.sin(c.yaw), c.dist * Math.sin(c.pitch), c.dist * Math.cos(c.pitch) * Math.cos(c.yaw)];
  const n = Math.hypot(...eye);
  const fw = eye.map((v) => -v / n) as [number, number, number];
  const upW = [0, 1, 0];
  let rt = [fw[1] * upW[2] - fw[2] * upW[1], fw[2] * upW[0] - fw[0] * upW[2], fw[0] * upW[1] - fw[1] * upW[0]];
  const rn = Math.hypot(...rt) || 1; rt = rt.map((v) => v / rn);
  const up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
  return { eye, fw, rt: rt as [number, number, number], up: up as [number, number, number] };
}

export default function HodgeWorkspace({ status }: { status: EngineStatus }) {
  const url = useUrlState();
  const { data } = useJson<Clebsch>("/data/hodge/clebsch.json");
  const chart = (url.get("chart") as "tetra" | "generic") ?? "generic";
  const sel = url.get("line") !== null ? Number(url.get("line")) : null;
  const [cam, setCam] = usePersisted<Cam>("hodge:cam", { yaw: 0.72, pitch: 0.42, dist: 5.6 });
  const [glState, setGlState] = useState<"ok" | "unavailable" | "lost">("ok");
  const [showSurface, setShowSurface] = useState(true);
  const [selEvent, setSelEvent] = useState<number | null>(null);
  const ev = useEventsFor("hodge", status);
  const M = useMemo(() => chartMatrix(chart), [chart]);
  const cl = useMemo<ChartLine[]>(() => (data ? chartLines(M, data.lines) : []), [data, M]);
  const atInf = cl.filter((l) => l.atInfinity).length;
  const R = 2.35;

  const stage = (
    <>
      <div className="stage-head">
        <div>
          <h1 className="stage-title">Lines on the Clebsch cubic</h1>
          <div className="stage-eq"><Tex tex={String.raw`\textstyle\sum_{i=0}^{4}x_i=0,\qquad \sum_{i=0}^{4}x_i^{3}=0\quad\subset\ \mathbb P^4`} /></div>
          <div className="stage-facts">
            <span>smooth complex cubic surface</span>
            <span>27 lines: 15 over ℚ, 12 over ℚ(√5)</span>
            <span>real points shown in an affine chart</span>
          </div>
        </div>
        <div className="stage-head-tools">
          <div className="seg" role="radiogroup" aria-label="Affine chart">
            <button role="radio" aria-checked={chart === "generic"} onClick={() => url.set({ chart: null })}>All 27 lines visible</button>
            <button role="radio" aria-checked={chart === "tetra"} onClick={() => url.set({ chart: "tetra" })}>Tetrahedral chart</button>
          </div>
          <div className="seg" role="radiogroup" aria-label="Surface">
            <button role="radio" aria-checked={showSurface} onClick={() => setShowSurface(true)}>Surface and lines</button>
            <button role="radio" aria-checked={!showSurface} onClick={() => setShowSurface(false)}>Lines only</button>
          </div>
        </div>
      </div>
      {data && glState === "ok" && <SurfaceCanvas M={M} lines={cl} data={data} sel={sel} cam={cam} setCam={setCam} R={R} showSurface={showSurface}
        onPick={(id) => url.set({ line: id === null || id === sel ? null : String(id) })} onFail={setGlState} />}
      {data && glState !== "ok" && <LinesFallback lines={cl} data={data} sel={sel} cam={cam} R={R} reason={glState} onPick={(id) => url.set({ line: id === sel ? null : String(id) })} />}
      <div className="stage-caption">
        <span className="badge-ill" title="A real affine slice of a complex surface"><StatusGlyph status="illustrative" />Real slice of a complex surface</span>
        <span>{chart === "tetra" ? `Chart x₄ = −1: ${27 - atInf} lines visible, ${atInf} lie in the plane at infinity.` : "Projective chart chosen so no line lies at infinity."} Drag to rotate, scroll to zoom, click a line.</span>
      </div>
    </>
  );

  return (
    <WorkspaceFrame problem="hodge" stage={stage}
      inspector={data ? <HodgeInspector data={data} sel={sel} onSel={(id) => url.set({ line: id === null ? null : String(id) })} atInf={cl.filter((l) => l.atInfinity).map((l) => l.id)} /> : <div className="insp" />}
      dock={<TimelineDock events={ev.events} mode={ev.mode} loading={ev.loading} error={ev.error} selected={selEvent} onSelect={(e) => setSelEvent(e?.seq ?? null)} lastUpdate={ev.lastUpdate} />} />
  );
}

function SurfaceCanvas({ M, lines, data, sel, cam, setCam, R, showSurface, onPick, onFail }: {
  M: number[]; lines: ChartLine[]; data: Clebsch; sel: number | null; cam: Cam; setCam: (c: Cam) => void; R: number; showSurface: boolean; onPick: (id: number | null) => void; onFail: (s: "unavailable" | "lost") => void;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<{ gl: WebGL2RenderingContext; prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> } | null>(null);
  const fov = 0.42;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const gl = c.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
    if (!gl) { onFail("unavailable"); return; }
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader"); return s; };
    try {
      const prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const names = ["M", "eye", "fw", "rt", "up", "aspect", "fov", "R", "tubeR", "nLines", "lp", "lv", "lk", "showSurface"];
      glRef.current = { gl, prog, u: Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)])) };
    } catch { onFail("unavailable"); return; }
    const lost = (e: Event) => { e.preventDefault(); onFail("lost"); };
    c.addEventListener("webglcontextlost", lost);
    return () => c.removeEventListener("webglcontextlost", lost);
  }, [onFail]);

  const draw = useCallback(() => {
    const g = glRef.current, c = canvas.current;
    if (!g || !c || size.w === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(size.w * dpr), h = Math.round(size.h * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const { gl, prog, u } = g;
    gl.viewport(0, 0, w, h); gl.useProgram(prog);
    const b = basis(cam);
    gl.uniformMatrix4fv(u.M, false, new Float32Array(M));
    gl.uniform3fv(u.eye, b.eye); gl.uniform3fv(u.fw, b.fw); gl.uniform3fv(u.rt, b.rt); gl.uniform3fv(u.up, b.up);
    gl.uniform1f(u.aspect, w / h); gl.uniform1f(u.fov, fov); gl.uniform1f(u.R, R); gl.uniform1f(u.tubeR, 0.018);
    gl.uniform1i(u.nLines, lines.length);
    const meets = sel !== null ? new Set(data.lines[sel].meets) : null;
    gl.uniform3fv(u.lp, new Float32Array(lines.flatMap((l) => l.p)));
    gl.uniform3fv(u.lv, new Float32Array(lines.flatMap((l) => l.v)));
    gl.uniform1fv(u.lk, new Float32Array(lines.map((l) => (l.atInfinity ? -1 : l.id === sel ? 2 : meets?.has(l.id) ? 3 : data.lines[l.id].kind === "golden" ? 1 : 0))));
    gl.uniform1f(u.showSurface, showSurface ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }, [cam, M, lines, sel, data, size, R, showSurface]);
  useEffect(() => { const id = requestAnimationFrame(draw); return () => cancelAnimationFrame(id); }, [draw]);

  const drag = useRef<{ x: number; y: number; c: Cam; moved: boolean } | null>(null);
  const pick = (cx: number, cy: number) => {
    const b = basis(cam);
    const u = (2 * cx) / size.w - 1, v = 1 - (2 * cy) / size.h;
    const aspect = size.w / size.h;
    const d = [0, 1, 2].map((i) => b.fw[i] + u * aspect * fov * b.rt[i] + v * fov * b.up[i]);
    const dn = Math.hypot(...d); const dd = d.map((x) => x / dn);
    let best: number | null = null, bestS = Infinity;
    for (const l of lines) {
      if (l.atInfinity) continue;
      const w0 = [0, 1, 2].map((i) => b.eye[i] - l.p[i]);
      const bb = dd[0] * l.v[0] + dd[1] * l.v[1] + dd[2] * l.v[2];
      const den = 1 - bb * bb; if (den < 1e-6) continue;
      const D = dd[0] * w0[0] + dd[1] * w0[1] + dd[2] * w0[2], E = l.v[0] * w0[0] + l.v[1] * w0[1] + l.v[2] * w0[2];
      const sc = (bb * E - D) / den, tc = (E - bb * D) / den;
      const pr = [0, 1, 2].map((i) => b.eye[i] + sc * dd[i]), pl = [0, 1, 2].map((i) => l.p[i] + tc * l.v[i]);
      const dist = Math.hypot(pr[0] - pl[0], pr[1] - pl[1], pr[2] - pl[2]);
      if (dist < 0.07 && Math.hypot(...pl) < R && sc < bestS) { bestS = sc; best = l.id; }
    }
    onPick(best);
  };

  return (
    <div ref={ref} className="instrument" style={{ top: "var(--inset)", bottom: 58 }}>
      <canvas ref={canvas} style={{ width: "100%", height: "100%", cursor: "grab", touchAction: "none" }} tabIndex={0}
        role="img" aria-label="Ray-traced real points of the Clebsch cubic surface with its lines; drag to rotate, arrow keys rotate, plus and minus zoom"
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, c: cam, moved: false }; (e.target as Element).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true; setCam({ ...d.c, yaw: d.c.yaw - dx * 0.008, pitch: Math.max(-1.45, Math.min(1.45, d.c.pitch + dy * 0.008)) }); }}
        onPointerUp={(e) => { const d = drag.current; drag.current = null; if (d && !d.moved) { const r = (e.target as Element).getBoundingClientRect(); pick(e.clientX - r.left, e.clientY - r.top); } }}
        onWheel={(e) => setCam({ ...cam, dist: Math.max(2.6, Math.min(12, cam.dist * (e.deltaY > 0 ? 1.08 : 1 / 1.08))) })}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setCam({ ...cam, yaw: cam.yaw + 0.08 }); else if (e.key === "ArrowRight") setCam({ ...cam, yaw: cam.yaw - 0.08 });
          else if (e.key === "ArrowUp") setCam({ ...cam, pitch: Math.min(1.45, cam.pitch + 0.08) }); else if (e.key === "ArrowDown") setCam({ ...cam, pitch: Math.max(-1.45, cam.pitch - 0.08) });
          else if (e.key === "+" || e.key === "=") setCam({ ...cam, dist: Math.max(2.6, cam.dist / 1.1) }); else if (e.key === "-") setCam({ ...cam, dist: Math.min(12, cam.dist * 1.1) });
          else return; e.preventDefault();
        }} />
    </div>
  );
}

function LinesFallback({ lines, data, sel, cam, R, reason, onPick }: { lines: ChartLine[]; data: Clebsch; sel: number | null; cam: Cam; R: number; reason: string; onPick: (id: number) => void }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const b = basis(cam);
  const S = Math.min(size.w, size.h) / (2 * R) * 0.9;
  const proj = (p: number[]) => [size.w / 2 + S * (p[0] * b.rt[0] + p[1] * b.rt[1] + p[2] * b.rt[2]), size.h / 2 - S * (p[0] * b.up[0] + p[1] * b.up[1] + p[2] * b.up[2])];
  return (
    <div ref={ref} className="instrument" style={{ top: "var(--inset)", bottom: 58 }}>
      <svg className="scene" width={size.w} height={size.h} role="img" aria-label="Orthographic projection of the lines (WebGL unavailable)">
        {lines.filter((l) => !l.atInfinity).map((l) => {
          const a = proj(l.p.map((v, i) => v - R * l.v[i])), c = proj(l.p.map((v, i) => v + R * l.v[i]));
          return <line key={l.id} x1={a[0]} y1={a[1]} x2={c[0]} y2={c[1]} stroke={l.id === sel ? "var(--amber)" : data.lines[l.id].kind === "golden" ? "#c99aa6" : "#e9e4da"} strokeWidth={l.id === sel ? 2.5 : 1.2} onClick={() => onPick(l.id)} style={{ cursor: "pointer" }} />;
        })}
      </svg>
      <div className="legend-box" style={{ left: 24, top: 12 }}>WebGL {reason === "lost" ? "context was lost" : "is unavailable"}: showing the line arrangement as an SVG projection. The surface itself needs WebGL2.</div>
    </div>
  );
}

function HodgeInspector({ data, sel, onSel, atInf }: { data: Clebsch; sel: number | null; onSel: (id: number | null) => void; atInf: number[] }) {
  const f = data.surface.facts_exact;
  const L = sel !== null ? data.lines[sel] : null;
  const order = [...data.lines.filter((l) => l.kind === "rational"), ...data.lines.filter((l) => l.kind === "golden")].map((l) => l.id);
  const cell = 9;
  return (
    <div className="insp">
      <section className="insp-section">
        <h2 className="insp-h">Selected</h2>
        {L ? (
          <>
            <p className="insp-title">Line L{sub(L.id + 1)} <span className="muted" style={{ fontSize: 14 }}>defined over {L.field === "Q" ? "ℚ" : "ℚ(√5)"}</span></p>
            {L.name && <p className="mono" style={{ fontSize: 13 }}>{L.name}</p>}
            <p style={{ marginTop: 6 }}>Spanned by the points</p>
            <div style={{ fontSize: 15, margin: "4px 0" }}><Tex tex={`P=(${L.P_tex.join(":")})`} /></div>
            <div style={{ fontSize: 15, margin: "4px 0 8px" }}><Tex tex={`Q=(${L.Q_tex.join(":")})`} /></div>
            <p className="note">Coordinates (y₀:y₁:y₂:y₃) with x₄ = −(y₀+y₁+y₂+y₃). The cubic vanishes identically on sP + tQ (checked symbolically).{atInf.includes(L.id) ? " In the tetrahedral chart this line lies at infinity." : ""}</p>
            <dl className="kv" style={{ marginTop: 8 }}>
              <dt>Self-intersection</dt><dd className="mono">L·L = −1</dd>
              <dt>Meets</dt><dd className="mono">{L.meets.length} lines: {L.meets.map((m) => `L${m + 1}`).join(", ")}</dd>
            </dl>
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => onSel(null)}>Clear selection</button>
          </>
        ) : (
          <>
            <p className="insp-title">{data.surface.name}</p>
            <p>Each line is an algebraic curve on the surface, a cycle of complex codimension 1. Select one to see its exact equations and the lines it meets.</p>
          </>
        )}
        <div style={{ marginTop: 8 }}><ExactnessTag kind="exact" /></div>
      </section>
      <section className="insp-section">
        <h2 className="insp-h">Intersection form on the 27 line classes</h2>
        <svg width={27 * cell + 2} height={27 * cell + 2} role="img" aria-label={`27 by 27 intersection matrix; rank ${f.intersection_matrix_rank}, signature (${f.signature.join(", ")})`} style={{ display: "block" }}>
          {order.map((a, i) => order.map((b, j) => {
            const v = data.intersection_matrix[a][b];
            const hot = sel !== null && (a === sel || b === sel);
            return <rect key={`${i}-${j}`} x={1 + j * cell} y={1 + i * cell} width={cell - 1} height={cell - 1}
              fill={v === 1 ? (hot ? "var(--amber)" : "#cfc9bd") : v === -1 ? "#c99aa6" : hot ? "#222b38" : "#141a24"}
              onClick={() => onSel(a)} style={{ cursor: "pointer" }}><title>{`L${a + 1} · L${b + 1} = ${v}`}</title></rect>;
          }))}
        </svg>
        <p className="note" style={{ marginTop: 6 }}>Rows: 15 rational lines, then 12 over ℚ(√5). Pale cell: lines meet (1); rose diagonal: L·L = −1; dark: skew (0).</p>
        <dl className="kv" style={{ marginTop: 8 }}>
          <dt>Rank</dt><dd className="mono">{f.intersection_matrix_rank} (exact) = b₂ of a cubic surface</dd>
          <dt>Signature</dt><dd className="mono">({f.signature.join(", ")})</dd>
          <dt>Tritangent planes</dt><dd className="mono">{f.tritangent_planes}</dd>
          <dt>Hyperplane class</dt><dd className="mono">H² = {f.H_squared}</dd>
        </dl>
      </section>
      <section className="insp-section">
        <h2 className="insp-h">From cycles to the conjecture</h2>
        <ol className="list" style={{ counterReset: "none" }}>
          <li><StatusGlyph status="exact" /><span>27 lines are algebraic cycles; their classes span a rank-7 lattice in H²(X,ℤ).</span></li>
          <li><StatusGlyph status="literature-theorem" /><span>For a cubic surface h^{"{2,0}"} = 0, so H²(X,ℚ) is all of type (1,1); rank 7 means the lines span every rational (1,1) class here.</span></li>
          <li><StatusGlyph status="literature-theorem" /><span>Lefschetz (1,1) proves this in general for p = 1: the example illustrates a theorem.</span></li>
          <li><StatusGlyph status="open" /><span>The conjecture concerns all p on all smooth projective X. The first open cases live in dimension ≥ 4 and codimension ≥ 2, beyond what a surface can show.</span></li>
        </ol>
      </section>
      <section className="insp-section">
        <h2 className="insp-h">Provenance</h2>
        <p className="note">{data.provenance.method}</p>
        <code className="repro">python3 -I {data.provenance.script} web/public/data/hodge</code>
        <p className="note">Computed {data.provenance.computed_at}.</p>
      </section>
      <ProblemStatusBlock problem="hodge" compact />
    </div>
  );
}
const sub = (n: number) => String(n).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[+d]).join("");
