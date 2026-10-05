-- The committee's to-do list: the Planner tab.
--
-- A task is one thing someone has to do, on its own or as part of planning an
-- event (`event_id`). It moves To do → Doing → Done. `completed_at` is set by
-- the app when a task reaches Done and cleared when it is reopened, so "done
-- this week" and tidying old done tasks don't depend on `updated_at`.
--
-- Deleting an event or a member never deletes their tasks: the task loses its
-- event or its assignee and stays on the board for someone to pick up.
--
-- `due_on` is a plain date, a day in Europe/London, not an instant.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  notes text,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  assignee_member_id uuid references public.members(id) on delete set null,
  due_on date,
  event_id uuid references public.events(id) on delete set null,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint tasks_completed_only_when_done check ((status = 'done') = (completed_at is not null))
);

create index tasks_status_idx on public.tasks (status, due_on);
create index tasks_event_idx on public.tasks (event_id) where event_id is not null;
create index tasks_assignee_idx on public.tasks (assignee_member_id) where assignee_member_id is not null;

create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

revoke all on public.tasks from anon, authenticated;
