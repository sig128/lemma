/** OKLCH to sRGB (0..1 per channel, clamped). Björn Ottosson's OKLab matrices. */
export function oklchToRgb(L: number, C: number, hRad: number): [number, number, number] {
  const a = C * Math.cos(hRad), b = C * Math.sin(hRad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const enc = (x: number) => {
    const c = Math.min(1, Math.max(0, x));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };
  return [enc(lin[0]), enc(lin[1]), enc(lin[2])];
}

/**
 * Domain-coloring palette for the phase of a complex value: constant lightness and low chroma
 * in OKLCH, so every phase reads as equally bright and no hue dominates. Lightness is then
 * modulated separately to show the modulus.
 */
export const PHASE_L = 0.68;
export const PHASE_C = 0.07;
export function phaseRgb(theta: number, L = PHASE_L, C = PHASE_C): [number, number, number] {
  return oklchToRgb(L, C, theta + 0.6);
}
