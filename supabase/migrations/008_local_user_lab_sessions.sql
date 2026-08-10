-- Allow the current local-auth user ids to be tracked alongside optional Supabase Auth users.

alter table if exists lab_sessions
    alter column user_id drop not null;

alter table if exists lab_sessions
    add column if not exists app_user_id text;

create index if not exists idx_lab_sessions_app_user_id
    on lab_sessions(app_user_id);
