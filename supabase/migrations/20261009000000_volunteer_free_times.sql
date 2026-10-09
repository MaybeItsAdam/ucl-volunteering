-- Volunteers paint the times they're free onto a week grid, and pick the date
-- they're around until, in place of ticking parts of the day and terms.
--
-- free_times holds blocks of the week, [{"weekday":1,"startMinute":600,"endMinute":780}, …],
-- ISO weekdays (Mon = 1) and minutes after midnight on a 30-minute grid; the
-- shape is checked in src/lib/volunteers.ts. available_until is null for "no
-- end in mind".
--
-- Expand only: slots and periods stay for the rows that already have them. The
-- existing slots are copied across as blocks (morning 08:00–12:00, afternoon
-- 12:00–17:00, evening 17:00–22:00) so nobody's week goes blank; periods have
-- no date to become, so they're kept as they are and still shown.

alter table public.volunteers
  add column free_times jsonb not null default '[]'::jsonb,
  add column available_until date;

update public.volunteers v
set free_times = coalesce((
  select jsonb_agg(
    jsonb_build_object('weekday', b.weekday, 'startMinute', b.start_minute, 'endMinute', b.end_minute)
    order by b.weekday, b.start_minute
  )
  from (
    select
      array_position(array['mon','tue','wed','thu','fri','sat','sun'], split_part(s, '_', 1)) as weekday,
      case split_part(s, '_', 2) when 'am' then 480 when 'pm' then 720 when 'eve' then 1020 end as start_minute,
      case split_part(s, '_', 2) when 'am' then 720 when 'pm' then 1020 when 'eve' then 1320 end as end_minute
    from unnest(v.slots) as s
  ) b
  where b.weekday is not null and b.start_minute is not null
), '[]'::jsonb)
where cardinality(v.slots) > 0;
