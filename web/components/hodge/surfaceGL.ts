/**
 * WebGL2 ray tracer for the real points of the Clebsch cubic in an affine chart.
 * Along each ray the homogeneous cubic restricts to an exact cubic polynomial
 * in t (coefficients from the chart matrix); its first root inside the
 * bounding sphere is bracketed by sampling and refined by bisection.
 * The 27 lines are drawn as tubes using exact ray-line distances.
 */
export const VERT = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p; gl_Position = vec4(p, 0.0, 1.0); }`;

export const FRAG = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform mat4 M;          // chart -> homogeneous P^3 (y0..y3), columns: X, Y, Z, 1
uniform vec3 eye, fw, rt, up;
uniform float aspect, fov, R, tubeR;
uniform int nLines;
uniform vec3 lp[27]; uniform vec3 lv[27]; uniform float lk[27]; // lk: 0 rational, 1 golden, 2 selected, 3 meets selected, -1 hidden
uniform float showSurface;

float F(vec4 a, vec4 b, float t){ vec4 y = a + t*b; float y4 = -(y.x+y.y+y.z+y.w); return dot(y*y, y) + y4*y4*y4; }
vec3 gradChart(vec4 y){
  float y4 = -(y.x+y.y+y.z+y.w);
  vec4 g = 3.0*(y*y - vec4(y4*y4));
  return vec3(dot(M[0], g), dot(M[1], g), dot(M[2], g));
}
void main(){
  vec3 d = normalize(fw + uv.x*aspect*fov*rt + uv.y*fov*up);
  vec3 bg = vec3(0.031, 0.043, 0.063);
  // bounding sphere
  float bq = dot(eye, d); float cq = dot(eye, eye) - R*R; float disc = bq*bq - cq;
  if (disc < 0.0) { o = vec4(bg, 1.0); return; }
  float sq = sqrt(disc); float t0 = max(-bq - sq, 0.0); float t1 = -bq + sq;
  vec4 a = M * vec4(eye, 1.0); vec4 b = M * vec4(d, 0.0);
  float tHit = 1e9;
  if (showSurface > 0.5) {
    const int STEPS = 72;
    float prev = F(a, b, t0); float tp = t0;
    for (int i = 1; i <= STEPS; i++) {
      float t = t0 + (t1 - t0) * float(i) / float(STEPS);
      float f = F(a, b, t);
      if (sign(f) != sign(prev)) {
        float lo = tp, hi = t, flo = prev;
        for (int k = 0; k < 22; k++) { float mid = 0.5*(lo+hi); float fm = F(a, b, mid); if (sign(fm) == sign(flo)) { lo = mid; flo = fm; } else { hi = mid; } }
        tHit = 0.5*(lo+hi); break;
      }
      prev = f; tp = t;
    }
  }
  // lines
  float tLine = 1e9; float kLine = -1.0;
  for (int i = 0; i < 27; i++) {
    if (i >= nLines) break;
    if (lk[i] < -0.5) continue;
    vec3 v = normalize(lv[i]); vec3 w0 = eye - lp[i];
    float bb = dot(d, v); float dd = dot(d, w0); float ee = dot(v, w0);
    float den = 1.0 - bb*bb; if (den < 1e-6) continue;
    float sc = (bb*ee - dd) / den; float tc = (ee - bb*dd) / den;
    vec3 pr = eye + sc*d; vec3 pl = lp[i] + tc*v;
    float dist = length(pr - pl);
    float rad = tubeR * (lk[i] > 1.5 && lk[i] < 2.5 ? 1.8 : 1.0);
    if (dist < rad && sc > 0.0 && length(pl) < R && sc < tLine && sc < tHit + 0.02) { tLine = sc; kLine = lk[i]; }
  }
  if (kLine > -0.5) {
    vec3 c = kLine > 2.5 ? vec3(0.95, 0.82, 0.55) : kLine > 1.5 ? vec3(0.898, 0.722, 0.4) : kLine > 0.5 ? vec3(0.79, 0.6, 0.65) : vec3(0.93, 0.91, 0.87);
    float fade = 1.0 - smoothstep(R*0.75, R, length(eye + tLine*d));
    o = vec4(mix(bg, c, 0.35 + 0.65*fade), 1.0); return;
  }
  if (tHit < 1e8) {
    vec3 p = eye + tHit*d;
    vec4 y = M * vec4(p, 1.0);
    vec3 n = normalize(gradChart(y));
    bool front = dot(n, -d) > 0.0; if (!front) n = -n;
    vec3 L1 = normalize(vec3(0.5, 0.8, 0.6)); vec3 L2 = normalize(vec3(-0.7, -0.2, 0.4));
    float diff = max(dot(n, L1), 0.0)*0.75 + max(dot(n, L2), 0.0)*0.25;
    float spec = pow(max(dot(reflect(-L1, n), -d), 0.0), 40.0);
    float rim = pow(1.0 - max(dot(n, -d), 0.0), 3.0);
    vec3 base = front ? vec3(0.86, 0.84, 0.79) : vec3(0.62, 0.45, 0.50);
    vec3 col = base*(0.16 + 0.84*diff) + 0.22*spec + 0.18*rim*vec3(0.75, 0.8, 1.0);
    float fade = 1.0 - smoothstep(R*0.82, R, length(p));
    o = vec4(mix(bg, col, 0.25 + 0.75*fade), 1.0); return;
  }
  o = vec4(bg, 1.0);
}`;

export type Mat4 = number[]; // column-major 16

/** 4x4 inverse (column-major). */
export function inv4(m: Mat4): Mat4 {
  const inv = new Array(16).fill(0);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  return inv.map((v) => v / det);
}

export function mulVec(m: Mat4, v: number[]): number[] {
  return [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
}

/** Chart matrices. Columns map chart (X,Y,Z,1) to homogeneous y. */
export function chartMatrix(kind: "tetra" | "generic"): Mat4 {
  const s = 1 / Math.sqrt(3);
  const v = [[s, s, s], [s, -s, -s], [-s, s, -s], [-s, -s, s]]; // regular tetrahedron, sum zero
  const k = 0.55;
  if (kind === "tetra") {
    // y_i = 1/4 + k v_i . p   => sum y_i = 1, i.e. x4 = -1; plane at infinity is x4 = 0
    const m: Mat4 = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) { m[0 + i] = k * v[i][0]; m[4 + i] = k * v[i][1]; m[8 + i] = k * v[i][2]; m[12 + i] = 0.25; }
    return m;
  }
  // generic: compose with a projective map that moves the plane at infinity off every line
  const base = chartMatrix("tetra");
  const P: Mat4 = [1, 0, 0, 0.21, 0, 1, 0, -0.13, 0, 0, 1, 0.17, 0, 0, 0, 1];
  // y = base * P * (X,Y,Z,1): result columns
  const out: Mat4 = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let sum = 0; for (let j = 0; j < 4; j++) sum += base[j * 4 + r] * P[c * 4 + j]; out[c * 4 + r] = sum; }
  return out;
}

export type ChartLine = { id: number; p: [number, number, number]; v: [number, number, number]; atInfinity: boolean };

export function chartLines(M: Mat4, lines: { P: number[]; Q: number[] }[]): ChartLine[] {
  const Mi = inv4(M);
  return lines.map((L, id) => {
    const a = mulVec(Mi, L.P), b = mulVec(Mi, L.Q);
    const eps = 1e-9;
    if (Math.abs(a[3]) < eps && Math.abs(b[3]) < eps) return { id, p: [0, 0, 0], v: [1, 0, 0], atInfinity: true };
    const base = Math.abs(a[3]) > Math.abs(b[3]) ? a : b;
    const p: [number, number, number] = [base[0] / base[3], base[1] / base[3], base[2] / base[3]];
    const dir = [a[3] * b[0] - b[3] * a[0], a[3] * b[1] - b[3] * a[1], a[3] * b[2] - b[3] * a[2]];
    const n = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    return { id, p, v: [dir[0] / n, dir[1] / n, dir[2] / n], atInfinity: false };
  });
}
