-- Persist lesson/video completion per app user.

create extension if not exists "uuid-ossp";

create table if not exists learning_progress (
    id uuid primary key default uuid_generate_v4(),
    app_user_id text not null,
    app_user_email text,
    app_user_name text,
    lesson_id text not null,
    lesson_title text,
    completed boolean not null default true,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (app_user_id, lesson_id)
);

create index if not exists idx_learning_progress_app_user_id on learning_progress(app_user_id);
create index if not exists idx_learning_progress_lesson_id on learning_progress(lesson_id);
create index if not exists idx_learning_progress_completed on learning_progress(completed);

create or replace function update_learning_progress_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists update_learning_progress_updated_at on learning_progress;

create trigger update_learning_progress_updated_at
    before update on learning_progress
    for each row
    execute function update_learning_progress_updated_at();
