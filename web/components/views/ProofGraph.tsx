"use client";
import { useMemo } from "react";
import { StatusGlyph, STATUS_LABEL } from "@/components/glyphs";
import type { FrontierEdge, FrontierNode } from "@/lib/registry/problems";
import { useSize } from "@/lib/hooks";

const NW = 230, NH = 70, GX = 96, GY = 18;
const FLOW_REVERSED = new Set(["depends-on", "checked-by", "assumes"]);

const KIND_LABEL: Record<string, string> = {
  definition: "Definition", theorem: "Known theorem", conditional: "Conditional deduction", candidate: "Candidate", blocked: "Blocked obligation",
  rejected: "Rejected claim", target: "Target", instance: "Checked instance", "external-claim": "External claim", evidence: "Evidence", refinement: "Refinement",
};

export function layoutGraph(nodes: FrontierNode[], edges: FrontierEdge[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const flows = edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => (FLOW_REVERSED.has(e.type) ? { a: e.to, b: e.from } : { a: e.from, b: e.to }));
  const layer = new Map<string, number>();
  const visit = (id: string, stack: Set<string>): number => {
    if (layer.has(id)) return layer.get(id)!;
    if (stack.has(id)) return 0;
    stack.add(id);
    const preds = flows.filter((f) => f.b === id).map((f) => f.a);
    const l = preds.length ? 1 + Math.max(...preds.map((p) => visit(p, stack))) : 0;
    stack.delete(id);
    layer.set(id, l);
    return l;
  };
  nodes.forEach((n) => visit(n.id, new Set()));
  const cols = new Map<number, string[]>();
  nodes.forEach((n) => { const l = layer.get(n.id)!; cols.set(l, [...(cols.get(l) ?? []), n.id]); });
  const pos = new Map<string, { x: number; y: number }>();
  const maxL = Math.max(...cols.keys());
  for (let l = 0; l <= maxL; l++) {
    const col = cols.get(l) ?? [];
    if (l > 0) {
      const bary = (id: string) => {
        const ps = flows.filter((f) => f.b === id).map((f) => pos.get(f.a)?.y).filter((v): v is number => v !== undefined);
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0;
      };
      col.sort((a, b) => bary(a) - bary(b));
    }
    col.forEach((id, i) => pos.set(id, { x: l * (NW + GX), y: i * (NH + GY) }));
  }
  const H = Math.max(...[...cols.values()].map((c) => c.length)) * (NH + GY);
  // vertically center each column
  for (const [, col] of cols) {
    const h = col.length * (NH + GY);
    col.forEach((id) => { const p = pos.get(id)!; pos.set(id, { x: p.x, y: p.y + (H - h) / 2 }); });
  }
  return { pos, W: (maxL + 1) * (NW + GX) - GX, H, flows };
}

export function ProofGraph({ nodes, edges, selected, onSelect, height }: { nodes: FrontierNode[]; edges: FrontierEdge[]; selected: string | null; onSelect: (id: string) => void; height?: number }) {
  const { pos, W, H } = useMemo(() => layoutGraph(nodes, edges), [nodes, edges]);
  const [ref, size] = useSize<HTMLDivElement>();
  const scale = Math.min(1, (size.w || W) / (W + 40));
  const related = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(edges.filter((e) => e.from === selected || e.to === selected).flatMap((e) => [e.from, e.to]));
  }, [selected, edges]);
  return (
    <div ref={ref} style={{ width: "100%", overflowX: "auto" }}>
      <svg width={Math.max(W + 40, 300) * scale} height={(H + 30) * scale} viewBox={`-20 -10 ${W + 40} ${H + 30}`} role="group" aria-label="Dependency graph for the current research plan" style={{ height: height ? Math.min(height, (H + 30) * scale) : undefined }}>
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#4a5870" /></marker>
          <marker id="arr-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="var(--accent)" /></marker>
        </defs>
        {edges.map((e, i) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          const rev = FLOW_REVERSED.has(e.type);
          const [p, q] = rev ? [b, a] : [a, b];
          const x1 = p.x + NW, y1 = p.y + NH / 2, x2 = q.x, y2 = q.y + NH / 2;
          const hot = selected && (e.from === selected || e.to === selected);
          const dash = e.type === "supports" ? "6 4" : e.type === "contradicts" ? "2 4" : e.type === "cites" ? "1 4" : e.type === "attempted-by" ? "4 3" : undefined;
          const col = e.type === "contradicts" ? "var(--rejected)" : hot ? "var(--accent)" : "#3a475c";
          const mx = (x1 + x2) / 2;
          return (
            <g key={i}>
              <path d={`M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2 - 2},${y2}`} fill="none" stroke={col} strokeWidth={hot ? 1.8 : 1.2} strokeDasharray={dash} markerEnd={`url(#${hot ? "arr-hot" : "arr"})`} opacity={selected && !hot ? 0.35 : 1} />
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id)!;
          const sel = n.id === selected;
          const dim = selected && !sel && !related.has(n.id);
          const border = n.kind === "target" ? "var(--text)" : n.kind === "blocked" ? "var(--amber)" : n.kind === "rejected" ? "var(--rejected)" : sel ? "var(--accent)" : "#2c384b";
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: "pointer", transition: "transform 320ms var(--ease), opacity 200ms" }} opacity={dim ? 0.45 : 1}
              role="button" tabIndex={0} aria-pressed={sel} aria-label={`${KIND_LABEL[n.kind] ?? n.kind}: ${n.title}. Status ${STATUS_LABEL[n.status]}`}
              onClick={() => onSelect(n.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n.id); } }}>
              <rect width={NW} height={NH} rx={4} fill={sel ? "#18202d" : "var(--raised)"} stroke={border} strokeWidth={sel || n.kind === "target" ? 1.6 : 1} strokeDasharray={n.kind === "candidate" || n.kind === "external-claim" ? "4 3" : undefined} />
              <foreignObject x={10} y={8} width={NW - 20} height={NH - 12}>
                <div style={{ fontSize: 12.5, lineHeight: 1.3, color: "var(--text)", display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 11.5 }}><StatusGlyph status={n.status} />{KIND_LABEL[n.kind] ?? n.kind}</span>
                  <span style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{n.title}</span>
                </div>
              </foreignObject>
            </g>
          );
        })}
        {selected && edges.map((e, i) => {
          if (e.from !== selected && e.to !== selected) return null;
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          const rev = FLOW_REVERSED.has(e.type);
          const [p, q] = rev ? [b, a] : [a, b];
          const pSel = (rev ? e.to : e.from) === selected;
          // label sits in the column gap next to the neighbouring node, so labels of different edges never stack
          const lx = pSel ? q.x - GX / 2 : p.x + NW + GX / 2;
          const ly = (pSel ? q.y : p.y) + NH / 2;
          const text = e.type.replace(/-/g, " ");
          const w = text.length * 6.2 + 12;
          return (
            <g key={`l${i}`} pointerEvents="none">
              <rect x={lx - w / 2} y={ly - 9} width={w} height={18} rx={9} fill="var(--bg)" stroke="var(--rule-soft)" />
              <text x={lx} y={ly + 4} textAnchor="middle" fontSize="11" fill="var(--text-2)">{text}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function EdgeLegend() {
  const items: [string, string | undefined, string][] = [["depends on", undefined, "#3a475c"], ["supports", "6 4", "#3a475c"], ["contradicts (barrier or failed variant)", "2 4", "var(--rejected)"], ["cites", "1 4", "#3a475c"]];
  return (
    <div className="chart-legend">
      {items.map(([l, d, c]) => <span key={l}><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke={c} strokeWidth="1.5" strokeDasharray={d} /></svg>{l}</span>)}
    </div>
  );
}
