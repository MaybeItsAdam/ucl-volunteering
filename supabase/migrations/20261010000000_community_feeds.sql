-- Calendars the committee adds by hand, beside the societies the Toolbox
-- tags `altruism`.
--
-- A manual row is either a Toolbox society that isn't tagged (its organiser
-- id, so the sync keeps its name, logo and colours up to date) or any other
-- iCal feed (an `ical_…` id and its own `feed_url`). Either way the sync keeps
-- it whatever the Toolbox's tags say, until the committee takes it off.
-- `label` is the name to show when it differs from the Toolbox's.
--
-- Expand only: nothing existing changes meaning.

alter table public.community_societies
  add column manual boolean not null default false,
  add column feed_url text check (feed_url ~ '^https?://'),
  add column label text check (label is null or length(label) between 1 and 80),
  add column added_by uuid references public.members(id) on delete set null;

-- Bentham's Farm, the Urban Farmers Society: on the Toolbox as a common
-- interest society, so the tag alone never brought it in.
insert into public.community_societies
  (organiser_id, name, label, logo_url, colour, dark_colour, union_url, included, manual)
values (
  'org_soc_un1nre7dp',
  'Urban Farmers Society',
  'Bentham''s Farm',
  'https://studentsunionucl.org/sites/default/files/csc-directory-images/benthamsfarmlogo_icon_greenbg_white.png',
  '#379543',
  '#84d28e',
  'https://studentsunionucl.org/clubs-societies/urban-farmers-society',
  true,
  true
)
on conflict (organiser_id) do update
  set manual = true, included = true, label = excluded.label;
