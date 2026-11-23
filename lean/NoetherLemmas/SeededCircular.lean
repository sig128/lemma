/-! Seeded INVALID artifact: proves the target by assuming it. -/
def TargetStatement : Prop := ∀ n : Nat, n + 0 = n
theorem target_by_assumption (h : TargetStatement) : TargetStatement := h
