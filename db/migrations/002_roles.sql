-- Least-privilege roles. Research workers may append events, write artifacts
-- and update their own task rows, but cannot alter the verification policy
-- tables, the audit log or budget limits. Applied only when the migrating
-- user can create roles; otherwise skipped (see README).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'noether_worker') then
    create role noether_worker nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'noether_web') then
    create role noether_web nologin;
  end if;
exception when insufficient_privilege then
  raise notice 'skipping role creation: insufficient privilege';
end $$;

do $$
begin
  -- worker: read most things, append events, write artifacts, manage task execution
  grant select on all tables in schema public to noether_worker;
  grant insert on research_event, artifact, experiment, agent_run, review_record, failed_approach, verification_result, source_document, source_passage, summary, summary_history, statement_label_history to noether_worker;
  grant update (state, blocked_reason, attempts, not_before, lease_owner, lease_expires_at, checkpoint, result, result_sha256, result_summary, started_at, finished_at, updated_at) on research_task to noether_worker;
  grant insert, update on worker, provider_quota to noether_worker;
  grant update (reserved_usd, reserved_tokens, spent_usd, spent_tokens, updated_at) on budget_ledger to noether_worker;
  grant insert, update on budget_reservation to noether_worker;
  grant usage on all sequences in schema public to noether_worker;
  revoke update, delete on research_event, artifact from noether_worker;
  revoke insert, update, delete on strategy_version, evaluation_run, control_flag from noether_worker;
  revoke update (limit_usd, limit_tokens) on budget_ledger from noether_worker;
  -- web: read, control flags, task cancellation and creation
  grant select on all tables in schema public to noether_web;
  grant insert, update on control_flag to noether_web;
  grant insert on research_task, research_event to noether_web;
  grant update (cancel_requested, state, updated_at) on research_task to noether_web;
  grant usage on all sequences in schema public to noether_web;
exception when undefined_object or insufficient_privilege then
  raise notice 'skipping grants';
end $$;
