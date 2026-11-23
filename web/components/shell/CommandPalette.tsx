"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUrlState } from "@/lib/hooks";
import { PROBLEMS } from "@/lib/registry/problems";
import { SOURCES } from "@/lib/registry/sources";
import { CURVE_IDS } from "@/lib/bsd/types";
import { VIEWS } from "@/components/shell/chrome";

type Cmd = { id: string; group: string; label: string; hint?: string; run: () => void; keywords?: string };

export function CommandPalette({ onClose, onToast }: { onClose: () => void; onToast: (t: string) => void }) {
  const url = useUrlState();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  const cmds = useMemo<Cmd[]>(() => {
    const go = (patch: Record<string, string | null>) => () => { url.set(patch, { push: true }); onClose(); };
    const out: Cmd[] = [];
    for (const p of PROBLEMS) out.push({ id: `p-${p.id}`, group: "Problems", label: p.name, hint: p.official.label, run: go({ s: null, p: p.id === "bsd" ? null : p.id, v: null }), keywords: p.short });
    out.push({ id: "archive", group: "Problems", label: "Archive: Poincaré conjecture", hint: "Solved", run: go({ s: null, p: "archive" }) });
    for (const v of VIEWS) out.push({ id: `v-${v.id}`, group: "Views", label: `${v.label} view`, run: go({ s: null, v: v.id === "explore" ? null : v.id }) });
    for (const c of CURVE_IDS) out.push({ id: `c-${c}`, group: "Objects", label: `Elliptic curve ${c}`, hint: "BSD", run: go({ s: null, p: null, v: null, curve: c, inst: null, pt: null, pt2: null }) });
    out.push({ id: "o-frontier", group: "Objects", label: "Current BSD obligation: L″(E,1) for 234446a1", run: go({ s: null, p: null, v: null, curve: "234446a1", inst: "lfunction", k: "2" }) });
    out.push({ id: "o-family", group: "Objects", label: "Quadratic twists of 11a1", run: go({ s: null, p: null, v: null, curve: "11a1", inst: "family" }) });
    out.push({ id: "o-zeros", group: "Objects", label: "First 300 zeros of ζ(s)", hint: "Riemann", run: go({ s: null, p: "riemann", v: null }) });
    out.push({ id: "o-sat", group: "Objects", label: "SAT instance and solver trace", hint: "P vs NP", run: go({ s: null, p: "pnp", v: null }) });
    out.push({ id: "o-tg", group: "Objects", label: "Taylor–Green vortex (exact solution check)", hint: "Navier–Stokes", run: go({ s: null, p: "ns", v: null, ic: "tg" }) });
    out.push({ id: "o-lat", group: "Objects", label: "2D U(1) lattice", hint: "Yang–Mills", run: go({ s: null, p: "ym", v: null }) });
    out.push({ id: "o-clebsch", group: "Objects", label: "Clebsch cubic surface and its 27 lines", hint: "Hodge", run: go({ s: null, p: "hodge", v: null }) });
    for (const s of SOURCES) out.push({ id: `s-${s.id}`, group: "Sources", label: s.title, hint: s.authors[0], run: go({ s: null, p: s.problems[0] === "bsd" ? null : s.problems[0] === "poincare" ? null : s.problems[0], v: "sources", src: s.id }), keywords: s.authors.join(" ") });
    const presets = ["Survey a precise subproblem", "Reproduce a theorem's worked example", "Search for a counterexample to an auxiliary claim", "Audit the assumptions in an argument", "Formalize an isolated lemma", "Compare two candidate strategies", "Refresh sources for a proof node"];
    for (const pr of presets) out.push({ id: `t-${pr}`, group: "Bounded tasks", label: pr, hint: "Research", run: go({ s: "research", preset: pr }) });
    out.push({ id: "x-export", group: "Actions", label: "Export the current view", run: () => { onClose(); window.dispatchEvent(new CustomEvent("noether:export")); } });
    out.push({ id: "x-focus", group: "Actions", label: "Enter focus mode", run: () => { onClose(); window.dispatchEvent(new CustomEvent("noether:focus")); } });
    out.push({ id: "x-motion", group: "Actions", label: "Toggle reduced motion", run: () => {
      const h = document.documentElement; h.dataset.motion = h.dataset.motion === "reduce" ? "" : "reduce";
      try { localStorage.setItem("noether:motion", h.dataset.motion); } catch { /* ignore */ }
      onToast(h.dataset.motion === "reduce" ? "Reduced motion on" : "Reduced motion off"); onClose();
    } });
    out.push({ id: "x-settings", group: "Actions", label: "Engine settings and capabilities", run: go({ s: "settings" }) });
    return out;
  }, [url, onClose, onToast]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return cmds;
    const words = t.split(/\s+/);
    return cmds.filter((c) => words.every((w) => `${c.label} ${c.group} ${c.hint ?? ""} ${c.keywords ?? ""}`.toLowerCase().includes(w)));
  }, [q, cmds]);
  useEffect(() => setI(0), [q]);

  let lastGroup = "";
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Go to a problem, object or source, or start a bounded task"
          role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={filtered[i] ? `cmd-${i}` : undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setI((v) => Math.min(filtered.length - 1, v + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setI((v) => Math.max(0, v - 1)); }
            if (e.key === "Enter") { e.preventDefault(); filtered[i]?.run(); }
            if (e.key === "Escape") onClose();
          }} />
        <ul id="palette-list" role="listbox">
          {filtered.length === 0 && <li className="grp">No matches. Try a problem name, a curve label like 37a1, or an author.</li>}
          {filtered.map((c, k) => {
            const head = c.group !== lastGroup ? <li className="grp" key={`g-${c.group}`} role="presentation">{c.group}</li> : null;
            lastGroup = c.group;
            return [head, (
              <li key={c.id} role="presentation">
                <button id={`cmd-${k}`} role="option" aria-selected={k === i} onMouseEnter={() => setI(k)} onClick={c.run}>
                  <span>{c.label}</span>{c.hint && <span className="hint">{c.hint}</span>}
                </button>
              </li>
            )];
          })}
        </ul>
      </div>
    </div>
  );
}
