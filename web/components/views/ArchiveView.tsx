"use client";
import { ProblemGlyph, StatusGlyph } from "@/components/glyphs";
import { ARCHIVE, EXTENSIONS } from "@/lib/registry/problems";

/* Schematic only: a rotationally symmetric dumbbell whose neck radius shrinks, then the
   surgery picture (neck removed, both ends capped). Nothing here is a computed Ricci flow. */
function profile(x: number, neck: number) {
  const lobe = (c: number) => Math.sqrt(Math.max(0, 1 - (x - c) ** 2));
  const l = Math.max(lobe(-1.75), lobe(1.75));
  const n = Math.abs(x) < 1.35 ? neck + (1 - neck) * (x / 1.35) ** 2 * 0.62 : 0;
  const k = 0.12;
  return (l + n + Math.sqrt((l - n) ** 2 + k * k)) / 2 - k / 2;
}

function Dumbbell({ neck, cut }: { neck: number; cut?: boolean }) {
  const W = 190, H = 104, sx = 30, cy = H / 2;
  const X = (x: number) => W / 2 + x * sx, R = (r: number) => r * sx;
  const xs = Array.from({ length: 241 }, (_, i) => -2.78 + (5.56 * i) / 240);
  const seg = (from: number, to: number) => {
    const pts = xs.filter((x) => x >= from && x <= to).map((x) => [x, profile(x, neck)] as const);
    const top = pts.map(([x, r], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${(cy - R(r)).toFixed(1)}`).join("");
    const bot = [...pts].reverse().map(([x, r]) => `L${X(x).toFixed(1)},${(cy + R(r)).toFixed(1)}`).join("");
    return top + bot + "Z";
  };
  if (cut) {
    // after surgery: two pieces, each capped where the neck was removed
    const cap = (c: number, dir: number) => {
      const pts = xs.filter((x) => (dir < 0 ? x <= -0.95 : x >= 0.95)).map((x) => [x + dir * 0.18, profile(x, 0.32)] as const);
      const top = pts.map(([x, r], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${(cy - R(r)).toFixed(1)}`).join("");
      const bot = [...pts].reverse().map(([x, r]) => `L${X(x).toFixed(1)},${(cy + R(r)).toFixed(1)}`).join("");
      const end = pts[dir < 0 ? pts.length - 1 : 0];
      const capX = X(end[0]), capR = R(end[1]);
      void c;
      return <g>
        <path d={top + bot + "Z"} fill="none" stroke="var(--text)" strokeWidth={1.2} />
        <path d={`M${capX},${cy - capR}A${capR * 0.9},${capR} 0 0 ${dir < 0 ? 1 : 0} ${capX},${cy + capR}`} fill="none" stroke="var(--accent)" strokeWidth={1.3} />
      </g>;
    };
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        {cap(-1.75, -1)}{cap(1.75, 1)}
        <line x1={X(-0.55)} x2={X(0.55)} y1={cy} y2={cy} stroke="var(--muted)" strokeDasharray="2 4" />
      </svg>
    );
  }
  const nr = profile(0, neck);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <path d={seg(-2.78, 2.78)} fill="none" stroke="var(--text)" strokeWidth={1.2} />
      <ellipse cx={X(-1.75)} cy={cy} rx={R(0.22)} ry={R(1)} fill="none" stroke="var(--muted)" strokeWidth={0.8} strokeDasharray="2 3" />
      <ellipse cx={X(1.75)} cy={cy} rx={R(0.22)} ry={R(1)} fill="none" stroke="var(--muted)" strokeWidth={0.8} strokeDasharray="2 3" />
      <ellipse cx={X(0)} cy={cy} rx={Math.max(1, R(0.22 * nr))} ry={Math.max(1, R(nr))} fill="none" stroke="var(--accent)" strokeWidth={1.1} />
    </svg>
  );
}

export default function ArchiveView() {
  const p = ARCHIVE[0];
  const frames: { neck: number; cut?: boolean; label: string }[] = [
    { neck: 0.62, label: "A neck forms" },
    { neck: 0.36, label: "The neck thins" },
    { neck: 0.1, label: "Near the pinch" },
    { neck: 0.1, cut: true, label: "Surgery: cut and cap" },
  ];
  return (
    <div className="view-scroll" id="workspace-panel" role="tabpanel" aria-labelledby="tab-archive">
      <div className="view-pad" style={{ maxWidth: 940 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 6 }}>
          <span style={{ color: "#a4afbf", display: "inline-grid" }}><ProblemGlyph id="poincare" size={34} /></span>
          <h1 className="h-view" style={{ margin: 0 }}>{p.name}</h1>
        </div>
        <p className="mark" style={{ fontSize: 14 }}><StatusGlyph status="accepted" />Solved. Clay status checked {p.verifiedAt}. Excluded from the research queue.</p>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1.45, maxWidth: "60ch", margin: "18px 0 22px" }}>{p.statement}</p>
        <figure className="panel" style={{ margin: "0 0 22px", padding: "16px 18px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", justifyContent: "space-between" }}>
            {frames.map((f) => (
              <div key={f.label} style={{ display: "grid", justifyItems: "center", gap: 4 }}>
                <Dumbbell neck={f.neck} cut={f.cut} />
                <span className="note" style={{ margin: 0 }}>{f.label}</span>
              </div>
            ))}
          </div>
          <figcaption className="note" style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="badge-ill"><StatusGlyph status="illustrative" />Schematic</span>
            <span>Ricci flow with surgery, drawn by hand: a thin neck pinches, surgery removes it and caps both ends, and the flow continues on the pieces. Not a computed flow.</span>
          </figcaption>
        </figure>
        <p className="dim" style={{ maxWidth: "72ch" }}>{p.history}</p>
        <h2 className="h-sec">Registry extensions</h2>
        <p className="dim" style={{ maxWidth: "72ch" }}>The registry is extensible: a problem needs a statement, sources, a visualizer, tools and a research strategy before it gets a workspace. These three entries have statements only. They are not Millennium Prize Problems and carry no Clay prize, and this list is not a catalogue of all open problems.</p>
        <table className="data" style={{ marginTop: 12 }}>
          <thead><tr><th>Problem</th><th>Statement</th><th>Status in this app</th></tr></thead>
          <tbody>{EXTENSIONS.map((e) => <tr key={e.id}><td style={{ color: "var(--text)" }}>{e.name}</td><td>{e.statement}</td><td>{e.note}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
