"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const cache = new Map<string, Promise<unknown>>();

export function fetchJson<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
      return r.json();
    }).catch((e) => { cache.delete(url); throw e; }));
  }
  return cache.get(url) as Promise<T>;
}

export function useJson<T>(url: string | null): { data: T | null; error: string | null; loading: boolean } {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: !!url });
  useEffect(() => {
    if (!url) { setState({ data: null, error: null, loading: false }); return; }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchJson<T>(url).then((d) => live && setState({ data: d, error: null, loading: false }))
      .catch((e: Error) => live && setState({ data: null, error: e.message, loading: false }));
    return () => { live = false; };
  }, [url]);
  return state;
}

/** URL-backed state: the address bar is the source of truth for navigation. */
export function useUrlState() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const get = useCallback((k: string) => sp.get(k), [sp]);
  const set = useCallback((patch: Record<string, string | null | undefined>, opts: { push?: boolean } = {}) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (opts.push) router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  }, [sp, router, pathname]);
  return { get, set, params: sp };
}

/** Per-workspace persisted state (viewport, filters, playback), kept in sessionStorage. */
export function usePersisted<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.sessionStorage.getItem(`noether:${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch { return initial; }
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    try { window.sessionStorage.setItem(`noether:${key}`, JSON.stringify(v)); } catch { /* storage unavailable */ }
  }, [key, v]);
  return [v, setV];
}

export function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

export function useReducedMotion(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const upd = () => setR(mq.matches || document.documentElement.dataset.motion === "reduce");
    upd();
    mq.addEventListener("change", upd);
    const mo = new MutationObserver(upd);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    return () => { mq.removeEventListener("change", upd); mo.disconnect(); };
  }, []);
  return r;
}

/** Pause expensive scenes when the tab is hidden or the element is off-screen. */
export function useVisible(ref: React.RefObject<Element | null>): boolean {
  const [vis, setVis] = useState(true);
  useEffect(() => {
    const onVis = () => setVis(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    let io: IntersectionObserver | null = null;
    if (ref.current) {
      io = new IntersectionObserver((e) => setVis(e[0].isIntersecting && !document.hidden));
      io.observe(ref.current);
    }
    return () => { document.removeEventListener("visibilitychange", onVis); io?.disconnect(); };
  }, [ref]);
  return vis;
}

export function useStableId(prefix: string) {
  return useMemo(() => `${prefix}-${Math.random().toString(36).slice(2, 8)}`, [prefix]);
}
