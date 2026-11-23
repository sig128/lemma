export interface Derivative { k: number; value: string; status: "zero-theorem" | "numerically-zero" | "nonzero-numerical"; reason: string }

export interface CurveData {
  id: string; cremona_label: string; lmfdb_label: string;
  ainvs: [number, number, number, number, number];
  equation_tex: string; note: string;
  conductor: number; discriminant: string; j_invariant: string;
  torsion: { order: number; structure: number[]; generators: [string, string][]; exactness: string };
  root_number: number;
  local_data: { p: number; conductor_exponent: number; kodaira: string; c_p: number }[];
  tamagawa_product: number;
  rank_bounds: { lower: number; upper: number; sha_2_info_s: number; exactness: string; method: string };
  generators: [string, string][];
  saturation: { bound: number; meaning: string };
  canonical_heights: string[];
  regulator: string;
  analytic: {
    order_numerical: number; leading_derivative: string; leading_over_factorial: string; threshold_eps: string;
    status: "established" | "open"; summary: string; method: string; derivatives_at_1: Derivative[];
  };
  rank_equality: { status: "theorem" | "verified-instance" | "open"; text: string };
  bsd_refinement: { ellbsd_constant: string; sha_analytic: string; meaning: string; exactness: string };
  L_real_samples: { s: number[]; L: number[]; exactness: string };
  point_search: { height_bound: number; points: [string, string][]; count: number; meaning: string; exactness: string };
  generator_combinations: { coeffs: number[]; x: string; y: string }[];
  provenance: Record<string, unknown> & { pari_version: string; realprecision_digits: number; functions: string[]; computed_at: string; wall_seconds: number; script: string };
}

export interface TwistRow {
  d: number; conductor: number; root_number: number; rank_lower: number | null; rank_upper: number | null;
  analytic_order_numerical: number; leading_derivative: number; status: "theorem" | "verified-instance" | "open" | "rank-undetermined";
  route: string | null; sha_analytic: number | null; seconds: number;
}
export interface TwistFamily {
  base: string; family: string; d_bound: number; selection: string; rows: TwistRow[];
  provenance: Record<string, unknown> & { pari_version: string; wall_seconds: number; computed_at: string };
  status_meaning: Record<string, string>;
}

export const CURVE_IDS = ["11a1", "37a1", "389a1", "5077a1", "234446a1"] as const;
export type CurveId = (typeof CURVE_IDS)[number];
export const CURVE_RANK: Record<CurveId, number> = { "11a1": 0, "37a1": 1, "389a1": 2, "5077a1": 3, "234446a1": 4 };

/** Default viewports chosen to show the real components and the first generators. */
export const DEFAULT_VIEW: Record<CurveId, { cx: number; cy: number; sx: number; sy: number }> = {
  "11a1": { cx: 8.5, cy: -2, sx: 15, sy: 72 },
  "37a1": { cx: 1.7, cy: -0.4, sx: 3.7, sy: 4.6 },
  "389a1": { cx: 1.2, cy: -0.5, sx: 4.6, sy: 9.5 },
  "5077a1": { cx: 2.5, cy: 0, sx: 8.5, sy: 30 },
  "234446a1": { cx: 2, cy: 0, sx: 19, sy: 80 },
};
