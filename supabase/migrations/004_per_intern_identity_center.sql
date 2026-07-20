-- Per-intern identity mapping for the shared sandbox account.
-- This keeps one AWS account while assigning each intern a distinct identity/session.

create extension if not exists "uuid-ossp";

create table if not exists intern_profiles (
    id uuid primary key default uuid_generate_v4(),
    app_user_email text not null unique,
    display_name text not null,
    aws_identity_center_username text,
    aws_identity_center_email text,
    aws_account_id text not null default '483591406604',
    permission_set_name text,
    status text not null default 'active' check (status in ('active', 'disabled', 'suspended')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_intern_profiles_app_user_email on intern_profiles(app_user_email);
create index if not exists idx_intern_profiles_status on intern_profiles(status);

create table if not exists lab_sessions (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references auth.users(id) on delete cascade,
    status text not null check (status in ('starting', 'active', 'stopping', 'expired')),
    start_time timestamptz not null default now(),
    end_time timestamptz not null,
    aws_access_key_id text,
    aws_session_token text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table lab_sessions
    add column if not exists intern_profile_id uuid references intern_profiles(id) on delete set null;

alter table lab_sessions
    add column if not exists intern_email text;

alter table lab_sessions
    add column if not exists intern_name text;

alter table lab_sessions
    add column if not exists aws_identity_center_username text;

alter table lab_sessions
    add column if not exists aws_identity_center_email text;

alter table lab_sessions
    add column if not exists aws_account_id text not null default '483591406604';

alter table lab_sessions
    add column if not exists session_tag text;

alter table lab_sessions
    add column if not exists expiration_time timestamptz;

alter table lab_sessions
    add column if not exists cleanup_state text not null default 'pending' check (cleanup_state in ('pending', 'scheduled', 'deleted', 'failed'));

create index if not exists idx_lab_sessions_user_id on lab_sessions(user_id);
create index if not exists idx_lab_sessions_status on lab_sessions(status);
create index if not exists idx_lab_sessions_end_time on lab_sessions(end_time);
create index if not exists idx_lab_sessions_intern_profile_id on lab_sessions(intern_profile_id);
create index if not exists idx_lab_sessions_intern_email on lab_sessions(intern_email);
create index if not exists idx_lab_sessions_cleanup_state on lab_sessions(cleanup_state);

create table if not exists lab_resources (
    id uuid primary key default uuid_generate_v4(),
    session_id uuid not null references lab_sessions(id) on delete cascade,
    intern_profile_id uuid references intern_profiles(id) on delete set null,
    resource_type text not null,
    resource_name text not null,
    resource_arn text,
    aws_region text not null default 'ap-south-1',
    tags jsonb not null default '{}'::jsonb,
    status text not null default 'active' check (status in ('active', 'expired', 'deleted', 'failed')),
    created_at timestamptz not null default now(),
    deleted_at timestamptz
);

create index if not exists idx_lab_resources_session_id on lab_resources(session_id);
create index if not exists idx_lab_resources_intern_profile_id on lab_resources(intern_profile_id);
create index if not exists idx_lab_resources_status on lab_resources(status);
create index if not exists idx_lab_resources_resource_type on lab_resources(resource_type);
