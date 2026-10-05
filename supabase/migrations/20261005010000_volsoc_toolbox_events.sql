-- VolSoc's own events on Adam's Campus Toolbox, synced into the plan beside
-- the Social Impact calendar.
--
-- `volsoc_toolbox` rows come from VolSoc's organiser feed and, like
-- `social_impact` rows, the feed owns their title, time, place, description
-- and link; the committee owns the rest. `volsoc` rows stay the committee's
-- own, typed into the app.

alter table public.events drop constraint events_source_check;
alter table public.events
  add constraint events_source_check check (source in ('volsoc', 'social_impact', 'volsoc_toolbox'));

alter table public.events drop constraint events_uid_only_on_feed_rows;
alter table public.events
  add constraint events_uid_only_on_feed_rows check (source <> 'volsoc' or toolbox_uid is null);
