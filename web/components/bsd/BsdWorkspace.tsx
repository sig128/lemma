"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkspaceFrame, TimelineDock } from "@/components/shell/Workspace";
import { CurveScene, type ScenePoint, type View } from "@/components/bsd/CurveScene";
import { LFunctionView, statusText } from "@/components/bsd/LFunctionView";
import { FamilyView } from "@/components/bsd/FamilyView";
import { Tex } from "@/components/Tex";
import { ExactnessTag, Icon, StatusGlyph, StatusMark } from "@/components/glyphs";
import { useJson, usePersisted, useUrlState } from "@/lib/hooks";
import { Curve, eqPoint, pt, type Point } from "@/lib/math/elliptic";
import { CURVE_IDS, CURVE_RANK, DEFAULT_VIEW, type CurveData, type CurveId, type TwistFamily, type TwistRow } from "@/lib/bsd/types";
import { PROBLEM_BY_ID } from "@/lib/registry/problems";
import type { EngineStatus } from "@/lib/engine";
import { useEventsFor } from "@/lib/engine";
import type { ResearchEvent, TaskRecord } from "@/lib/events/types";
import { parsePariNum } from "@/lib/scales";
import { roleName, sci } from "@/lib/format";

const INSTRUMENTS = [
  { id: "curve", label: "Curve and group law" },
  { id: "lfunction", label: "L-function at s = 1" },
  { id: "family", label: "Twist family" },
];

export default function BsdWorkspace({ status, onExportRef }: { status: EngineStatus; onExportRef?: (fn: (() => void) | null) => void }) {
  const url = useUrlState();
  const curveId = (CURVE_IDS as readonly string[]).includes(url.get("curve") ?? "") ? (url.get("curve") as CurveId) : "37a1";
  const inst = url.get("inst") ?? "curve";
  const { data: c, error, loading } = useJson<CurveData>(`/data/bsd/${curveId}.json`);
  const fam = useJson<TwistFamily>(inst === "family" ? "/data/bsd/twists-11a1.json" : null);
  const ev = useEventsFor("bsd", status);
  const [selEvent, setSelEvent] = useState<number | null>(null);

  const [views, setViews] = usePersisted<Record<string, View>>("bsd:views", {});
  const view = views[curveId] ?? DEFAULT_VIEW[curveId];
  const setView = useCallback((v: View) => setViews((p) => ({ ...p, [curveId]: v })), [curveId, setViews]);

  const [mode, setMode] = useState<"inspect" | "add">("inspect");
  const [hover, setHover] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const selA = url.get("pt");
  const selB = url.get("pt2");
  const pickedK = url.get("k") !== null ? Number(url.get("k")) : null;
  const pickedD = url.get("d") !== null ? Number(url.get("d")) : null;

  const E = useMemo(() => (c ? new Curve(c.ainvs) : null), [c]);
  const points = useMemo<ScenePoint[]>(() => {
    if (!c || !E) return [];
    const out: ScenePoint[] = [];
    const seen = new Set<string>();
    const add = (P: Point, kind: ScenePoint["kind"], label?: string) => {
      if (P.kind !== "aff") return;
      const id = `${P.x.toString()},${P.y.toString()}`;
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ id, x: P.x, y: P.y, kind, label });
    };
    if (c.torsion.order > 1) {
      const T = pt(...c.torsion.generators[0]);
      for (let k = 1; k < c.torsion.order; k++) add(E.mul(k, T), "torsion", k === 1 ? "T" : `${k}T`);
    }
    const sub = ["₁", "₂", "₃", "₄"];
    const gname = (i: number) => (c.generators.length === 1 ? "P" : `P${sub[i]}`);
    c.generators.forEach(([x, y], i) => add(pt(x, y), "generator", gname(i)));
    for (const g of c.generator_combinations) {
      const label = g.coeffs.map((a, i) => (a === 0 ? "" : `${a > 0 ? "+" : "−"}${Math.abs(a) === 1 ? "" : Math.abs(a)}${gname(i)}`)).join("").replace(/^\+/, "");
      add(pt(g.x, g.y), "combo", label);
    }
    for (const [x, y] of c.point_search.points) add(pt(x, y), "search");
    return out;
  }, [c, E]);
  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const A = selA ? byId.get(selA) ?? null : null;
  const B = selB ? byId.get(selB) ?? null : null;
  const step = useMemo(() => (E && A && B ? E.chord(pt(A.x, A.y), pt(B.x, B.y)) : null), [E, A, B]);
  const resultPoint = step?.sum && step.sum.kind === "aff" ? points.find((p) => eqPoint(pt(p.x, p.y), step.sum)) ?? null : null;
  const resultLabel = A && B ? (resultPoint?.label ?? (A.id === B.id ? `2${A.label ?? "P"}` : `${A.label ?? "P"} + ${B.label ?? "Q"}`)) : undefined;

  useEffect(() => {
    if (!step) { setStepIndex(0); return; }
    setStepIndex(1);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setStepIndex(3); return; }
    const t1 = setTimeout(() => setStepIndex(2), 380);
    const t2 = setTimeout(() => setStepIndex(3), 820);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [step]);

  const onPick = (id: string) => {
    if (mode === "inspect") { url.set({ pt: id === selA ? null : id, pt2: null }); return; }
    if (!selA || (selA && selB)) url.set({ pt: id, pt2: null });
    else url.set({ pt2: id });
  };

  const onEvent = (e: ResearchEvent | null) => {
    setSelEvent(e?.seq ?? null);
    if (e?.view) {
      const v = e.view;
      url.set({ curve: v.curve ?? null, inst: v.view ?? null, k: v.object === "L''" ? "2" : null });
    }
  };

  const tasks: TaskRecord[] = useMemo(() => ev.bundles.flatMap((b) => b.tasks).filter((t) => t.problem_id === "bsd"), [ev.bundles]);
  const relatedTask = tasks.find((t) => t.question.includes(curveId) && t.state !== "completed") ?? tasks.find((t) => t.question.includes(curveId)) ?? null;
  const bundle = ev.bundles.find((b) => b.campaign.problem_id === "bsd") ?? null;

  const stage = (
    <>
      <div className="stage-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="stage-title">Elliptic curve {curveId}</h1>
          {c && <div className="stage-eq"><Tex tex={c.equation_tex} /></div>}
          {c && (
            <div className="stage-facts">
              <span>rank {c.rank_bounds.lower}</span>
              <span>conductor {c.conductor.toLocaleString("en-US")}</span>
              <span>torsion {c.torsion.order === 1 ? "trivial" : `ℤ/${c.torsion.structure.join("×")}`}</span>
              <span>root number {c.root_number > 0 ? "+1" : "−1"}</span>
            </div>
          )}
        </div>
        <div className="stage-head-tools">
          <div className="seg" role="radiogroup" aria-label="Curve">
            {CURVE_IDS.map((id) => (
              <button key={id} role="radio" aria-checked={id === curveId} onClick={() => url.set({ curve: id, pt: null, pt2: null, k: null })}>
                {id} <span className="muted" style={{ fontSize: 12 }}>r={CURVE_RANK[id]}</span>
              </button>
            ))}
          </div>
          <div className="seg" role="radiogroup" aria-label="Instrument">
            {INSTRUMENTS.map((i) => <button key={i.id} role="radio" aria-checked={inst === i.id} onClick={() => url.set({ inst: i.id === "curve" ? null : i.id })}>{i.label}</button>)}
          </div>
        </div>
      </div>
      {error && <div className="dock-empty" style={{ paddingTop: 180 }}>Could not load the dataset for {curveId}: {error}</div>}
      {loading && !c && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><span className="skeleton" style={{ width: 240, height: 12 }} /></div>}
      {c && inst === "curve" && (
        <>
          <CurveScene ainvs={c.ainvs} view={view} onView={setView} points={points} selectedA={selA} selectedB={selB} hovered={hover}
            onHover={setHover} onPick={onPick} step={step} stepIndex={stepIndex} resultLabel={resultLabel} />
          <div className="stage-tools">
            <div className="seg" role="radiogroup" aria-label="Pointer mode">
              <button role="radio" aria-checked={mode === "inspect"} onClick={() => { setMode("inspect"); url.set({ pt2: null }); }}>Inspect</button>
              <button role="radio" aria-checked={mode === "add"} onClick={() => setMode("add")}>Add P + Q</button>
            </div>
            <button className="btn btn-icon" aria-label="Zoom in" onClick={() => setView({ ...view, sx: view.sx / 1.3, sy: view.sy / 1.3 })}><Icon name="plus" /></button>
            <button className="btn btn-icon" aria-label="Zoom out" onClick={() => setView({ ...view, sx: view.sx * 1.3, sy: view.sy * 1.3 })}><Icon name="minus" /></button>
            <button className="btn btn-icon" aria-label="Reset view" onClick={() => setView(DEFAULT_VIEW[curveId])}><Icon name="reset" /></button>
          </div>
        </>
      )}
      {c && inst === "lfunction" && <LFunctionView c={c} picked={pickedK} onPickDerivative={(k) => url.set({ k: String(k) })} />}
      {inst === "family" && fam.data && <FamilyView fam={fam.data} picked={pickedD} onPick={(r) => url.set({ d: String(r.d) })} />}
      {inst === "family" && fam.loading && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><span className="skeleton" style={{ width: 240, height: 12 }} /></div>}
    </>
  );

  const inspector = c ? (
    <BsdInspector c={c} inst={inst} A={A} B={B} step={step} resultLabel={resultLabel} mode={mode}
      pickedK={pickedK} twist={inst === "family" && fam.data && pickedD !== null ? fam.data.rows.find((r) => r.d === pickedD) ?? null : null}
      task={relatedTask} bundleAt={bundle?.recorded_at ?? null}
      onGoFrontier={() => url.set({ curve: "234446a1", inst: "lfunction", k: "2", pt: null, pt2: null })}
      onClear={() => url.set({ pt: null, pt2: null })} />
  ) : <div className="insp"><span className="skeleton" style={{ height: 14, width: "70%" }} /></div>;

  return (
    <WorkspaceFrame problem="bsd" stage={stage} inspector={inspector}
      dock={<TimelineDock events={ev.events} mode={ev.mode} loading={ev.loading} error={ev.error} selected={selEvent} onSelect={onEvent} recordedAt={bundle?.recorded_at} lastUpdate={ev.lastUpdate} />} />
  );
}

function BsdInspector({ c, inst, A, B, step, resultLabel, mode, pickedK, twist, task, bundleAt, onGoFrontier, onClear }: {
  c: CurveData; inst: string; A: ScenePoint | null; B: ScenePoint | null; step: ReturnType<Curve["chord"]> | null; resultLabel?: string; mode: string;
  pickedK: number | null; twist: TwistRow | null; task: TaskRecord | null; bundleAt: string | null; onGoFrontier: () => void; onClear: () => void;
}) {
  const p = PROBLEM_BY_ID.bsd;
  const frontier = p.frontier.nodes.find((n) => n.id === p.campaign.obligation)!;
  const isFrontierCurve = c.id === "234446a1";
  const der = pickedK !== null ? c.analytic.derivatives_at_1.find((d) => d.k === pickedK) ?? null : null;
  const fmtNum = (s: string, n = 12) => { const v = parsePariNum(s); return Math.abs(v) < 1e-6 ? v.toExponential(3) : v.toPrecision(n); };

  return (
    <div className="insp">
      {/* 1. Selected object */}
      <section className="insp-section" aria-labelledby="sel-h">
        <h2 className="insp-h" id="sel-h">Selected</h2>
        {step && A && B ? (
          <>
            <p className="insp-title">{resultLabel}</p>
            <dl className="kv">
              <dt>{A.label ?? "P"}</dt><dd className="mono">({A.x.toString()}, {A.y.toString()})</dd>
              <dt>{B.label ?? "Q"}</dt><dd className="mono">({B.x.toString()}, {B.y.toString()})</dd>
              {step.kind === "secant" || step.kind === "tangent" ? (
                <>
                  <dt>{step.kind === "tangent" ? "Tangent" : "Line"}</dt><dd><Tex tex={`y = ${step.lambda.toTex()}\\,x ${step.nu.sign() < 0 ? "-" : "+"} ${step.nu.sign() < 0 ? step.nu.neg().toTex() : step.nu.toTex()}`} /></dd>
                  <dt>Third point</dt><dd className="mono">{step.third.kind === "aff" ? `(${step.third.x}, ${step.third.y})` : "O"}</dd>
                </>
              ) : null}
              <dt>Sum</dt><dd className="mono">{step.sum.kind === "aff" ? `(${step.sum.x}, ${step.sum.y})` : "O (point at infinity)"}</dd>
            </dl>
            <p className="note" style={{ marginTop: 8 }}>{step.note} The sum is the reflection of the third intersection. All coordinates are exact rationals computed in this browser.</p>
            <div style={{ marginTop: 8 }}><ExactnessTag kind="exact" /></div>
          </>
        ) : A ? (
          <>
            <p className="insp-title">{A.label ? `${A.label} ` : ""}<span className="mono" style={{ fontSize: 16 }}>({A.x.toString()}, {A.y.toString()})</span></p>
            <dl className="kv">
              <dt>Kind</dt><dd>{A.kind === "torsion" ? "Torsion point" : A.kind === "generator" ? "Generator (saturated)" : A.kind === "combo" ? "Combination of generators" : "Found by height search"}</dd>
              <dt>Naive height</dt><dd className="mono">H(x) = {A.x.height().toString()}</dd>
            </dl>
            <p className="note" style={{ marginTop: 8 }}>{mode === "add" ? "Select a second point to add, or the same point again to double it." : "Switch to “Add P + Q” to start a chord-and-tangent construction."}</p>
            <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={onClear}>Clear selection</button>
          </>
        ) : der ? (
          <>
            <p className="insp-title"><Tex tex={`L^{(${der.k})}(E,1)`} /></p>
            <dl className="kv"><dt>Value</dt><dd className="mono">{sci(der.value)}</dd><dt>Status</dt><dd>{statusText(der.status)}</dd></dl>
            <p style={{ marginTop: 8 }}>{der.reason}</p>
          </>
        ) : twist ? (
          <>
            <p className="insp-title">Twist <Tex tex={`E^{(${twist.d})}`} /></p>
            <dl className="kv">
              <dt>Conductor</dt><dd className="mono">{twist.conductor.toLocaleString("en-US")}</dd>
              <dt>Root number</dt><dd className="mono">{twist.root_number > 0 ? "+1" : "−1"}</dd>
              <dt>Descent</dt><dd className="mono">[{twist.rank_lower}, {twist.rank_upper}]</dd>
              <dt>Analytic order</dt><dd className="mono">{twist.analytic_order_numerical} (numerical)</dd>
              {twist.sha_analytic !== null && <><dt>Analytic Sha</dt><dd className="mono">{twist.sha_analytic.toFixed(6)}</dd></>}
            </dl>
            <p style={{ marginTop: 8 }}>{twist.route}</p>
          </>
        ) : (
          <>
            <p className="insp-title">Curve {c.id} <span className="muted" style={{ fontSize: 14 }}>LMFDB {c.lmfdb_label}</span></p>
            <p>{c.note}</p>
          </>
        )}
      </section>

      {/* 2. Arithmetic inspector */}
      <section className="insp-section" aria-labelledby="ar-h">
        <h2 className="insp-h" id="ar-h">Arithmetic of {c.id}</h2>
        <dl className="kv">
          <dt>Conductor</dt><dd className="mono">{c.conductor}</dd>
          <dt>Discriminant</dt><dd className="mono">{c.discriminant}</dd>
          <dt>j-invariant</dt><dd className="mono">{c.j_invariant}</dd>
          <dt>Tamagawa</dt><dd className="mono">{c.local_data.map((l) => `c${l.p}=${l.c_p} (${l.kodaira})`).join(", ")}</dd>
          <dt>Rank bounds</dt><dd><span className="mono">{c.rank_bounds.lower} ≤ r ≤ {c.rank_bounds.upper}</span> <ExactnessTag kind="exact" /></dd>
          <dt>Generators</dt><dd className="mono">{c.generators.length ? c.generators.map(([x, y]) => `(${x}, ${y})`).join(", ") : "none"}</dd>
          <dt>Regulator</dt><dd><span className="mono">{fmtNum(c.regulator)}</span> <ExactnessTag kind="numerical" /></dd>
          <dt>Analytic order</dt><dd><span className="mono">{c.analytic.status === "established" ? c.analytic.order_numerical : "2 or 4"}</span> {c.analytic.status === "established" ? <ExactnessTag kind="numerical" /> : <StatusMark status="blocked" label="Undetermined" />}</dd>
          <dt><Tex tex={`L^{(r)}(E,1)/r!`} /></dt><dd><span className="mono">{fmtNum(c.analytic.leading_over_factorial)}</span> <ExactnessTag kind="numerical" /></dd>
          <dt>Analytic Sha</dt><dd><span className="mono">{fmtNum(c.bsd_refinement.sha_analytic, 10)}</span> <ExactnessTag kind="numerical" /></dd>
          <dt>Labels</dt><dd>Cremona {c.cremona_label}, LMFDB {c.lmfdb_label} <span className="note">(labels recorded; LMFDB values not fetched in this run)</span></dd>
        </dl>
        <details className="alt" style={{ marginTop: 10 }}>
          <summary>Algorithms, settings and provenance</summary>
          <p className="note">{c.rank_bounds.method}</p>
          <p className="note">{c.analytic.method}</p>
          <dl className="kv" style={{ marginTop: 6 }}>
            <dt>Software</dt><dd className="mono">PARI/GP {c.provenance.pari_version}</dd>
            <dt>Precision</dt><dd className="mono">{c.provenance.realprecision_digits} digits</dd>
            <dt>Threshold</dt><dd className="mono">eps = {c.analytic.threshold_eps}</dd>
            <dt>Functions</dt><dd className="mono">{c.provenance.functions.join(", ")}</dd>
            <dt>Computed</dt><dd className="mono">{c.provenance.computed_at} ({c.provenance.wall_seconds} s)</dd>
            <dt>Reproduce</dt><dd className="mono">python3 -I {c.provenance.script} web/public/data/bsd</dd>
          </dl>
          <p className="note">These values were computed in the build run, not read from a database. Points and sums in the plot are recomputed in the browser with exact rational arithmetic and agree with PARI (tested).</p>
        </details>
      </section>

      {/* 3. What the agent is attempting */}
      <section className="insp-section" aria-labelledby="ag-h">
        <h2 className="insp-h" id="ag-h">What the agent is attempting</h2>
        {task ? (
          <>
            <p><strong>{roleName(task.role)}</strong>: {task.objective}</p>
            <p className="note">Task {task.id}, state {task.state}{task.finished_at ? `, finished ${task.finished_at.replace("T", " ").slice(0, 16)} UTC` : ""}. {bundleAt ? "From the recorded run (replay); no agent is running now." : ""}</p>
            {task.result_summary && <p className="note">{task.result_summary}</p>}
          </>
        ) : (
          <p>No live agent is connected. {bundleAt ? "The recorded campaign has no task for this curve; open History to replay it." : "No campaign has been recorded yet."}</p>
        )}
      </section>

      {/* 4. Evidence */}
      <section className="insp-section" aria-labelledby="ev-h">
        <h2 className="insp-h" id="ev-h">Evidence available</h2>
        <ul className="list">
          <li><StatusGlyph status="literature-theorem" /> <span>Rank {c.rank_bounds.lower} certified by 2-descent with {c.generators.length} exhibited independent point{c.generators.length === 1 ? "" : "s"}.</span></li>
          {c.analytic.derivatives_at_1.map((d) => (
            <li key={d.k}><StatusGlyph status={d.status === "zero-theorem" ? "literature-theorem" : d.status === "numerically-zero" ? "blocked" : "numerically-supported"} />
              <span><Tex tex={`L^{(${d.k})}(E,1)`} />: {statusText(d.status).toLowerCase()}.</span></li>
          ))}
          <li><StatusGlyph status={c.rank_equality.status === "theorem" ? "literature-theorem" : c.rank_equality.status === "verified-instance" ? "verified-instance" : "open"} /> <span>{c.rank_equality.text}</span></li>
        </ul>
      </section>

      {/* 5. Unresolved */}
      <section className="insp-section" aria-labelledby="un-h">
        <h2 className="insp-h" id="un-h">What remains unresolved</h2>
        {isFrontierCurve ? (
          <>
            <p className="callout callout-warn"><strong>Current obligation.</strong> {frontier.statement}</p>
            <p style={{ marginTop: 8 }}>{frontier.why}</p>
          </>
        ) : (
          <>
            <p>For {c.id}, nothing about rank equality: {c.rank_equality.status === "theorem" ? "it is a theorem in analytic rank ≤ 1." : "both sides are settled for this curve."} The conjecture in general, from rank 2 up, is open.</p>
            <p>The campaign&apos;s current obligation is a curve of rank 4, where the method that works here stops.</p>
            <button className="btn btn-accent" onClick={onGoFrontier} style={{ marginTop: 4 }}>Open the current obligation</button>
          </>
        )}
      </section>

      {/* 6. Next useful test */}
      <section className="insp-section" aria-labelledby="nx-h">
        <h2 className="insp-h" id="nx-h">Next useful test</h2>
        {isFrontierCurve ? (
          <p>Raising precision will only shrink |L″(E,1)| further and cannot prove it is zero. A useful test is structural: search the literature for any identity forcing even-order vanishing beyond parity, and record a precise failure if none applies.</p>
        ) : inst === "family" ? (
          <p>Extend the twist range to |d| ≤ 10⁴ under a fixed compute budget and test whether the share of order-2 twists keeps falling; record timeouts as missing values.</p>
        ) : (
          <p>Pick two points and add them: every coordinate stays exact. Then compare with the L-function view, where only numerical evidence is available.</p>
        )}
      </section>
    </div>
  );
}
