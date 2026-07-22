-- Extend intern_profiles so the shared admin/intern profile UI can persist all fields.

alter table if exists intern_profiles
    add column if not exists notes text not null default '';

alter table if exists intern_profiles
    add column if not exists app_user_id text;

alter table if exists intern_profiles
    alter column app_user_id type text using app_user_id::text;

create index if not exists idx_intern_profiles_app_user_id on intern_profiles(app_user_id);

create or replace function update_intern_profiles_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;


drop trigger if exists update_intern_profiles_updated_at on intern_profiles;

create trigger update_intern_profiles_updated_at
    before update on intern_profiles
    for each row
    execute function update_intern_profiles_updated_at();
