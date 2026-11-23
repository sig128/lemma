-- NOETHER schema, version 1.
-- Mutable labels live in rows that keep a history table; run artifacts and the
-- event log are immutable (enforced by triggers below).

create extension if not exists pgcrypto;

create table if not exists problem_definition (
  id text primary key,
  name text not null,
  definition jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists problem_status_snapshot (
  id bigserial primary key,
  problem_id text not null references problem_definition(id),
  kind text not null check (kind in ('official', 'community', 'campaign')),
  label text not null,
  summary text,
  source_ids text[] not null default '{}',
  verified_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create table if not exists research_campaign (
  id text primary key,
  problem_id text not null,
  title text not null,
  objective text not null,
  state text not null default 'idle' check (state in ('idle', 'running', 'waiting', 'paused', 'completed', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists research_task (
  id text primary key,
  campaign_id text references research_campaign(id),
  problem_id text not null,
  role text not null,
  preset text not null,
  objective text not null,
  question text not null,
  inputs jsonb not null default '{}',
  allowed_tools text[] not null default '{}',
  limits jsonb not null,                       -- {seconds, tokens, usd, memory_mb}
  success_criteria text not null,
  failure_criteria text not null,
  expected_artifacts text[] not null default '{}',
  state text not null default 'queued' check (state in ('queued', 'running', 'waiting', 'paused', 'failed', 'canceled', 'completed', 'blocked', 'dead')),
  blocked_reason text,
  priority double precision not null default 0,
  depends_on text[] not null default '{}',
  idempotency_key text unique,
  attempts int not null default 0,
  max_attempts int not null default 3,
  not_before timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  cancel_requested boolean not null default false,
  checkpoint jsonb,
  result jsonb,
  result_sha256 text,
  result_summary text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists research_task_dispatch on research_task (state, not_before, priority desc);

create table if not exists agent_run (
  id text primary key,
  task_id text not null references research_task(id),
  role text not null,
  worker_id text,
  attempt int not null,
  strategy_id text,
  model text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text,
  usage jsonb,
  log_artifact text
);

create table if not exists worker (
  id text primary key,
  host text,
  pid int,
  role_pool text not null default 'shared',
  version text,
  capabilities jsonb not null default '{}',
  started_at timestamptz not null default now(),
  last_heartbeat timestamptz not null default now()
);

create table if not exists control_flag (
  scope text primary key,  -- 'global' or 'problem:<id>'
  paused boolean not null default false,
  reason text,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Shared provider quotas (e.g. arXiv: one request every 3 s across all workers).
create table if not exists provider_quota (
  provider text primary key,
  min_interval_ms int not null,
  last_request_at timestamptz
);

create table if not exists budget_ledger (
  id text primary key,
  scope text not null,
  period text not null,
  limit_usd numeric(12,4) not null,
  limit_tokens bigint not null,
  spent_usd numeric(12,4) not null default 0,
  spent_tokens bigint not null default 0,
  reserved_usd numeric(12,4) not null default 0,
  reserved_tokens bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (scope, period),
  check (spent_usd + reserved_usd <= limit_usd + 0.0001),
  check (spent_tokens + reserved_tokens <= limit_tokens)
);

create table if not exists budget_reservation (
  id text primary key,
  ledger_id text not null references budget_ledger(id),
  task_id text,
  est_usd numeric(12,4) not null,
  est_tokens bigint not null,
  state text not null check (state in ('held', 'reconciled', 'released', 'uncertain')),
  actual_usd numeric(12,4),
  actual_tokens bigint,
  created_at timestamptz not null default now(),
  reconciled_at timestamptz
);

create table if not exists source_document (
  id text primary key,
  canonical_url text not null,
  title text not null,
  authors text[] not null,
  year int,
  doi text,
  arxiv_id text,
  arxiv_version text,
  kind text,
  publication_status text,
  license text,
  retrieval_status text not null default 'metadata-only',
  retrieved_at timestamptz,
  content_sha256 text,
  etag text,
  last_modified text,
  superseded_by text,
  retracted boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create unique index if not exists source_arxiv_version on source_document (arxiv_id, arxiv_version) where arxiv_id is not null;

create table if not exists source_passage (
  id text primary key,
  source_id text not null references source_document(id),
  anchor text not null,
  kind text not null check (kind in ('quote', 'paraphrase', 'extract')),
  text text not null,
  sha256 text not null,
  created_at timestamptz not null default now()
);

create table if not exists mathematical_statement (
  id text primary key,
  problem_id text,
  kind text not null,
  title text not null,
  statement text not null,
  tex text,
  scope text,
  sha256 text not null,
  version int not null default 1,
  status text not null,
  novelty text not null default 'unchecked',
  origin_run text,
  stale boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists statement_label_history (
  id bigserial primary key,
  statement_id text not null references mathematical_statement(id),
  old_status text,
  new_status text not null,
  reason text not null,
  event_seq bigint,
  changed_at timestamptz not null default now()
);

create table if not exists assumption (
  id text primary key,
  statement_id text not null references mathematical_statement(id),
  text text not null,
  kind text
);

create table if not exists dependency_edge (
  id bigserial primary key,
  src text not null,
  dst text not null,
  type text not null check (type in ('depends-on', 'assumes', 'supports', 'contradicts', 'specializes', 'cites', 'equivalent-under', 'attempted-by', 'checked-by')),
  note text,
  created_at timestamptz not null default now(),
  unique (src, dst, type)
);

create table if not exists summary (
  id text primary key,
  subject_id text not null,
  text text not null,
  based_on text[] not null,        -- source/passage ids with hashes "id@sha"
  stale boolean not null default false,
  stale_reason text,
  version int not null default 1,
  created_at timestamptz not null default now()
);
create table if not exists summary_history (
  id bigserial primary key,
  summary_id text not null,
  text text not null,
  based_on text[] not null,
  version int not null,
  archived_at timestamptz not null default now()
);

create table if not exists artifact (
  id text primary key,
  sha256 text not null unique,
  kind text not null,
  title text,
  task_id text,
  exactness text check (exactness in ('exact', 'numerical', 'conditional', 'mixed', 'text')),
  conditional_flags text[] not null default '{}',
  uri text,
  bytes bigint,
  reproducer text,
  data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists experiment (
  id text primary key,
  task_id text references research_task(id),
  kind text not null,
  code_sha256 text,
  params jsonb not null,
  exactness text not null,
  conditional_flags text[] not null default '{}',
  started_at timestamptz,
  finished_at timestamptz,
  exit_code int,
  stdout_artifact text,
  stderr_artifact text,
  output_artifact text
);

create table if not exists verification_result (
  id text primary key,
  statement_id text,
  statement_sha256 text not null,
  kind text not null check (kind in ('lean', 'computation')),
  result text not null check (result in ('passed', 'failed', 'rejected', 'flagged')),
  scope text,
  toolchain jsonb,
  axioms text[],
  findings text[],
  reproducer text,
  log_artifact text,
  reviewer text,
  checked_at timestamptz not null default now()
);

create table if not exists review_record (
  id text primary key,
  target_id text not null,
  reviewer_role text not null,
  fresh_context boolean not null,
  verdict text not null check (verdict in ('accept', 'reject', 'needs-work')),
  findings jsonb,
  created_at timestamptz not null default now()
);

create table if not exists failed_approach (
  id text primary key,
  problem_id text,
  statement_id text,
  what text not null,
  where_failed text,
  minimal_example text,
  failure_kind text check (failure_kind in ('mathematical', 'numerical', 'tooling', 'access')),
  retry_conditions text,
  related text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists strategy_version (
  id text primary key,
  role text not null,
  version int not null,
  prompt_sha256 text not null,
  parent text,
  status text not null check (status in ('candidate', 'active', 'retired', 'rolled-back')),
  created_at timestamptz not null default now(),
  unique (role, version)
);

create table if not exists evaluation_run (
  id text primary key,
  strategy_id text references strategy_version(id),
  suite text not null,
  split text not null check (split in ('dev', 'heldout')),
  n int not null,
  correct int not null,
  false_positives int not null,
  gaps_found int not null default 0,
  cost_usd numeric(12,4) not null default 0,
  budget_usd numeric(12,4) not null,
  metrics jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists research_event (
  seq bigserial primary key,
  event_id uuid not null unique,
  ts timestamptz not null default clock_timestamp(),
  schema_version int not null default 1,
  type text not null,
  project_id text not null default 'noether',
  problem_id text not null,
  campaign_id text,
  task_id text,
  run_id text,
  actor jsonb not null,
  artifacts jsonb not null default '[]',
  summary text not null,
  provenance jsonb not null default '{}',
  verification jsonb,
  view jsonb
);
create index if not exists research_event_problem on research_event (problem_id, seq);

create or replace function noether_forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;

drop trigger if exists research_event_append_only on research_event;
create trigger research_event_append_only before update or delete on research_event
  for each row execute function noether_forbid_mutation();

drop trigger if exists artifact_immutable on artifact;
create trigger artifact_immutable before update or delete on artifact
  for each row execute function noether_forbid_mutation();

create or replace function noether_notify_event() returns trigger language plpgsql as $$
begin
  perform pg_notify('research_event', new.seq::text);
  return new;
end $$;
drop trigger if exists research_event_notify on research_event;
create trigger research_event_notify after insert on research_event
  for each row execute function noether_notify_event();
