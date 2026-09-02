-- Support reliable Stop Lab and scheduled cleanup by session id.

alter table if exists lab_sessions
    add column if not exists session_tag text;

alter table if exists lab_sessions
    add column if not exists expiration_time timestamptz;

alter table if exists lab_sessions
    add column if not exists cleanup_state text not null default 'pending';

create index if not exists idx_lab_sessions_expired_cleanup
    on lab_sessions(end_time, cleanup_state);

create unique index if not exists idx_lab_sessions_session_tag_unique
    on lab_sessions(session_tag);
