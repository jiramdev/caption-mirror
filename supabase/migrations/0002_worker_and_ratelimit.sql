-- Caption Mirror #2: analysis-worker heartbeat + public-demo rate limiting.
-- Run in the Supabase SQL editor (same as 0001). RLS on, no policies: only the server (service-role key) touches these.

-- Where the analysis worker currently is. The worker upserts id='main' every 30 s with the URL of its
-- Cloudflare tunnel; the Vercel site reads it and treats a heartbeat older than ~2.5 min as "offline".
create table if not exists cm_worker (
  id text primary key,
  url text not null,
  updated_at timestamptz not null default now()
);
alter table cm_worker enable row level security;

-- One row per accepted analysis request, used for rate limiting (4/hour per IP, 60/day overall).
create table if not exists cm_job_log (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists cm_job_log_ip_created on cm_job_log (ip, created_at);
create index if not exists cm_job_log_created on cm_job_log (created_at);
alter table cm_job_log enable row level security;
