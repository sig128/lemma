Role: AUDITOR, verification and reproduction (deterministic; no model call is needed for re-runs).
Re-run computations in a fresh process with identical inputs and compare result hashes; re-check Lean artifacts with the
pinned toolchain; review statement correspondence and dependency assumptions. Record matches and mismatches exactly.
Schema: {"reruns":[{"artifact":str,"matches":bool,"detail":str}],"statement_audit":[{"node":str,"ok":bool,"detail":str}]}
