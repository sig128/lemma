"use client";
import { useMemo, useState } from "react";
import { linear, log10, fmtTick, type Scale } from "@/lib/scales";
import { useSize } from "@/lib/hooks";
import { ordinal } from "@/lib/format";

export type Series = {
  id: string;
  label: string;
  color: string;
  kind: "line" | "dots" | "errorbars" | "step";
  points: { x: number; y: number; yerr?: number; shape?: "circle" | "diamond" | "square"; meta?: string }[];
  dash?: string;
  width?: number;
};
export type Annotation =
  | { type: "vline"; x: number; label?: string; color?: string; dash?: string }
  | { type: "hline"; y: number; label?: string; color?: string; dash?: string }
  | { type: "hband"; y0: number; y1: number; label?: string; color?: string };

export interface ChartProps {
  series: Series[];
  height?: number;
  x: { label: string; domain?: [number, number]; scale?: "linear" | "log"; format?: (v: number) => string; ticks?: number[] };
  y: { label: string; domain?: [number, number]; scale?: "linear" | "log"; format?: (v: number) => string; ticks?: number[] };
  annotations?: Annotation[];
  title?: string;
  tableCaption?: string;
  tooltipX?: (x: number) => string;
  tooltipY?: (y: number) => string;
  hideTable?: boolean;
  onSelect?: (s: Series, p: Series["points"][number]) => void;
  selected?: { series: string; index: number } | null;
}

const M = { l: 56, r: 18, t: 12, b: 40 };

export function Chart(props: ChartProps) {
  const { series, height = 240, x, y, annotations = [] } = props;
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ px: number; py: number; lines: string[] } | null>(null);
  const W = Math.max(260, size.w);
  const H = height;

  const { sx, sy, ml } = useMemo(() => {
    const xs = series.flatMap((s) => s.points.map((p) => p.x)).filter(Number.isFinite);
    const ys = series.flatMap((s) => s.points.flatMap((p) => [p.y - (p.yerr ?? 0), p.y + (p.yerr ?? 0)])).filter((v) => Number.isFinite(v) && (y.scale !== "log" || v > 0));
    const xd: [number, number] = x.domain ?? [Math.min(...xs), Math.max(...xs)];
    let yd: [number, number] = y.domain ?? [Math.min(...ys), Math.max(...ys)];
    if (!y.domain && y.scale !== "log") { const pad = (yd[1] - yd[0]) * 0.06 || 1; yd = [yd[0] - pad, yd[1] + pad]; }
    const mk = (kind: "linear" | "log" | undefined) => (kind === "log" ? log10 : linear);
    const syv = mk(y.scale)(yd, [H - M.b, M.t]) as Scale;
    // left margin from the widest y tick label (mono 11px is about 6.7px per character) plus the axis title
    const yTicks = y.ticks ?? syv.ticks(Math.max(3, Math.floor(H / 48)));
    const widest = Math.max(1, ...yTicks.map((t) => (y.format ?? fmtTick)(t).length));
    const ml = Math.max(M.l, Math.round(widest * 6.8 + 34));
    return { sx: mk(x.scale)(xd, [ml, W - M.r]) as Scale, sy: syv, ml };
  }, [series, x.domain, y.domain, x.scale, y.scale, y.ticks, y.format, W, H]);

  const xt = x.ticks ?? sx.ticks(Math.max(3, Math.floor(W / 110)));
  const yt = y.ticks ?? sy.ticks(Math.max(3, Math.floor(H / 48)));
  const fx = x.format ?? fmtTick, fy = y.format ?? fmtTick;
  const tipX = props.tooltipX ?? fx, tipY = props.tooltipY ?? ((v: number) => fmtTick(v));

  const lineSeries = series.filter((s) => s.kind === "line" || s.kind === "step");
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!lineSeries.length) return;
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const xv = sx.invert(px);
    const lines: string[] = [`${x.label}: ${tipX(xv)}`];
    let py = 0;
    for (const s of lineSeries) {
      const pts = s.points;
      if (!pts.length) continue;
      let lo = 0, hi = pts.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].x < xv) lo = mid; else hi = mid; }
      const p = Math.abs(pts[lo].x - xv) < Math.abs(pts[hi].x - xv) ? pts[lo] : pts[hi];
      lines.push(`${s.label}: ${tipY(p.y)}`);
      py = sy(p.y);
    }
    setHover({ px, py, lines });
  };

  const path = (s: Series) => {
    let d = "";
    let pen = false;
    let prevY = 0;
    for (const p of s.points) {
      const ok = Number.isFinite(p.y) && (y.scale !== "log" || p.y > 0);
      if (!ok) { pen = false; continue; }
      const X = sx(p.x), Y = sy(p.y);
      if (s.kind === "step" && pen) d += `H${X.toFixed(1)}V${Y.toFixed(1)}`;
      else d += `${pen ? "L" : "M"}${X.toFixed(1)},${Y.toFixed(1)}`;
      pen = true; prevY = Y;
    }
    void prevY;
    return d;
  };

  const legend = series.length >= 2;
  return (
    <div className="chart-wrap" ref={ref}>
      {props.title && <div className="insp-h" style={{ marginBottom: 4 }}>{props.title}</div>}
      {legend && (
        <div className="chart-legend" aria-hidden>
          {series.map((s) => (
            <span key={s.id}>
              {s.kind === "line" || s.kind === "step" ? <i className="swatch" style={{ background: s.color }} /> : <i className="swatch-dot" style={{ background: s.color }} />}
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg className="chart" width={W} height={H} role="img" aria-label={`${props.title ?? "Chart"}: ${y.label} against ${x.label}`}>
        <g className="grid">
          {yt.map((t) => <line key={`gy${t}`} x1={ml} x2={W - M.r} y1={sy(t)} y2={sy(t)} />)}
        </g>
        {annotations.map((a, i) => {
          if (a.type === "hband") {
            const y0 = sy(a.y0), y1 = sy(a.y1);
            return (
              <g key={i}>
                <rect x={ml} width={W - ml - M.r} y={Math.min(y0, y1)} height={Math.abs(y1 - y0)} fill={a.color ?? "var(--amber)"} opacity={0.08} />
                {a.label && <text x={ml + 8} y={Math.max(y0, y1) - 7} textAnchor="start" fontSize={11.5} fill="var(--text-2)">{a.label}</text>}
              </g>
            );
          }
          if (a.type === "vline") {
            const X = sx(a.x);
            return (
              <g key={i}>
                <line x1={X} x2={X} y1={M.t} y2={H - M.b} stroke={a.color ?? "var(--text-2)"} strokeDasharray={a.dash ?? "3 4"} opacity={0.7} />
                {a.label && <text x={X + 6} y={M.t + 12} fontSize={11.5} fill="var(--text-2)">{a.label}</text>}
              </g>
            );
          }
          const Y = sy(a.y);
          return (
            <g key={i}>
              <line x1={ml} x2={W - M.r} y1={Y} y2={Y} stroke={a.color ?? "var(--text-2)"} strokeDasharray={a.dash ?? "3 4"} opacity={0.7} />
              {a.label && <text x={ml + 6} y={Y - 6} fontSize={11.5} fill="var(--text-2)">{a.label}</text>}
            </g>
          );
        })}
        <g className="axis">
          <line x1={ml} x2={W - M.r} y1={H - M.b} y2={H - M.b} />
          <line x1={ml} x2={ml} y1={M.t} y2={H - M.b} />
        </g>
        <g className="tick">
          {xt.map((t) => <text key={`x${t}`} x={sx(t)} y={H - M.b + 16} textAnchor="middle">{fx(t)}</text>)}
          {yt.map((t) => <text key={`y${t}`} x={ml - 8} y={sy(t) + 4} textAnchor="end">{fy(t)}</text>)}
        </g>
        <text className="axis-title" x={(ml + W - M.r) / 2} y={H - 6} textAnchor="middle">{x.label}</text>
        <text className="axis-title" transform={`translate(13 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle">{y.label}</text>
        {series.map((s) => {
          if (s.kind === "line" || s.kind === "step") return <path key={s.id} d={path(s)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} strokeLinejoin="round" />;
          return (
            <g key={s.id}>
              {s.points.map((p, i) => {
                if (!Number.isFinite(p.y) || (y.scale === "log" && p.y <= 0)) return null;
                const X = sx(p.x), Y = sy(p.y);
                const sel = props.selected?.series === s.id && props.selected.index === i;
                const r = sel ? 6 : 4.2;
                const label = `${s.label}: ${x.label} ${tipX(p.x)}, ${y.label} ${tipY(p.y)}${p.yerr ? ` ± ${fmtTick(p.yerr)}` : ""}${p.meta ? `. ${p.meta}` : ""}`;
                const shape = p.shape ?? "circle";
                return (
                  <g key={i}
                    onPointerEnter={() => setHover({ px: X, py: Y, lines: label.split(". ") })}
                    onPointerLeave={() => setHover(null)}
                    onClick={props.onSelect ? () => props.onSelect!(s, p) : undefined}
                    style={{ cursor: props.onSelect ? "pointer" : "default" }}
                    role={props.onSelect ? "button" : undefined} tabIndex={props.onSelect ? 0 : undefined} aria-label={props.onSelect ? label : undefined}
                    onKeyDown={props.onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onSelect!(s, p); } } : undefined}
                  >
                    {s.kind === "errorbars" && p.yerr ? <line x1={X} x2={X} y1={sy(p.y - p.yerr)} y2={sy(p.y + p.yerr)} stroke={s.color} strokeWidth={1.5} /> : null}
                    <circle cx={X} cy={Y} r={12} fill="transparent" />
                    {shape === "circle" && <circle cx={X} cy={Y} r={r} fill={s.color} stroke="var(--raised)" strokeWidth={2} />}
                    {shape === "diamond" && <path d={`M${X},${Y - r - 1}L${X + r + 1},${Y}L${X},${Y + r + 1}L${X - r - 1},${Y}Z`} fill={s.color} stroke="var(--raised)" strokeWidth={2} />}
                    {shape === "square" && <rect x={X - r} y={Y - r} width={2 * r} height={2 * r} fill="none" stroke={s.color} strokeWidth={1.8} />}
                    {sel && <circle cx={X} cy={Y} r={r + 4} fill="none" stroke="var(--text)" strokeWidth={1} />}
                  </g>
                );
              })}
            </g>
          );
        })}
        {lineSeries.length > 0 && (
          <rect x={ml} y={M.t} width={Math.max(0, W - ml - M.r)} height={Math.max(0, H - M.t - M.b)} fill="transparent"
            onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        )}
        {hover && lineSeries.length > 0 && <line x1={hover.px} x2={hover.px} y1={M.t} y2={H - M.b} stroke="var(--text-2)" strokeWidth={1} opacity={0.5} pointerEvents="none" />}
      </svg>
      {hover && (
        <div className="chart-tip" style={{ left: Math.min(hover.px + 12, W - 200), top: Math.max(0, hover.py - 10) + (legend ? 24 : 0) }}>
          {hover.lines.map((l, i) => <div key={i} className={i === 0 ? "" : "mono"}>{l}</div>)}
        </div>
      )}
      {!props.hideTable && <DataTable {...props} />}
    </div>
  );
}

function DataTable({ series, x, y, tableCaption }: ChartProps) {
  const fx = x.format ?? fmtTick;
  const rows = series.flatMap((s) => s.points.map((p) => ({ s: s.label, x: p.x, y: p.y, e: p.yerr, m: p.meta })));
  const many = rows.length > 400;
  const shown = many ? rows.filter((_, i) => i % Math.ceil(rows.length / 400) === 0) : rows;
  return (
    <details className="alt">
      <summary>Data table{many ? ` (every ${ordinal(Math.ceil(rows.length / 400))} of ${rows.length} rows)` : ` (${rows.length} rows)`}</summary>
      <div style={{ maxHeight: 260, overflow: "auto" }}>
        <table className="data">
          {tableCaption && <caption className="note" style={{ textAlign: "left", paddingBottom: 6 }}>{tableCaption}</caption>}
          <thead><tr><th>Series</th><th className="num">{x.label}</th><th className="num">{y.label}</th><th>Note</th></tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}><td>{r.s}</td><td className="num mono">{fx(r.x)}</td><td className="num mono">{Number.isFinite(r.y) ? r.y.toPrecision(8) : String(r.y)}{r.e ? ` ± ${r.e.toPrecision(2)}` : ""}</td><td>{r.m ?? ""}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
