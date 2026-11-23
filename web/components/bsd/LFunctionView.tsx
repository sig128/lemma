"use client";
import { useMemo, useState } from "react";
import { Chart } from "@/components/charts/Chart";
import { Tex } from "@/components/Tex";
import type { CurveData } from "@/lib/bsd/types";
import { parsePariNum } from "@/lib/scales";
import { sci } from "@/lib/format";

export function LFunctionView({ c, onPickDerivative, picked }: { c: CurveData; onPickDerivative: (k: number) => void; picked: number | null }) {
  const [win, setWin] = useState(0.4);
  const samples = useMemo(() => c.L_real_samples.s.map((s, i) => ({ x: s, y: c.L_real_samples.L[i] })).filter((p) => Math.abs(p.x - 1) <= win + 1e-9), [c, win]);
  const ders = c.analytic.derivatives_at_1;
  const floor = 1e-38;
  const eps = parsePariNum(c.analytic.threshold_eps);
  const ledger = ders.map((d) => {
    const v = Math.abs(parsePariNum(d.value));
    return { x: d.k, y: Math.max(v, 1e-50), shape: d.status === "zero-theorem" ? ("square" as const) : d.status === "numerically-zero" ? ("circle" as const) : ("diamond" as const), meta: statusText(d.status) };
  });
  const thm = ledger.filter((_, i) => ders[i].status === "zero-theorem");
  const numz = ledger.filter((_, i) => ders[i].status === "numerically-zero");
  const nz = ledger.filter((_, i) => ders[i].status === "nonzero-numerical");
  const r = c.rank_bounds.lower;
  const anText = c.analytic.status === "established" ? String(c.analytic.order_numerical) : `${ders.filter((d) => d.status === "numerically-zero").map((d) => d.k).join(", ")} or ${c.analytic.order_numerical}`;
  return (
    <div className="view-scroll stage-scroll">
      <div className="view-pad" style={{ paddingTop: 4, maxWidth: 1040 }}>
        <div className="grid-2" style={{ alignItems: "start" }}>
          <div className="panel">
            <div className="field-row" style={{ marginBottom: 6 }}>
              <span className="insp-h" style={{ margin: 0 }}>L(E, s) on the real line near s = 1</span>
              <label className="field" style={{ gridAutoFlow: "column", alignItems: "center", gap: 8 }}>
                <span>Window ±{win.toFixed(2)}</span>
                <input type="range" min={0.06} max={0.6} step={0.02} value={win} onChange={(e) => setWin(+e.target.value)} aria-label="Width of the s-window around 1" style={{ width: 120 }} />
              </label>
            </div>
            <Chart height={240} series={[{ id: "L", label: "L(E,s)", color: "var(--series-1)", kind: "line", points: samples }]}
              x={{ label: "s" }} y={{ label: "L(E, s)" }} annotations={[{ type: "vline", x: 1, label: "s = 1" }, { type: "hline", y: 0, dash: "1 0", color: "var(--rule)" }]}
              tooltipY={(v) => v.toExponential(6)} tableCaption={`PARI lfun at ${c.provenance.realprecision_digits}-digit precision, step 0.02.`} />
            <p className="note" style={{ marginTop: 6 }}>PARI {c.provenance.pari_version} lfun, {c.provenance.realprecision_digits} significant digits. Floating point with PARI&apos;s own truncation control; not interval arithmetic.</p>
          </div>
          <div className="panel">
            <div className="insp-h">Derivatives at s = 1, magnitude on a log scale</div>
            <Chart height={240}
              series={[
                { id: "thm", label: "Zero by theorem (plotted value is rounding noise)", color: "var(--text-2)", kind: "dots" as const, points: thm },
                { id: "numz", label: "Numerically zero, not proven", color: "var(--series-2)", kind: "dots" as const, points: numz },
                { id: "nz", label: "Numerically nonzero", color: "var(--series-1)", kind: "dots" as const, points: nz },
              ].filter((s) => s.points.length)}
              x={{ label: "order k of derivative", domain: [-0.5, Math.max(4, ders.length - 0.5)], ticks: ders.map((d) => d.k), format: (v) => `L${"′".repeat(v)}` }}
              y={{ label: "|L^(k)(E,1)|", scale: "log", domain: [1e-50, 1e4] }}
              annotations={[{ type: "hband", y0: 1e-50, y1: floor, label: "below working precision" }, { type: "hline", y: eps, label: `PARI zero threshold ${eps.toExponential(1)}`, color: "var(--amber)" }]}
              onSelect={(_, p) => onPickDerivative(p.x)}
              selected={picked !== null ? { series: ders[picked]?.status === "numerically-zero" ? "numz" : ders[picked]?.status === "zero-theorem" ? "thm" : "nz", index: (ders[picked]?.status === "numerically-zero" ? numz : ders[picked]?.status === "zero-theorem" ? thm : nz).findIndex((p) => p.x === picked) } : null}
              tooltipX={(v) => `k = ${v}`} tooltipY={(v) => v.toExponential(3)} />
          </div>
        </div>

        <h3 className="h-sec">The two sides of the conjecture for {c.id}</h3>
        <div className="grid-2">
          <div className="panel">
            <div className="insp-h">Algebraic side</div>
            <div style={{ fontSize: 20, margin: "4px 0 8px" }}><Tex tex={String.raw`\operatorname{rank}E(\mathbb Q) = ${r}`} /></div>
            <p className="dim" style={{ margin: 0, fontSize: 14 }}>Certified by 2-descent: {r} independent points exhibited, and the Selmer bound meets them. {c.generators.length ? `Generators saturated at primes below ${c.saturation.bound}.` : "No points of infinite order."}</p>
          </div>
          <div className="panel">
            <div className="insp-h">Analytic side</div>
            <div style={{ fontSize: 20, margin: "4px 0 8px" }}><Tex tex={c.analytic.status === "established" ? String.raw`\operatorname{ord}_{s=1}L(E,s) = ${c.analytic.order_numerical}` : String.raw`\operatorname{ord}_{s=1}L(E,s) \in \{${anText.replace(" or ", ", ")}\}`} /></div>
            <p className="dim" style={{ margin: 0, fontSize: 14 }}>{c.analytic.summary}</p>
          </div>
        </div>
        <p className="callout" style={{ marginTop: 18, maxWidth: "72ch" }}>{c.rank_equality.text} The equation above is the conjecture&apos;s claim for this curve only; it is shown side by side, not asserted in general.</p>

        <h3 className="h-sec">Derivative ledger</h3>
        <table className="data">
          <thead><tr><th>k</th><th className="num">numerical value</th><th>status</th><th>reason</th></tr></thead>
          <tbody>
            {ders.map((d) => (
              <tr key={d.k} onClick={() => onPickDerivative(d.k)} style={{ cursor: "pointer", background: picked === d.k ? "var(--raised)" : undefined }}>
                <td className="mono">{d.k}</td>
                <td className="num mono">{sci(d.value)}</td>
                <td>{statusText(d.status)}</td>
                <td style={{ maxWidth: 420 }}>{d.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function statusText(s: string) {
  return s === "zero-theorem" ? "Zero by theorem" : s === "numerically-zero" ? "Numerically zero (not proven)" : "Nonzero (numerical)";
}
