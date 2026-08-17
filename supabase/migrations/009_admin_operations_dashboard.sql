-- Track platform login presence and current learning activity for the admin dashboard.

create table if not exists user_presence (
    app_user_id text primary key,
    app_user_email text not null,
    app_user_name text not null,
    first_login_at timestamptz not null default now(),
    last_login_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    current_page text not null default 'learning',
    current_lesson_id text,
    current_lesson_title text,
    signed_out_at timestamptz,
    updated_at timestamptz not null default now()
);

create index if not exists idx_user_presence_email on user_presence(app_user_email);
create index if not exists idx_user_presence_last_seen on user_presence(last_seen_at desc);

create or replace function update_user_presence_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists update_user_presence_updated_at on user_presence;

create trigger update_user_presence_updated_at
    before update on user_presence
    for each row
    execute function update_user_presence_updated_at();
