-- Jobs submitted by the hosted site and processed by the scheduled GitHub Actions runner.
create table if not exists cm_analysis_jobs (
  id text primary key,
  url text not null,
  seconds int not null check (seconds between 5 and 120),
  language text,
  target text not null check (target in ('demo', 'library')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  stage text not null default 'Queued',
  progress int not null default 0 check (progress between 0 and 100),
  name text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cm_analysis_jobs_queue on cm_analysis_jobs(status, created_at);
alter table cm_analysis_jobs enable row level security;

create table if not exists cm_analysis_worker (
  id text primary key,
  updated_at timestamptz not null default now()
);
alter table cm_analysis_worker enable row level security;
