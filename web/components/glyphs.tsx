import type { ClaimStatus } from "@/lib/registry/problems";

type P = { className?: string; title?: string };

export function ProblemGlyph({ id, className, size = 22 }: { id: string; className?: string; size?: number }) {
  const common = { className, width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.3, "aria-hidden": true } as const;
  switch (id) {
    case "bsd":
      return (
        <svg {...common}>
          <path d="M5.2 12c0-2.3 1.2-3.6 2.6-3.6S10.4 9.7 10.4 12s-1.2 3.6-2.6 3.6S5.2 14.3 5.2 12Z" />
          <path d="M20 3.5c-3 2-5.4 4.6-6.2 8.5.8 3.9 3.2 6.5 6.2 8.5" />
          <circle cx="15.3" cy="7.6" r="1.4" fill="#E5B866" stroke="none" />
        </svg>
      );
    case "riemann":
      return (
        <svg {...common}>
          <path d="M12 2.5v19" strokeDasharray="2 2" />
          <path d="M4 2.5v19M20 2.5v19" opacity=".45" />
          {[6, 10.2, 13.4, 16.9, 19.8].map((y) => <circle key={y} cx="12" cy={y} r="1.15" fill="currentColor" stroke="none" />)}
        </svg>
      );
    case "pnp":
      return (
        <svg {...common}>
          <circle cx="12" cy="4.5" r="1.6" />
          <circle cx="6.5" cy="12" r="1.6" /><circle cx="17.5" cy="12" r="1.6" />
          <circle cx="4" cy="19.5" r="1.4" /><circle cx="9" cy="19.5" r="1.4" /><circle cx="15" cy="19.5" r="1.4" fill="currentColor" /><circle cx="20" cy="19.5" r="1.4" />
          <path d="M11 5.8 7.4 10.7M13 5.8l3.6 4.9M6 13.5l-1.5 4.6M7 13.5l1.5 4.6M17 13.5l-1.5 4.6M18 13.5l1.5 4.6" />
        </svg>
      );
    case "ns":
      return (
        <svg {...common}>
          <path d="M12 12c0-1.2 1.4-1.6 2.2-.8 1.4 1.4.4 3.9-1.8 4-3 .2-4.6-3.2-3-5.8 2-3.2 7-3 8.6.6 1.9 4.2-1.2 8.7-5.8 8.4C6.6 18 4 14.8 4.4 11" />
        </svg>
      );
    case "ym":
      return (
        <svg {...common}>
          <rect x="5" y="5" width="14" height="14" />
          <path d="M12 5h0M9.5 3.5 12 5l-2.5 1.5M19 12l-1.5-2.5M19 12l1.5-2.5" opacity=".9" />
          <path d="M5 12h14M12 5v14" opacity=".35" />
        </svg>
      );
    case "hodge":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="9" ry="5.5" />
          <path d="M7.4 11.4c1.6 1.7 7.6 1.7 9.2 0M8.6 12.6c1.8-1.1 5-1.1 6.8 0" />
          <path d="M3 18.5 21 5.5" stroke="#C99AA6" />
        </svg>
      );
    case "poincare":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <ellipse cx="12" cy="12" rx="8" ry="3" opacity=".6" />
        </svg>
      );
    default:
      return <svg {...common}><circle cx="12" cy="12" r="6" /></svg>;
  }
}

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  "literature-theorem": "Theorem (literature)",
  candidate: "Candidate",
  refuted: "Refuted",
  "numerically-supported": "Numerically supported",
  "conditionally-derived": "Conditional",
  "verified-instance": "Verified instance",
  "independently-reproduced": "Independently reproduced",
  "formally-checked": "Formally checked",
  "externally-reviewed": "Externally reviewed",
  accepted: "Accepted",
  open: "Open",
  blocked: "Blocked",
};

export function StatusGlyph({ status, className }: { status: ClaimStatus | "illustrative" | "exact" | "numerical" | "conditional"; className?: string }) {
  const c = { className, width: 12, height: 12, viewBox: "0 0 12 12", "aria-hidden": true, style: { flex: "none" } } as const;
  switch (status) {
    case "literature-theorem":
    case "accepted":
    case "exact":
      return <svg {...c}><circle cx="6" cy="6" r="4.6" fill="var(--success)" /></svg>;
    case "verified-instance":
    case "independently-reproduced":
      return <svg {...c}><path d="M6 1.2 10.8 6 6 10.8 1.2 6Z" fill="var(--success)" /></svg>;
    case "formally-checked":
      return <svg {...c}><rect x="1.8" y="1.8" width="8.4" height="8.4" fill="var(--success)" /></svg>;
    case "externally-reviewed":
      return <svg {...c}><circle cx="6" cy="6" r="4.4" fill="none" stroke="var(--success)" strokeWidth="1.4" /><circle cx="6" cy="6" r="1.9" fill="var(--success)" /></svg>;
    case "numerically-supported":
    case "numerical":
      return <svg {...c}><circle cx="6" cy="6" r="4.4" fill="none" stroke="var(--cobalt)" strokeWidth="1.4" /><path d="M6 1.6a4.4 4.4 0 0 1 0 8.8Z" fill="var(--cobalt)" /></svg>;
    case "conditionally-derived":
    case "conditional":
      return <svg {...c}><circle cx="6" cy="6" r="4.4" fill="none" stroke="var(--amber)" strokeWidth="1.4" strokeDasharray="2 1.6" /></svg>;
    case "candidate":
      return <svg {...c}><circle cx="6" cy="6" r="4.4" fill="none" stroke="var(--text-2)" strokeWidth="1.4" /></svg>;
    case "refuted":
      return <svg {...c}><path d="M2.4 2.4 9.6 9.6M9.6 2.4 2.4 9.6" stroke="var(--rejected)" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "blocked":
      return <svg {...c}><circle cx="6" cy="6" r="4.4" fill="none" stroke="var(--amber)" strokeWidth="1.4" /><path d="M3 9 9 3" stroke="var(--amber)" strokeWidth="1.4" /></svg>;
    case "open":
      return <svg {...c}><circle cx="6" cy="6" r="4.6" fill="none" stroke="var(--text)" strokeWidth="1.2" /><circle cx="6" cy="6" r="2.2" fill="none" stroke="var(--text)" strokeWidth="1.2" /></svg>;
    case "illustrative":
      return <svg {...c}><path d="M6 1.4 10.6 6 6 10.6 1.4 6Z" fill="none" stroke="var(--amber)" strokeWidth="1.3" strokeDasharray="1.8 1.4" /></svg>;
    default:
      return <svg {...c}><circle cx="6" cy="6" r="4" fill="var(--muted)" /></svg>;
  }
}

export function StatusMark({ status, label }: { status: ClaimStatus; label?: string }) {
  return (
    <span className="mark">
      <StatusGlyph status={status} />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

export type Exactness = "exact" | "numerical" | "conditional" | "illustrative" | "database" | "mixed" | "text";
export function ExactnessTag({ kind }: { kind: Exactness }) {
  const label = { exact: "Exact", numerical: "Numerical", conditional: "Conditional", illustrative: "Illustration", database: "Database fact", mixed: "Exact and numerical", text: "Log or record" }[kind];
  const g = kind === "database" ? "externally-reviewed" : kind === "mixed" ? "numerical" : kind;
  return (
    <span className="tag" title={kind === "mixed" ? "Contains exact values (integers, rationals, descent bounds) and numerical ones (L-values, regulators)" : kind === "text" ? "A log or text record; it carries no mathematical value of its own" : undefined}>
      {kind !== "text" && <StatusGlyph status={g as never} />}
      {label}
    </span>
  );
}
export function toExactness(v: string | undefined | null): Exactness {
  return (["exact", "numerical", "conditional", "illustrative", "database", "mixed", "text"] as const).find((k) => k === v) ?? "numerical";
}

export function Icon({ name, className, title }: P & { name: string }) {
  const c = { className, width: 18, height: 18, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": title ? undefined : true, role: title ? "img" : undefined } as const;
  const t = title ? <title>{title}</title> : null;
  switch (name) {
    case "atlas": return <svg {...c}>{t}<circle cx="10" cy="10" r="7" /><path d="M3 10h14M10 3c2.2 2.3 2.2 11.7 0 14M10 3c-2.2 2.3-2.2 11.7 0 14" /></svg>;
    case "research": return <svg {...c}>{t}<rect x="3" y="4" width="4" height="12" rx="1" /><rect x="8.5" y="4" width="4" height="8" rx="1" /><rect x="14" y="4" width="3" height="5" rx="1" /></svg>;
    case "sources": return <svg {...c}>{t}<path d="M4 3.5h8.5L16 7v9.5H4z" /><path d="M12 3.5V7h4M7 10h6M7 13h6" /></svg>;
    case "proofs": return <svg {...c}>{t}<circle cx="5" cy="5" r="2" /><circle cx="15" cy="5" r="2" /><circle cx="10" cy="15" r="2" /><path d="M6.3 6.6 9 13.2M13.7 6.6 11 13.2" /></svg>;
    case "runs": return <svg {...c}>{t}<path d="M3 10h3l2-5 4 10 2-5h3" /></svg>;
    case "settings": return <svg {...c}>{t}<path d="M4 6h12M4 14h12" /><circle cx="8" cy="6" r="2" fill="var(--bg)" /><circle cx="13" cy="14" r="2" fill="var(--bg)" /></svg>;
    case "search": return <svg {...c}>{t}<circle cx="9" cy="9" r="5.5" /><path d="m13.2 13.2 3.6 3.6" /></svg>;
    case "plus": return <svg {...c}>{t}<path d="M10 4v12M4 10h12" /></svg>;
    case "minus": return <svg {...c}>{t}<path d="M4 10h12" /></svg>;
    case "reset": return <svg {...c}>{t}<path d="M4.5 9A5.5 5.5 0 1 1 6 13.5" /><path d="M4 5v4h4" /></svg>;
    case "focus": return <svg {...c}>{t}<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" /></svg>;
    case "export": return <svg {...c}>{t}<path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 14v3h12v-3" /></svg>;
    case "play": return <svg {...c}>{t}<path d="M6 4.5v11l9-5.5z" fill="currentColor" stroke="none" /></svg>;
    case "pause": return <svg {...c}>{t}<path d="M6.5 4.5v11M13.5 4.5v11" strokeWidth="2.2" /></svg>;
    case "step": return <svg {...c}>{t}<path d="M5 4.5v11l7-5.5z" fill="currentColor" stroke="none" /><path d="M15 4.5v11" strokeWidth="1.8" /></svg>;
    case "back": return <svg {...c}>{t}<path d="M15 4.5v11l-7-5.5z" fill="currentColor" stroke="none" /><path d="M5 4.5v11" strokeWidth="1.8" /></svg>;
    case "close": return <svg {...c}>{t}<path d="m5 5 10 10M15 5 5 15" /></svg>;
    case "chev": return <svg {...c}>{t}<path d="m8 5 5 5-5 5" /></svg>;
    case "drawer": return <svg {...c}>{t}<rect x="3" y="4" width="14" height="12" rx="1" /><path d="M12 4v12" /></svg>;
    case "link": return <svg {...c}>{t}<path d="M8.5 11.5 11.5 8.5M7 9 5.5 10.5a2.5 2.5 0 0 0 3.5 3.5L10.5 12.5M13 11l1.5-1.5A2.5 2.5 0 0 0 11 6L9.5 7.5" /></svg>;
    default: return <svg {...c}>{t}<circle cx="10" cy="10" r="6" /></svg>;
  }
}

/** The Zeta aperture: a reticle with an elliptic arc and one rational point. */
export function Aperture({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 28 28" fill="none" aria-hidden>
      <circle cx="14" cy="14" r="12.2" stroke="#263141" strokeWidth="1" />
      <circle cx="14" cy="14" r="8.4" stroke="#3a4a63" strokeWidth="0.8" strokeDasharray="1 2.2" />
      <path d="M21.5 4.8c-3.4 2.2-6 5.2-6.9 9.2.9 4 3.5 7 6.9 9.2" stroke="#6B91FF" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7.4 14c0-2 1-3.2 2.3-3.2s2.3 1.2 2.3 3.2-1 3.2-2.3 3.2-2.3-1.2-2.3-3.2Z" stroke="#6B91FF" strokeWidth="1.3" />
      <circle cx="16.9" cy="9.4" r="1.6" fill="#E5B866" />
    </svg>
  );
}
