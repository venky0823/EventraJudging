-- ==========================================================================
-- EVENTRA | IVC PULSE — Supabase Database Schema & Seed Data
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ==========================================================================

-- 1. Teams table
create table if not exists public.teams (
  id text primary key,
  sem text not null,
  name text not null,
  leader text not null,
  members integer not null default 4,
  round text not null default '1',
  deck_url text,
  repo_url text,
  demo_url text,
  created_at timestamptz not null default now()
);

-- 2. Evaluations table (one row per judge + team)
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  team_id text not null references public.teams(id) on delete cascade,
  judge_id text not null default 'judge-04',
  status text not null check (status in ('PENDING', 'DRAFTED', 'EVALUATED')) default 'PENDING',
  scores jsonb not null default '{"innovation":0,"execution":0,"impact":0,"design":0,"pitch":0}'::jsonb,
  total_score integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (team_id, judge_id)
);

-- 3. Enable Row Level Security (RLS)
alter table public.teams enable row level security;
alter table public.evaluations enable row level security;

-- Public read/write policies for demo/anon key (tighten with Supabase Auth in production)
create policy "Allow anon read teams"
  on public.teams for select
  to anon, authenticated
  using (true);

create policy "Allow anon read evaluations"
  on public.evaluations for select
  to anon, authenticated
  using (true);

create policy "Allow anon insert evaluations"
  on public.evaluations for insert
  to anon, authenticated
  with check (true);

create policy "Allow anon update evaluations"
  on public.evaluations for update
  to anon, authenticated
  using (true)
  with check (true);

-- 4. Seed initial teams
insert into public.teams (id, sem, name, leader, members, round, deck_url, repo_url, demo_url) values
  ('cyber-titans',  '1ST SEM', 'CYBER TITANS',  'Keerthana KK',      4, '1', '#deck-cyber-titans',  null,                null),
  ('parallax',      '1ST SEM', 'PARALLAX',      'Lakshya M',         4, '1', '#deck-parallax',      '#repo-parallax',    null),
  ('vs3',           '3RD SEM', 'VS³',           'VINEETH JAGADEESH', 3, '1', '#deck-vs3',           null,                '#demo-vs3'),
  ('fast-track',    '1ST SEM', 'FAST TRACK',    'Yuvaraj S P',       4, '1', '#deck-fast-track',    null,                null),
  ('team-glitch',   '1ST SEM', 'TEAM GLITCH',   'Harman Banga',      3, '2', '#deck-team-glitch',   '#repo-team-glitch', null),
  ('whtt-the-hack', '3RD SEM', 'WHTT THE HACK', 'MAANSI M',          4, '2', '#deck-whtt-the-hack', null,                null),
  ('quadrax',       '3RD SEM', 'QUADRAX',       'Harshini T',        4, '2', '#deck-quadrax',       null,                null),
  ('zero-bug-zone', '1ST SEM', 'ZERO BUG ZONE', 'Nisarga PK',        3, '1', '#deck-zero-bug',      null,                null),
  ('macroheart',    '1ST SEM', 'MACROHEART',    'Rishikesh P',       4, '2', '#deck-macroheart',    null,                null)
on conflict (id) do nothing;
