"use client";
import { useMemo, useRef, useState } from "react";
import { Curve, sampleRealLocus, type ChordStep, type Point } from "@/lib/math/elliptic";
import type { Q } from "@/lib/math/rational";
import { niceTicks, fmtTick } from "@/lib/scales";
import { useSize } from "@/lib/hooks";
import { useStageInset } from "@/components/shell/Workspace";

export type View = { cx: number; cy: number; sx: number; sy: number };
export type ScenePoint = { id: string; x: Q; y: Q; kind: "torsion" | "generator" | "combo" | "search"; label?: string };

export function CurveScene({
  ainvs, view, onView, points, selectedA, selectedB, hovered, onHover, onPick, step, stepIndex, resultLabel, inset: insetProp,
}: {
  inset?: number;
  ainvs: [number, number, number, number, number];
  view: View; onView: (v: View) => void;
  points: ScenePoint[];
  selectedA: string | null; selectedB: string | null; hovered: string | null;
  onHover: (id: string | null) => void; onPick: (id: string) => void;
  step: ChordStep | null; stepIndex: number; resultLabel?: string;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const ctxInset = useStageInset();
  const inset = insetProp ?? ctxInset;
  const W = Math.max(320, size.w), H = Math.max(320, size.h);
  const E = useMemo(() => new Curve(ainvs), [ainvs]);
  // the plot area sits below the stage header band; the grid still runs underneath it
  const top = Math.min(inset, H * 0.55);
  const PH = H - top;
  const midY = top + PH / 2;
  const kx = W / 2 / view.sx, ky = PH / 2 / view.sy;
  const X = (x: number) => W / 2 + (x - view.cx) * kx;
  const Y = (y: number) => midY - (y - view.cy) * ky;
  const xmin = view.cx - view.sx, xmax = view.cx + view.sx, ymin = view.cy - view.sy, ymax = view.cy + view.sy + top / ky;

  const locus = useMemo(() => sampleRealLocus(E, xmax + view.sx * 0.2, 1400), [E, xmax, view.sx]);
  const toPath = (pts: number[][]) => {
    let d = "";
    let pen = false;
    for (const [x, y] of pts) {
      const px = X(x), py = Y(y);
      if (!Number.isFinite(py) || Math.abs(py) > 1e6) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${px.toFixed(2)},${py.toFixed(2)}`;
      pen = true;
    }
    return d;
  };
  const branchD = toPath(locus.branch);
  const ovalD = locus.compact ? toPath(locus.compact) + "Z" : "";

  const xt = niceTicks(xmin, xmax, Math.max(4, Math.round(W / 140)));
  const yt = niceTicks(ymin, ymax, Math.max(4, Math.round(H / 110)));

  // interaction: pan / zoom
  const drag = useRef<{ x: number; y: number; v: View; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomAt = (px: number, py: number, f: number) => {
    const x = view.cx + (px - W / 2) / kx, y = view.cy - (py - midY) / ky;
    const sx = Math.min(4000, Math.max(0.05, view.sx * f)), sy = Math.min(20000, Math.max(0.05, view.sy * f));
    onView({ sx, sy, cx: x - (px - W / 2) / (W / 2 / sx), cy: y + (py - midY) / (PH / 2 / sy) });
  };

  const visible = points.filter((p) => {
    const x = p.x.toNumber(), y = p.y.toNumber();
    return x >= xmin && x <= xmax && y >= ymin && y <= ymax;
  });
  const hiddenCount = points.length - visible.length;

  const lineEnds = (lam: Q, nu: Q) => {
    const l = lam.toNumber(), n = nu.toNumber();
    return [[xmin - view.sx, l * (xmin - view.sx) + n], [xmax + view.sx, l * (xmax + view.sx) + n]];
  };
  const P = (p: Point) => (p.kind === "aff" ? { x: X(p.x.toNumber()), y: Y(p.y.toNumber()) } : null);

  const labelFor = (p: ScenePoint) => `${p.label ? `${p.label} = ` : ""}(${p.x.toString()}, ${p.y.toString()})`;

  return (
    <div ref={ref} className="instrument" style={{ cursor: drag.current ? "grabbing" : "grab" }}>
      <svg
        ref={svgRef} className="scene" width={W} height={H} tabIndex={0}
        role="application" aria-roledescription="elliptic curve plot"
        aria-label={`Real points of the curve with ${points.length} rational points from the search; ${visible.length} in view. Arrow keys pan, plus and minus zoom, 0 resets.`}
        onWheel={(e) => { const r = e.currentTarget.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY > 0 ? 1.12 : 1 / 1.12); }}
        onPointerDown={(e) => { if ((e.target as Element).closest("[data-pt]")) return; drag.current = { x: e.clientX, y: e.clientY, v: view, moved: false }; (e.currentTarget as Element).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d) return;
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
          onView({ ...d.v, cx: d.v.cx - dx / kx, cy: d.v.cy + dy / ky });
        }}
        onPointerUp={() => { drag.current = null; }}
        onDoubleClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, 0.6); }}
        onKeyDown={(e) => {
          const step = 0.12;
          if (e.key === "ArrowLeft") onView({ ...view, cx: view.cx - view.sx * step });
          else if (e.key === "ArrowRight") onView({ ...view, cx: view.cx + view.sx * step });
          else if (e.key === "ArrowUp") onView({ ...view, cy: view.cy + view.sy * step });
          else if (e.key === "ArrowDown") onView({ ...view, cy: view.cy - view.sy * step });
          else if (e.key === "+" || e.key === "=") zoomAt(W / 2, midY, 1 / 1.25);
          else if (e.key === "-") zoomAt(W / 2, midY, 1.25);
          else return;
          e.preventDefault();
        }}
      >
        <defs>
          <radialGradient id="recede" cx="50%" cy={`${(midY / H) * 100}%`} r="62%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="70%" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.08" />
          </radialGradient>
          <mask id="recede-mask"><rect width={W} height={H} fill="url(#recede)" /></mask>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <filter id="glow-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          {/* fade the drawing out under the header band so it never runs through the title */}
          <linearGradient id="head-fade" gradientUnits="userSpaceOnUse" x1="0" y1={Math.max(0, top - 70)} x2="0" y2={top - 8}>
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#fff" stopOpacity="1" />
          </linearGradient>
          <mask id="head-mask"><rect width={W} height={H} fill="url(#head-fade)" /></mask>
        </defs>
        <g mask="url(#head-mask)">

        {/* receding coordinate grid */}
        <g mask="url(#recede-mask)">
          {xt.map((t) => <line key={`gx${t}`} x1={X(t)} x2={X(t)} y1={0} y2={H} stroke={t === 0 ? "#3a4961" : "#18202c"} strokeWidth={t === 0 ? 1.2 : 1} />)}
          {yt.map((t) => <line key={`gy${t}`} x1={0} x2={W} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? "#3a4961" : "#18202c"} strokeWidth={t === 0 ? 1.2 : 1} />)}
        </g>
        <g fontFamily="var(--font-mono)" fontSize="11" fill="#6f7c90">
          {xt.filter((t) => t !== 0).map((t) => <text key={`tx${t}`} x={X(t) + 4} y={Math.min(H - 8, Math.max(14, Y(0) + 14))}>{fmtTick(t)}</text>)}
          {yt.filter((t) => t !== 0 && Y(t) > top + 22).map((t) => <text key={`ty${t}`} x={Math.min(W - 40, Math.max(6, X(0) + 6))} y={Y(t) - 4}>{fmtTick(t)}</text>)}
          <text x={W - 18} y={Math.min(H - 8, Math.max(14, Y(0) - 8))} fill="#8794a8" fontStyle="italic" fontFamily="var(--font-display)" fontSize="15">x</text>
          <text x={Math.min(W - 20, Math.max(8, X(0) + 8))} y={top + 4} fill="#8794a8" fontStyle="italic" fontFamily="var(--font-display)" fontSize="15">y</text>
        </g>

        {/* the real locus E(R) */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={branchD} stroke="var(--accent)" strokeWidth={7} opacity={0.22} filter="url(#glow)" />
          {ovalD && <path d={ovalD} stroke="var(--accent)" strokeWidth={7} opacity={0.22} filter="url(#glow)" />}
          <path d={branchD} stroke="#b9cbff" strokeWidth={2.6} opacity={0.35} filter="url(#glow-soft)" />
          {ovalD && <path d={ovalD} stroke="#b9cbff" strokeWidth={2.6} opacity={0.35} filter="url(#glow-soft)" />}
          <path d={branchD} stroke="var(--accent)" strokeWidth={1.7} />
          {ovalD && <path d={ovalD} stroke="var(--accent)" strokeWidth={1.7} />}
        </g>

        {/* construction */}
        {step && step.kind !== "identity" && (
          <g pointerEvents="none">
            {step.kind === "vertical" ? (
              <line x1={X(step.x.toNumber())} x2={X(step.x.toNumber())} y1={H} y2={0} stroke="var(--text)" strokeWidth={1.2} strokeDasharray="5 5" pathLength={1} className="draw" />
            ) : (
              (() => {
                const [[x0, y0], [x1, y1]] = lineEnds(step.lambda, step.nu);
                return <line x1={X(x0)} y1={Y(y0)} x2={X(x1)} y2={Y(y1)} stroke="var(--text)" strokeWidth={1.2} opacity={stepIndex >= 1 ? 0.9 : 0} style={{ transition: "opacity 220ms var(--ease)" }} />;
              })()
            )}
            {step.kind !== "vertical" && stepIndex >= 2 && P(step.third) && (
              <g>
                <circle cx={P(step.third)!.x} cy={P(step.third)!.y} r={7} fill="none" stroke="var(--text)" strokeWidth={1.4} />
                <text x={P(step.third)!.x + 12} y={P(step.third)!.y - 10} fill="var(--text)" fontSize="13" fontFamily="var(--font-display)" fontStyle="italic">−({resultLabel ?? "P+Q"})</text>
              </g>
            )}
            {step.kind !== "vertical" && stepIndex >= 3 && P(step.third) && P(step.sum) && (
              <g>
                <line x1={P(step.third)!.x} y1={P(step.third)!.y} x2={P(step.sum)!.x} y2={P(step.sum)!.y} stroke="var(--accent-2)" strokeDasharray="3 4" strokeWidth={1.3} />
                <circle cx={P(step.sum)!.x} cy={P(step.sum)!.y} r={8.5} fill="none" stroke="var(--accent-2)" strokeWidth={1.6} />
                <circle cx={P(step.sum)!.x} cy={P(step.sum)!.y} r={3.6} fill="var(--accent-2)" />
                <text x={P(step.sum)!.x + 13} y={P(step.sum)!.y + 18} fill="var(--accent-2)" fontSize="14" fontFamily="var(--font-display)" fontStyle="italic">{resultLabel ?? "P + Q"}</text>
              </g>
            )}
          </g>
        )}

        {/* rational points (exact) */}
        <g>
          {visible.map((p) => {
            const cx = X(p.x.toNumber()), cy = Y(p.y.toNumber());
            const isSel = p.id === selectedA || p.id === selectedB;
            const isHover = p.id === hovered;
            const r = p.kind === "generator" ? 5.4 : 4.2;
            const fill = p.kind === "generator" ? "var(--accent-2)" : p.kind === "torsion" ? "var(--text)" : "var(--accent-2)";
            return (
              <g key={p.id} data-pt="1" role="button" tabIndex={0}
                aria-label={`Rational point ${labelFor(p)}${p.kind === "torsion" ? ", torsion" : p.kind === "generator" ? ", generator" : ""}`}
                aria-pressed={isSel}
                onPointerEnter={() => onHover(p.id)} onPointerLeave={() => onHover(null)} onFocus={() => onHover(p.id)} onBlur={() => onHover(null)}
                onClick={() => onPick(p.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(p.id); } }}
                style={{ cursor: "pointer" }}>
                <circle cx={cx} cy={cy} r={14} fill="transparent" />
                {isSel && <circle cx={cx} cy={cy} r={11} fill="none" stroke="var(--accent-2)" strokeOpacity={0.55} strokeWidth={6} filter="url(#glow-soft)" />}
                {p.kind === "torsion"
                  ? <path d={`M${cx},${cy - 6}L${cx + 6},${cy}L${cx},${cy + 6}L${cx - 6},${cy}Z`} fill={fill} stroke="var(--bg)" strokeWidth={1.5} />
                  : <circle cx={cx} cy={cy} r={r} fill={p.kind === "search" ? "none" : fill} stroke={p.kind === "search" ? "var(--accent-2)" : "var(--bg)"} strokeWidth={p.kind === "search" ? 1.6 : 1.5} />}
                {(isSel || isHover || p.kind === "generator") && (
                  <text x={cx + 11} y={cy - 10} fontSize="12.5" fontFamily="var(--font-mono)" fill={isSel ? "var(--text)" : "var(--text-2)"} paintOrder="stroke" stroke="var(--bg)" strokeWidth={4}>
                    {labelFor(p)}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        </g>
        {/* identity at infinity */}
        <g transform={`translate(${W - 26}, ${top + 18})`} aria-hidden>
          <circle r={9} fill="none" stroke={step?.kind === "vertical" ? "var(--accent-2)" : "#3a4961"} strokeWidth={1.3} />
          <text x={-15} y={4} textAnchor="end" fontSize="12" fill="var(--muted)" fontFamily="var(--font-sans)">O at infinity (identity)</text>
          <text y={4.5} textAnchor="middle" fontSize="11" fill="var(--text-2)" fontFamily="var(--font-display)" fontStyle="italic">O</text>
        </g>
      </svg>
      <div className="stage-caption curve-caption">
        <span>{visible.length} of {points.length} listed rational points in view{hiddenCount ? `; ${hiddenCount} outside` : ""}</span>
      </div>
    </div>
  );
}
