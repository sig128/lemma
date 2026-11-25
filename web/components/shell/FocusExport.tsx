"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/glyphs";
import { PROBLEM_BY_ID, type ProblemId } from "@/lib/registry/problems";

/* Export: the instrument's own drawing layers (canvas pixels, SVG geometry), with a caption
   carrying the title, URL parameters, a UTC timestamp and a provenance line. HTML overlays
   (KaTeX, legends) are not rasterized; their content is restated in the caption instead. */

const STYLE_PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "font-size", "font-family", "font-weight", "font-style", "text-anchor", "dominant-baseline", "letter-spacing", "visibility", "display"];

function inlineStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  const decl = STYLE_PROPS.map((p) => {
    const v = cs.getPropertyValue(p);
    return p === "font-family" ? `${p}:${v}, ${/serif|Newsreader/i.test(v) && !/sans/i.test(v) ? "Georgia, serif" : "Helvetica, Arial, sans-serif"}` : `${p}:${v}`;
  }).join(";");
  dst.setAttribute("style", decl);
  const a = src.children, b = dst.children;
  for (let i = 0; i < a.length && i < b.length; i++) inlineStyles(a[i], b[i]);
}

function serializeSvg(svg: SVGSVGElement, w: number, h: number) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  clone.querySelectorAll("foreignObject").forEach((f) => f.remove());
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${w} ${h}`);
  return clone;
}

function svgImage(svg: SVGSVGElement, w: number, h: number): Promise<HTMLImageElement> {
  const src = new XMLSerializer().serializeToString(serializeSvg(svg, w, h));
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
  });
}

function caption(problem: string, note: string | null) {
  const u = new URL(window.location.href);
  const p = PROBLEM_BY_ID[problem as ProblemId];
  const params = [...u.searchParams.entries()].filter(([k]) => !["s", "v", "p"].includes(k)).map(([k, v]) => `${k}=${v}`).join(", ");
  const stageTitle = document.querySelector(".stage .stage-title")?.textContent?.trim();
  return {
    title: `${p?.name ?? problem}: ${stageTitle ?? p?.instrument.title ?? "instrument"}`,
    params: `Parameters: ${params || "defaults"}${note ? `. ${note}` : ""}`,
    at: `Exported ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC from ${u.host || "localhost"}`,
    prov: "Provenance: values computed in this view; algorithms, precision and sources are listed in the inspector.",
  };
}

type Layer = HTMLCanvasElement | SVGSVGElement;

/* The export frame is the union of the drawing layers inside the instrument, so chart views
   export their charts rather than a tall page of blank HTML regions. */
function collect(): { layers: Layer[]; r: { left: number; top: number; width: number; height: number }; note: string | null } | null {
  const host = (document.querySelector(".stage [data-export]") ?? document.querySelector(".stage .instrument") ?? document.querySelector(".stage .view-pad")) as HTMLElement | null;
  if (!host) return null;
  const layers = (Array.from(host.querySelectorAll("canvas, svg.scene, svg.chart, svg[data-export-layer]")) as Layer[])
    .filter((l) => { const b = l.getBoundingClientRect(); return b.width > 1 && b.height > 1 && getComputedStyle(l).display !== "none"; });
  if (layers.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of layers) { const b = l.getBoundingClientRect(); x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom); }
  const pad = host.matches(".view-pad") ? 16 : 0;
  // full-stage instruments: drop the empty band under the (unexported) HTML header
  const stage = host.closest(".stage") as HTMLElement | null;
  if (stage && host.matches(".instrument")) {
    const inset = parseFloat(stage.style.getPropertyValue("--inset")) || 0;
    const st = stage.getBoundingClientRect().top;
    if (inset > 80 && y0 <= st + 1) y0 = st + inset - 64;
  }
  return { layers, r: { left: x0 - pad, top: y0 - pad, width: x1 - x0 + 2 * pad, height: y1 - y0 + 2 * pad }, note: host.getAttribute("data-export-note") };
}

export async function exportStage(problem: string, format: "png" | "svg"): Promise<string> {
  const found = collect();
  if (!found) return "Nothing to export here. Open the Explore view of a problem.";
  const { layers, r } = found;
  const cap = caption(problem, found.note);
  const W = Math.max(480, Math.round(r.width)), H = Math.round(r.height), CAP = 84;
  if (format === "svg") {
    const svgs = layers.filter((l): l is SVGSVGElement => l instanceof SVGSVGElement);
    if (svgs.length === 0 || layers.some((l) => l instanceof HTMLCanvasElement)) return "This instrument draws pixels to a canvas. Export it as PNG instead.";
    const ns = "http://www.w3.org/2000/svg";
    const root = document.createElementNS(ns, "svg");
    root.setAttribute("xmlns", ns); root.setAttribute("width", String(W)); root.setAttribute("height", String(H + CAP)); root.setAttribute("viewBox", `0 0 ${W} ${H + CAP}`);
    const bg = document.createElementNS(ns, "rect"); bg.setAttribute("width", String(W)); bg.setAttribute("height", String(H + CAP)); bg.setAttribute("fill", "#080B10"); root.appendChild(bg);
    for (const s of svgs) {
      const sr = s.getBoundingClientRect();
      const g = document.createElementNS(ns, "g"); g.setAttribute("transform", `translate(${sr.left - r.left},${sr.top - r.top})`);
      g.appendChild(serializeSvg(s, Math.round(sr.width), Math.round(sr.height)));
      root.appendChild(g);
    }
    const lines: [string, number, number, string, string][] = [[cap.title, 24, 15, "#F0ECE3", "Newsreader, Georgia, serif"], [cap.params, 44, 12, "#A4AFBF", "IBM Plex Mono, monospace"], [cap.at, 60, 11.5, "#A4AFBF", "IBM Plex Sans, sans-serif"], [cap.prov, 76, 11.5, "#8794A8", "IBM Plex Sans, sans-serif"]];
    for (const [t, dy, size, fill, fam] of lines) {
      const tx = document.createElementNS(ns, "text");
      tx.setAttribute("x", "16"); tx.setAttribute("y", String(H + dy)); tx.setAttribute("font-size", String(size)); tx.setAttribute("fill", fill); tx.setAttribute("font-family", fam); tx.textContent = t; root.appendChild(tx);
    }
    download(new Blob([new XMLSerializer().serializeToString(root)], { type: "image/svg+xml" }), `zeta-${problem}.svg`);
    return "Exported SVG with caption and provenance";
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const out = document.createElement("canvas");
  out.width = Math.round(W * dpr); out.height = Math.round((H + CAP) * dpr);
  const ctx = out.getContext("2d");
  if (!ctx) return "Export failed: this browser could not create a drawing surface.";
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#080B10"; ctx.fillRect(0, 0, W, H + CAP);
  let skipped = 0;
  for (const l of layers) {
    const lr = l.getBoundingClientRect();
    if (lr.width < 1 || lr.height < 1) continue;
    try {
      if (l instanceof HTMLCanvasElement) ctx.drawImage(l, lr.left - r.left, lr.top - r.top, lr.width, lr.height);
      else ctx.drawImage(await svgImage(l, Math.round(lr.width), Math.round(lr.height)), lr.left - r.left, lr.top - r.top, lr.width, lr.height);
    } catch { skipped++; }
  }
  ctx.fillStyle = "#10151E"; ctx.fillRect(0, H, W, CAP);
  ctx.fillStyle = "#273142"; ctx.fillRect(0, H, W, 1);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#F0ECE3"; ctx.font = "15px 'Newsreader Variable', Georgia, serif"; ctx.fillText(cap.title, 16, H + 24, W - 150);
  ctx.fillStyle = "#A4AFBF"; ctx.font = "12px 'IBM Plex Mono', monospace"; ctx.fillText(cap.params, 16, H + 44, W - 32);
  ctx.font = "11.5px 'IBM Plex Sans Variable', sans-serif"; ctx.fillText(cap.at, 16, H + 60, W - 32);
  ctx.fillStyle = "#8794A8"; ctx.fillText(cap.prov, 16, H + 76, W - 32);
  ctx.fillStyle = "#6B91FF"; ctx.font = "13px 'Newsreader Variable', Georgia, serif"; ctx.textAlign = "right"; ctx.fillText("ZETA", W - 16, H + 24);
  const blob = await new Promise<Blob | null>((res) => out.toBlob(res, "image/png"));
  if (!blob) return "Export failed: the image could not be encoded.";
  download(blob, `zeta-${problem}.png`);
  return skipped ? `Exported PNG (${skipped} layer${skipped > 1 ? "s" : ""} could not be drawn)` : "Exported PNG with caption and provenance";
}

function download(b: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

export function useFocusAndExport(problem: string, canFocus: boolean, onToast: (t: string) => void) {
  const [focus, setFocus] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const doExport = useCallback(async (fmt: "png" | "svg") => onToast(await exportStage(problem, fmt)), [problem, onToast]);
  const enter = useCallback(() => {
    if (!canFocus) { onToast("Focus mode is for instruments. Open the Explore view of a problem first."); return; }
    setFocus(true); setDrawer(false);
  }, [canFocus, onToast]);
  useEffect(() => { if (!canFocus) { setFocus(false); setDrawer(false); } }, [canFocus]);
  useEffect(() => {
    const f = () => enter();
    const x = () => { void doExport("png"); };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector(".overlay")) return;
      if (e.key === "Escape") { if (drawer) setDrawer(false); else setFocus(false); }
      if (e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey && !e.altKey) { if (focus) setFocus(false); else enter(); }
    };
    window.addEventListener("noether:focus", f);
    window.addEventListener("noether:export", x);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("noether:focus", f); window.removeEventListener("noether:export", x); window.removeEventListener("keydown", key); };
  }, [doExport, enter, focus, drawer]);
  return { focus, setFocus, drawer, setDrawer, enter, doExport };
}

export function FocusBar({ problem, drawer, onExit, onDrawer, onExport }: { problem: string; drawer: boolean; onExit: () => void; onDrawer: () => void; onExport: () => void }) {
  const p = PROBLEM_BY_ID[problem as ProblemId];
  const curve = typeof window !== "undefined" ? new URL(window.location.href).searchParams.get("curve") : null;
  return (
    <div className="focus-bar" role="region" aria-label="Focus mode">
      <div className="focus-bar-text">
        <span className="focus-bar-title">{p?.name}{curve ? `, curve ${curve}` : ""}</span>
        <span className="dim">{p?.instrument.title}. Official status: {p?.official.label}.</span>
      </div>
      <div className="focus-bar-actions">
        <button className="btn btn-ghost" onClick={onExport}><Icon name="export" />Export PNG</button>
        <button className="btn btn-ghost" aria-pressed={drawer} onClick={onDrawer}><Icon name="drawer" />{drawer ? "Hide inspector" : "Inspector"}</button>
        <button className="btn" onClick={onExit}><Icon name="close" />Exit focus <kbd className="kbd" style={{ marginLeft: 6 }}>Esc</kbd></button>
      </div>
    </div>
  );
}

export function ViewActions({ onFocus, onExport }: { onFocus: () => void; onExport: (f: "png" | "svg") => void }) {
  return (
    <>
      <button className="btn btn-ghost" onClick={() => onExport("png")} title="Export the instrument as PNG with a caption" aria-label="Export PNG"><Icon name="export" /><span className="lbl">PNG</span></button>
      <button className="btn btn-ghost btn-svg" onClick={() => onExport("svg")} title="Export vector geometry where the instrument is drawn in SVG" aria-label="Export SVG"><span className="lbl">SVG</span></button>
      <button className="btn btn-ghost" onClick={onFocus} title="Focus mode (F)" aria-label="Focus mode"><Icon name="focus" /><span className="lbl">Focus</span></button>
    </>
  );
}
