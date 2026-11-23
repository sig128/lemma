/-!
Seeded valid lemma (discrete analogue of the parity argument used for BSD):
if a function satisfies f(2 - s) = -f(s) then it vanishes at the centre s = 1.
Scope: integer-valued functions on ℤ. The analytic statement for L(E,s) over ℂ
needs Mathlib and is NOT what this file proves.
-/
theorem center_zero (f : Int → Int) (h : ∀ s, f (2 - s) = - f s) : f 1 = 0 := by
  have h1 := h 1
  simp at h1
  omega
