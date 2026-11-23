import { Fragment } from "react";

/** Role identifiers are upper case in data ("SKEPTIC"); people read "Skeptic". */
export const roleName = (r: string | null | undefined) => (r ? r[0].toUpperCase() + r.slice(1).toLowerCase() : "");

export function ordinal(n: number) {
  const s = n % 100;
  if (s >= 11 && s <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/**
 * Plain text that may contain TeX-style sub/superscripts written by the engine or the registry,
 * such as "ord_{s=1} L(E,s)" or "x^{3}". Renders them as <sub>/<sup>; everything else is text.
 */
export function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  // braced forms anywhere (ord_{s=1}, x^{3}); single-character forms after a letter or bracket (c_p, (s-1)^r)
  const re = /([_^])\{([^{}]*)\}|(?<=[A-Za-z)|\]])([_^])([A-Za-z0-9])(?![A-Za-z0-9_])/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(<Fragment key={i++}>{text.slice(last, m.index)}</Fragment>);
    const op = m[1] ?? m[3], body = m[2] ?? m[4];
    parts.push(op === "_" ? <sub key={i++}>{body}</sub> : <sup key={i++}>{body}</sup>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}

const SUP: Record<string, string> = { "-": "⁻", "+": "", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
/** PARI prints "7.31 E-42" (stored as "7.31 e-42"); people read "7.31 × 10⁻⁴²". Other strings pass through. */
export function sci(s: string) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[eE]\s*([+-]?\d+)\s*$/.exec(s);
  if (!m) return s;
  const exp = String(Number(m[2]));
  return `${m[1]} × 10${exp.split("").map((c) => SUP[c] ?? c).join("")}`;
}
