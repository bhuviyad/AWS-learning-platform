-- Minimal lab platform schema for Supabase
-- Run this in the Supabase SQL editor or with the Supabase CLI.

create extension if not exists "pgcrypto";

create table if not exists public.lab_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('starting', 'active', 'stopping', 'expired')),
  start_time timestamptz not null default now(),
  end_time timestamptz not null,
  aws_access_key_id text,
  aws_session_token text,
  aws_region text default 'ap-south-1',
  session_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lab_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  resource_type text,
  resource_id text,
  resource_arn text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lab_sessions_user_id on public.lab_sessions(user_id);
create index if not exists idx_lab_sessions_status on public.lab_sessions(status);
create index if not exists idx_lab_sessions_end_time on public.lab_sessions(end_time);
create index if not exists idx_activity_logs_session_id on public.activity_logs(session_id);
create index if not exists idx_activity_logs_user_id on public.activity_logs(user_id);
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at);

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_lab_sessions_updated_at on public.lab_sessions;
create trigger update_lab_sessions_updated_at
before update on public.lab_sessions
for each row
execute function public.update_updated_at_column();

alter table public.lab_sessions enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "Users can view their own sessions" on public.lab_sessions;
create policy "Users can view their own sessions"
  on public.lab_sessions
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own sessions" on public.lab_sessions;
create policy "Users can insert their own sessions"
  on public.lab_sessions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own sessions" on public.lab_sessions;
create policy "Users can update their own sessions"
  on public.lab_sessions
  for update
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own activity logs" on public.activity_logs;
create policy "Users can view their own activity logs"
  on public.activity_logs
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own activity logs" on public.activity_logs;
create policy "Users can insert their own activity logs"
  on public.activity_logs
  for insert
  with check (auth.uid() = user_id);
