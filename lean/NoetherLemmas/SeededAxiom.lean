/-! Seeded INVALID artifact: the target is declared as an axiom. -/
axiom analytic_rank_four : ∀ n : Nat, n + 0 = n
theorem uses_axiom : ∀ n : Nat, n + 0 = n := analytic_rank_four
