-- Where places are, for the map beside /timetable: each event location or
-- directory address looked up once and kept, so the page never waits on a
-- geocoder. Filled by the daily sync (event locations) and when the committee
-- saves a directory entry (src/lib/places.ts).
--
-- `query` is the location text normalised (lower case, single spaces). A row
-- with no coordinates is a lookup that found nothing (or an online event):
-- kept so it isn't asked again, and retried after 30 days.

create table public.places (
  query text primary key check (char_length(query) between 1 and 200),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  -- postcode | known | nominatim | none
  source text not null,
  looked_up_at timestamptz not null default now(),
  constraint places_both_or_neither check ((lat is null) = (lng is null))
);

alter table public.places enable row level security;

revoke all on public.places from anon, authenticated;
