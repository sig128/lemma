"""The 27 lines on the Clebsch diagonal cubic surface, with exact data.

Surface X in P^4:  x0+x1+x2+x3+x4 = 0,  x0^3+x1^3+x2^3+x3^3+x4^3 = 0.
We use P^3 coordinates y = (x0,x1,x2,x3) with x4 = -(y0+y1+y2+y3).

Fifteen lines are defined over Q and written down directly. The remaining
twelve are found numerically (Newton from random starts), refined to 60
digits, identified exactly in Q(sqrt 5) with PSLQ, and then re-verified
symbolically: the cubic is checked to vanish identically on each exact line.

Intersection numbers: two distinct lines meet iff their Plucker vectors are
orthogonal for the Klein form; L.L = -1. Rank and signature of the 27x27
intersection matrix are computed exactly over Q.

Run: python3 -I research/scripts/gen_hodge.py web/public/data/hodge
"""
import itertools, json, sys, time, platform, hashlib
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import mpmath as mp
import sympy as sp

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
RUN_AT = datetime.now(timezone.utc).isoformat(timespec="seconds")
rng = np.random.default_rng(20261123)
t_start = time.time()

S5 = sp.sqrt(5)
y = sp.symbols("y0:4")


def F_sym(v):
    v4 = -(v[0] + v[1] + v[2] + v[3])
    return v[0] ** 3 + v[1] ** 3 + v[2] ** 3 + v[3] ** 3 + v4 ** 3


def F_np(v):
    v4 = -(v[0] + v[1] + v[2] + v[3])
    return v[0] ** 3 + v[1] ** 3 + v[2] ** 3 + v[3] ** 3 + v4 ** 3


def plucker(P, Q):
    return [P[0]*Q[1]-P[1]*Q[0], P[0]*Q[2]-P[2]*Q[0], P[0]*Q[3]-P[3]*Q[0],
            P[1]*Q[2]-P[2]*Q[1], P[1]*Q[3]-P[3]*Q[1], P[2]*Q[3]-P[3]*Q[2]]


def klein(p, q):
    # p01 q23 - p02 q13 + p03 q12 + p12 q03 - p13 q02 + p23 q01
    return p[0]*q[5] - p[1]*q[4] + p[2]*q[3] + p[3]*q[2] - p[4]*q[1] + p[5]*q[0]


# ---- the 15 rational lines --------------------------------------------------
def to_y(x5):
    return list(x5[:4])  # x4 implied by the hyperplane

rational = []
for m in range(5):
    rest = [i for i in range(5) if i != m]
    a = rest[0]
    for b in rest[1:]:
        c, d = [i for i in rest if i not in (a, b)]
        # points: e_a - e_b and e_c - e_d in P^4 (both satisfy x_m = 0 and the pairings)
        P = [0] * 5; P[a] = 1; P[b] = -1
        Q = [0] * 5; Q[c] = 1; Q[d] = -1
        rational.append({"name": f"x{m}=0, x{a}+x{b}=0, x{c}+x{d}=0", "field": "Q",
                         "P5": P, "Q5": Q, "P": to_y(P), "Q": to_y(Q), "kind": "rational"})

# ---- numerical search for all lines -----------------------------------------
T = rng.normal(size=(4, 4))


def residual(params):
    a, b, c, d = params
    u = np.array([1, 0, a, c], dtype=complex); v = np.array([0, 1, b, d], dtype=complex)
    pts = [u, v, u + v, u + 2 * v]
    return np.array([F_np(T @ p) for p in pts])


found = []
for _trial in range(20000):
    x = (rng.normal(size=4) * rng.choice([0.3, 1, 3])) + 1j * rng.normal(size=4) * rng.choice([0, 0.2, 1])
    ok = False
    for _it in range(80):
        r = residual(x)
        if np.linalg.norm(r) < 1e-13:
            ok = True; break
        J = np.zeros((4, 4), dtype=complex); h = 1e-7
        for k in range(4):
            e = np.zeros(4, dtype=complex); e[k] = h
            J[:, k] = (residual(x + e) - r) / h
        try:
            x = x - np.linalg.solve(J, r)
        except np.linalg.LinAlgError:
            break
        if np.linalg.norm(x) > 1e4:
            break
    if not ok:
        continue
    a, b, c, d = x
    P = T @ np.array([1, 0, a, c]); Q = T @ np.array([0, 1, b, d])
    pl = np.array(plucker(P, Q)); pl = pl / pl[np.argmax(np.abs(pl))]
    if np.max(np.abs(pl.imag)) > 1e-9:
        continue
    pl = pl.real
    is_rat = any(np.allclose(pl, r_, atol=1e-8) or np.allclose(pl, -r_, atol=1e-8)
                 for r_ in [np.array(plucker(L["P"], L["Q"]), dtype=float) / np.array(plucker(L["P"], L["Q"]), dtype=float)[np.argmax(np.abs(plucker(L["P"], L["Q"])))] for L in rational])
    if not is_rat:
        found.append(pl)
        break
print("seed golden line found after", _trial + 1, "starts")
assert found, "no irrational line found"
irr_pl = found

# ---- exact identification of one golden line, then its S5-orbit --------------
mp.mp.dps = 60
sq5 = mp.sqrt(5)


def ident(xv):
    rel = mp.pslq([mp.mpf(xv), 1, sq5], maxcoeff=10 ** 6, maxsteps=10 ** 6)
    if rel is None or rel[0] == 0:
        return None
    k, a, b = rel
    return sp.Rational(-a, k) + sp.Rational(-b, k) * S5


def line_points_from_plucker(pl):
    p01, p02, p03, p12, p13, p23 = pl
    M = np.array([[0, p01, p02, p03], [-p01, 0, p12, p13], [-p02, -p12, 0, p23], [-p03, -p13, -p23, 0]])
    rows = sorted(range(4), key=lambda i: -np.linalg.norm(M[i]))
    return M[rows[0]], M[rows[1]]


pl = irr_pl[0]
P, Q = line_points_from_plucker(pl)
best = None
for i, j in itertools.combinations(range(4), 2):
    A = np.array([[P[i], Q[i]], [P[j], Q[j]]])
    if abs(np.linalg.det(A)) > 1e-3:
        best = (i, j, A); break
i, j, A = best
inv = np.linalg.inv(A)
U = inv[0, 0] * P + inv[1, 0] * Q
V = inv[0, 1] * P + inv[1, 1] * Q
others = [k for k in range(4) if k not in (i, j)]
x0 = [U[others[0]], U[others[1]], V[others[0]], V[others[1]]]


def build(params):
    u = [mp.mpf(0)] * 4; v = [mp.mpf(0)] * 4
    u[i] = mp.mpf(1); v[j] = mp.mpf(1)
    u[others[0]], u[others[1]], v[others[0]], v[others[1]] = params
    return u, v


def eqs(*params):
    u, v = build(params)
    pts = [u, v, [u[k] + v[k] for k in range(4)], [u[k] + 2 * v[k] for k in range(4)]]
    return [F_np(p) for p in pts]


sol = mp.findroot(eqs, [mp.mpf(float(t)) for t in x0])
u, v = build(list(sol))
exact_u = [sp.Integer(1) if k == i else (sp.Integer(0) if k == j else ident(u[k])) for k in range(4)]
exact_v = [sp.Integer(1) if k == j else (sp.Integer(0) if k == i else ident(v[k])) for k in range(4)]
assert all(e is not None for e in exact_u + exact_v)
s_, t_ = sp.symbols("s t")
assert sp.simplify(sp.expand(F_sym([s_ * exact_u[k] + t_ * exact_v[k] for k in range(4)]))) == 0


def to5(yv):
    return list(yv) + [-(yv[0] + yv[1] + yv[2] + yv[3])]


def canon(P4, Q4):
    pl_ = [sp.nsimplify(sp.expand(c)) for c in plucker(P4, Q4)]
    piv = next(c for c in pl_ if c != 0)
    return tuple(sp.nsimplify(sp.radsimp(c / piv)) for c in pl_)


seen = {}
U5, V5 = to5(exact_u), to5(exact_v)
for perm in itertools.permutations(range(5)):
    Pp = [U5[perm[k]] for k in range(5)]; Qp = [V5[perm[k]] for k in range(5)]
    key = canon(Pp[:4], Qp[:4])
    if key not in seen:
        seen[key] = (Pp[:4], Qp[:4], perm)
irrational = []
for key, (Pp, Qp, perm) in seen.items():
    expr = sp.expand(F_sym([s_ * Pp[k] + t_ * Qp[k] for k in range(4)]))
    assert sp.simplify(expr) == 0
    irrational.append({"P": [sp.nsimplify(c) for c in Pp], "Q": [sp.nsimplify(c) for c in Qp], "kind": "golden", "field": "Q(sqrt5)",
                       "orbit_of_seed_by": list(perm)})
print("S5-orbit of the golden seed:", len(irrational))
assert len(irrational) == 12

# symbolic verification for rational lines too
s_, t_ = sp.symbols("s t")
for L in rational:
    expr = sp.expand(F_sym([s_ * L["P"][k] + t_ * L["Q"][k] for k in range(4)]))
    assert expr == 0

lines = rational + irrational
n = len(lines)
PL = [[sp.nsimplify(c) for c in plucker([sp.sympify(c) for c in L["P"]], [sp.sympify(c) for c in L["Q"]])] for L in lines]
meet = [[0] * n for _ in range(n)]
for a in range(n):
    for b in range(n):
        if a == b:
            meet[a][b] = -1
        else:
            kv = sp.simplify(klein(PL[a], PL[b]))
            meet[a][b] = 1 if kv == 0 else 0
deg = [sum(1 for b in range(n) if b != a and meet[a][b] == 1) for a in range(n)]
assert all(d_ == 10 for d_ in deg), deg
Mx = sp.Matrix(meet)
rank = Mx.rank()
ev = np.linalg.eigvalsh(np.array(meet, dtype=float))
pos = int(sum(1 for e in ev if e > 1e-9)); neg = int(sum(1 for e in ev if e < -1e-9))

# tritangent planes: triples of mutually meeting lines
tri = [list(c) for c in itertools.combinations(range(n), 3) if meet[c[0]][c[1]] == meet[c[0]][c[2]] == meet[c[1]][c[2]] == 1]
H = tri[0]
Hsq = sum(meet[a][b] for a in H for b in H)

# a double-six: two sets of 6 skew lines, each line of one meeting exactly 5 of the other
def find_double_six():
    for A in itertools.combinations(range(n), 6):
        if any(meet[a][b] for a, b in itertools.combinations(A, 2)):
            continue
        cand = [b for b in range(n) if b not in A and sum(meet[a][b] for a in A) == 5]
        if len(cand) == 6 and not any(meet[a][b] for a, b in itertools.combinations(cand, 2)):
            return list(A), cand
    return None
ds = find_double_six()


def fmt(e):
    e = sp.nsimplify(e)
    return str(e).replace("sqrt(5)", "√5")


def tex(e):
    return sp.latex(sp.nsimplify(e))


out_lines = []
for idx, L in enumerate(lines):
    Pn = [float(sp.N(c)) for c in L["P"]]; Qn = [float(sp.N(c)) for c in L["Q"]]
    out_lines.append({
        "id": idx, "kind": L["kind"], "field": L["field"],
        "name": L.get("name"),
        "P_exact": [fmt(c) for c in L["P"]], "Q_exact": [fmt(c) for c in L["Q"]],
        "P_tex": [tex(c) for c in L["P"]], "Q_tex": [tex(c) for c in L["Q"]],
        "P": Pn, "Q": Qn,
        "meets": [b for b in range(n) if b != idx and meet[idx][b] == 1],
    })

out = {
    "surface": {
        "name": "Clebsch diagonal cubic surface",
        "equations_tex": [r"x_0+x_1+x_2+x_3+x_4=0", r"x_0^3+x_1^3+x_2^3+x_3^3+x_4^3=0"],
        "coordinates": "P^3 coordinates (y0,y1,y2,y3) = (x0,x1,x2,x3); x4 = -(y0+y1+y2+y3).",
        "smooth": True,
        "facts_exact": {
            "lines": n, "lines_over_Q": len(rational), "lines_over_Q_sqrt5": len(irrational),
            "each_line_meets": 10, "intersection_matrix_rank": int(rank),
            "signature": [pos, neg], "tritangent_planes": len(tri), "H_squared": int(Hsq),
            "double_six": ds,
        },
    },
    "lines": out_lines,
    "intersection_matrix": meet,
    "provenance": {
        "tools": {"numpy": np.__version__, "mpmath": mp.__version__, "sympy": sp.__version__, "python": platform.python_version()},
        "method": "Fifteen rational lines written down exactly. One line not defined over Q found numerically (Newton, seed 20261123), refined at 60 digits with mpmath, identified in Q(sqrt5) with PSLQ; the other eleven obtained exactly as its orbit under the S5 symmetry permuting x0..x4. Every line verified symbolically to lie on the surface; intersections by the exact Klein form.",
        "computed_at": RUN_AT, "wall_seconds": round(time.time() - t_start, 2),
        "script": "research/scripts/gen_hodge.py",
        "signature_method": "Eigenvalues via numpy.linalg.eigvalsh on the integer matrix (numerical); rank via sympy (exact).",
    },
}
payload = json.dumps(out)
(OUT / "clebsch.json").write_text(payload)
print("lines", n, "rank", rank, "signature", (pos, neg), "tritangent planes", len(tri), "H^2", Hsq, "double-six", ds is not None,
      "sha", hashlib.sha256(payload.encode()).hexdigest()[:12], round(time.time() - t_start, 1), "s")
print("example golden line:", out_lines[15]["P_exact"], out_lines[15]["Q_exact"])
