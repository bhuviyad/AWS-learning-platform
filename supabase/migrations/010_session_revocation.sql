-- Track per-session AWS credential revocation attempts and outcomes.

alter table if exists lab_sessions
    add column if not exists revoked_at timestamptz;

alter table if exists lab_sessions
    add column if not exists revocation_state text not null default 'not_requested';

alter table if exists lab_sessions
    add column if not exists revocation_error text;

alter table if exists lab_sessions
    drop constraint if exists lab_sessions_revocation_state_check;

alter table if exists lab_sessions
    add constraint lab_sessions_revocation_state_check
    check (revocation_state in ('not_requested', 'pending', 'revoked', 'expired', 'failed'));

create index if not exists idx_lab_sessions_revocation_state
    on lab_sessions(revocation_state);
