-- Caption Mirror: tables for hosted mode (run in Supabase SQL editor or `supabase db push`)
create table if not exists cm_clips (
  name text primary key,
  title text,
  words int,
  duration real,
  published_at timestamptz default now()
);
create table if not exists cm_clip_settings (
  name text primary key,
  intended text
);
create table if not exists cm_participants (
  id uuid primary key,
  name text not null,
  pnum int not null,
  created_at timestamptz default now(),
  data jsonb not null -- full participant record: assigned trials, agency clip, pre/post surveys, agency round
);
create table if not exists cm_responses (
  id uuid primary key,
  created_at timestamptz default now(),
  participant_id uuid not null,
  participant text not null,
  data jsonb not null
);
create index if not exists cm_responses_participant on cm_responses(participant_id);

-- Only the server (service-role key) talks to these tables; block anonymous access.
alter table cm_clips enable row level security;
alter table cm_clip_settings enable row level security;
alter table cm_participants enable row level security;
alter table cm_responses enable row level security;

-- Public bucket for analyzed clips (json + mp4 + thumbnails)
insert into storage.buckets (id, name, public) values ('clips', 'clips', true) on conflict (id) do nothing;
