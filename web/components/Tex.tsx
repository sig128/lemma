"use client";
import katex from "katex";
import { memo, useMemo } from "react";

/** KaTeX with trust disabled: agent- or source-provided TeX is rendered as untrusted input. */
export const Tex = memo(function Tex({ tex, display = false, className }: { tex: string; display?: boolean; className?: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: "ignore", output: "htmlAndMathml", maxSize: 20, maxExpand: 200 });
    } catch {
      return null;
    }
  }, [tex, display]);
  if (html === null) return <code className={className}>{tex}</code>;
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});
