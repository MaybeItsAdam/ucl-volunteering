-- The Planner becomes two boards, and every item belongs to someone.
--
-- `board` says which board an item is on, and each board has its own columns:
--
--   events     Backlog → Planned → Ready to post → Content → Done
--              (Ready to post: the publicity is ready to go out. Content:
--              making photos, a recap and posts from the event afterwards.)
--   documents  Backlog → Drafting → In review → Submitted → Approved
--              (risk assessments, event plans, SU forms, room bookings)
--
-- An item is either an action on its own (`event_id` null) or linked to an
-- event, on either board. `completed_at` now means "reached the board's last
-- column" (Done or Approved), stamped and cleared by the app as before.
--
-- Old statuses map onto the events board: todo → backlog, doing → planned,
-- done → done.
--
-- Every item must have an assignee, a committee member. The migration stops
-- with a clear error if any item has none, rather than inventing an owner:
-- give each one to someone, then deploy again.
--
-- The assignee's foreign key changes from `on delete set null` to
-- `on delete restrict`: with the column NOT NULL, set null would turn deleting
-- a member into a constraint error mid-delete anyway, and silently orphaning
-- work is what the required assignee is there to stop. The app never deletes
-- members (removing someone from the committee only clears their role, and
-- their items stay theirs until handed on), so restrict only bites on a
-- deletion by hand in the database, which must hand their items on first.
--
-- `doc_url` is an optional link to the document itself (mostly for the
-- documents board), http(s) only.
--
-- RLS stays on with no policies and no grants to anon/authenticated: only the
-- service-role client on the server reads or writes tasks, as before.

alter table public.tasks add column board text not null default 'events';
alter table public.tasks add constraint tasks_board_check check (board in ('events', 'documents'));

-- Statuses: the union of both boards', and each item's must be on its board.
alter table public.tasks drop constraint tasks_completed_only_when_done;
alter table public.tasks drop constraint tasks_status_check;

update public.tasks
set status = case status when 'todo' then 'backlog' when 'doing' then 'planned' else status end
where status in ('todo', 'doing');

alter table public.tasks alter column status set default 'backlog';
alter table public.tasks add constraint tasks_status_check check (
  status in ('backlog', 'planned', 'ready_to_post', 'content', 'done', 'drafting', 'in_review', 'submitted', 'approved')
);
alter table public.tasks add constraint tasks_status_on_board check (
  (board = 'events' and status in ('backlog', 'planned', 'ready_to_post', 'content', 'done'))
  or (board = 'documents' and status in ('backlog', 'drafting', 'in_review', 'submitted', 'approved'))
);
-- Done and Approved are each only on their own board, so this is "in the last column".
alter table public.tasks add constraint tasks_completed_only_at_end check (
  (status in ('done', 'approved')) = (completed_at is not null)
);

-- Every item has an assignee.
do $$
declare
  unassigned integer;
begin
  select count(*) into unassigned from public.tasks where assignee_member_id is null;
  if unassigned > 0 then
    raise exception 'planner_boards: % planner item(s) have no assignee. Assign each to a committee member, then rerun this migration', unassigned
      using hint = 'select id, title from public.tasks where assignee_member_id is null';
  end if;
end
$$;

alter table public.tasks alter column assignee_member_id set not null;
alter table public.tasks drop constraint tasks_assignee_member_id_fkey;
alter table public.tasks
  add constraint tasks_assignee_member_id_fkey
  foreign key (assignee_member_id) references public.members(id) on delete restrict;

alter table public.tasks add column doc_url text;
alter table public.tasks add constraint tasks_doc_url_check check (
  doc_url is null or (doc_url ~* '^https?://[^[:space:]]+$' and char_length(doc_url) <= 2000)
);

-- The board reads one board's items by column; the assignee index no longer needs its predicate.
drop index public.tasks_status_idx;
create index tasks_board_idx on public.tasks (board, status, due_on);
drop index public.tasks_assignee_idx;
create index tasks_assignee_idx on public.tasks (assignee_member_id);
