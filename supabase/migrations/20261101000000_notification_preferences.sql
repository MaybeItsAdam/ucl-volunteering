-- Per-phone notification preferences, set on the Settings page. Each kind of
-- notification can be switched off on its own without turning the phone off
-- entirely: food_alerts is "a café has food ready to collect" (everyone who
-- opted in), task_reminders is the committee's morning nudge about their own
-- overdue and due-soon tasks.
--
-- Expand only: both default to true, which is what every existing row has
-- been getting, and the deployment still serving ignores the columns.

alter table public.push_devices
  add column food_alerts boolean not null default true,
  add column task_reminders boolean not null default true;
