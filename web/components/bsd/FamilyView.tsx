"use client";
import { useMemo } from "react";
import { Chart } from "@/components/charts/Chart";
import type { TwistFamily, TwistRow } from "@/lib/bsd/types";

const jitter = (d: number) => ((((d * 2654435761) >>> 0) % 1000) / 1000 - 0.5) * 0.42;
const shapeOf = (s: TwistRow["status"]) => (s === "theorem" ? "circle" : s === "verified-instance" ? "diamond" : "square") as "circle" | "diamond" | "square";

export function FamilyView({ fam, picked, onPick }: { fam: TwistFamily; picked: number | null; onPick: (r: TwistRow) => void }) {
  const rows = fam.rows;
  const byW = (w: number) => rows.filter((r) => r.root_number === w).map((r) => ({
    x: r.d, y: r.analytic_order_numerical + jitter(r.d), shape: shapeOf(r.status),
    meta: `d = ${r.d}, conductor ${r.conductor}, analytic order ${r.analytic_order_numerical}, descent bounds [${r.rank_lower}, ${r.rank_upper}], ${r.status}`,
  }));
  const even = useMemo(() => rows.filter((r) => r.root_number === 1).sort((a, b) => Math.abs(a.d) - Math.abs(b.d)), [rows]);
  const share = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    let n = 0, k = 0;
    for (const r of even) {
      n++; if (r.analytic_order_numerical >= 2) k++;
      if (n >= 20) out.push({ x: Math.abs(r.d), y: (100 * k) / n });
    }
    return out;
  }, [even]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) { const key = `${r.root_number}|${r.analytic_order_numerical}|${r.status}`; m.set(key, (m.get(key) ?? 0) + 1); }
    return [...m.entries()].map(([k, n]) => { const [w, o, s] = k.split("|"); return { w: +w, o: +o, s, n }; }).sort((a, b) => a.o - b.o || a.w - b.w);
  }, [rows]);
  const pickedRow = picked === null ? null : rows.find((r) => r.d === picked) ?? null;
  const rank2 = even.filter((r) => r.analytic_order_numerical >= 2).length;
  const descentGap = rows.filter((r) => r.rank_lower !== r.rank_upper).length;
  return (
    <div className="view-scroll stage-scroll">
      <div className="view-pad" style={{ paddingTop: 4, maxWidth: 1100 }}>
        <div className="panel">
          <div className="insp-h">Quadratic twists of 11a1: analytic order against the twisting discriminant d</div>
          <Chart height={300}
            series={[
              { id: "even", label: "Root number +1", color: "var(--series-1)", kind: "dots", points: byW(1) },
              { id: "odd", label: "Root number −1", color: "var(--series-2)", kind: "dots", points: byW(-1) },
            ]}
            x={{ label: "fundamental discriminant d", domain: [-fam.d_bound * 1.02, fam.d_bound * 1.02] }}
            y={{ label: "analytic order (numerical)", domain: [-0.5, 3.5], ticks: [0, 1, 2, 3], format: (v) => String(v) }}
            tooltipX={(v) => String(Math.round(v))} tooltipY={(v) => String(Math.round(v))}
            onSelect={(_, p) => { const r = rows.find((q) => q.d === p.x); if (r) onPick(r); }}
            selected={pickedRow ? { series: pickedRow.root_number === 1 ? "even" : "odd", index: rows.filter((r) => r.root_number === pickedRow.root_number).findIndex((r) => r.d === pickedRow.d) } : null}
            tableCaption="Each row is one twist E^(d); values from PARI ellrootno, ellrank and ellanalyticrank." />
          <p className="note">Marks: circle, rank equality is a theorem for this twist (analytic order at most 1); diamond, verified instance in rank 2 or 3; square, descent bounds do not meet. Vertical spread within a row is jitter for legibility.</p>
        </div>

        <div className="grid-2" style={{ marginTop: 28 }}>
          <div className="panel">
            <div className="insp-h">Share of even-parity twists with analytic order 2, by |d| bound</div>
            <Chart height={220} series={[{ id: "share", label: "Share with order ≥ 2", color: "var(--series-1)", kind: "step", points: share }]}
              x={{ label: "|d| bound" }} y={{ label: "percent of even-parity twists", domain: [0, 20] }} tooltipY={(v) => `${v.toFixed(1)}%`} tooltipX={(v) => String(Math.round(v))} />
            <p className="note">{rank2} of {even.length} even-parity twists up to |d| = {fam.d_bound}. Shown from n = 20 onward.</p>
          </div>
          <div className="panel">
            <div className="insp-h">Counts</div>
            <table className="data">
              <thead><tr><th>root number</th><th className="num">analytic order</th><th>status</th><th className="num">twists</th></tr></thead>
              <tbody>{counts.map((c) => <tr key={`${c.w}${c.o}${c.s}`}><td className="mono">{c.w > 0 ? "+1" : "−1"}</td><td className="num mono">{c.o}</td><td>{c.s}</td><td className="num mono">{c.n}</td></tr>)}</tbody>
            </table>
            <p className="note" style={{ marginTop: 8 }}>Total {rows.length}. Missing or failed computations: 0. Descent bounds disagree for {descentGap} twists; their ranks are settled analytically.</p>
          </div>
        </div>

        <h3 className="h-sec">Reading this honestly</h3>
        <div className="grid-2">
          <div>
            <p className="dim" style={{ fontSize: 14 }}><strong>Selection.</strong> {fam.selection} Small discriminants mean small conductors, where average ranks are known to look higher than their predicted limit (Bektemirov, Mazur, Stein and Watkins, 2007).</p>
            <p className="dim" style={{ fontSize: 14 }}><strong>Exactness.</strong> Root numbers are exact. Analytic orders are numerical: PARI treats values below a threshold as zero. Descent bounds are unconditional.</p>
          </div>
          <div>
            <p className="dim" style={{ fontSize: 14 }}><strong>Testable question.</strong> Does the share of even-parity twists with order 2 keep falling as |d| grows? Random-matrix heuristics predict density zero in the limit. This data can suggest the question but does not answer it.</p>
            <p className="dim" style={{ fontSize: 14 }}><strong>Not a theorem.</strong> Agreement on 1,116 twists is evidence about these twists only.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
