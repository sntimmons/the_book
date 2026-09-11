-- Booking & Onboarding Integrity — requirement B. THE PHOTOS ACTUALLY ARRIVE.
--
-- ══ THE DEFECT ════════════════════════════════════════════════════════════
--
-- `app/book/message.tsx` lets a client attach up to three reference photos —
-- *"a style you like, or anything visual that helps your provider understand
-- what you want"* — and writes them to `bookingPhotos` in a Zustand store.
--
-- **Nothing ever reads that field except the screen that set it.** It is not
-- uploaded, not stored, not attached to the booking, and the provider never sees
-- it. The client picks photos, sends the request, and the files are discarded
-- when the store resets.
--
-- That is a control that lies. The Founder ruling is explicit: implement it, or
-- remove it — *"do NOT leave a picker that silently discards files."* It is
-- implemented, because the alternative removes something a client reasonably
-- wants and a provider genuinely needs before accepting a request.
--
-- ══ THE SHAPE ═════════════════════════════════════════════════════════════
--
-- A private bucket plus a row per photo, because the ROW is what makes the photo
-- findable and authorizable; a bare storage path with no record is not evidence
-- attached to a booking, it is a file in a bucket.
--
-- Authorization is object-bound, mirroring `can_read_contract_pdf`
-- (`20260829060000`): the storage policy asks a definer helper whether THIS
-- caller may read THIS object, resolved through the booking. A folder-prefix
-- rule would not work here — the provider must read a client's upload, so the
-- path cannot encode the only reader.

-- ── 1. The bucket. Private, image-only, small. ────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('booking-photos', 'booking-photos', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

-- ── 2. The record ─────────────────────────────────────────────────────────
create table if not exists public.booking_reference_photos (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  -- The storage path, not a URL. A URL embeds a host and a signing scheme, and
  -- this row should survive both.
  storage_path text not null,
  uploaded_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  constraint booking_reference_photos_path_unique unique (booking_id, storage_path)
);

create index if not exists booking_reference_photos_booking_idx
  on public.booking_reference_photos (booking_id, created_at);

comment on table public.booking_reference_photos is
  'Reference photos a client attached to a booking request, so the PROVIDER can '
  'see them before deciding. At most three, enforced below. Before this table the '
  'picker existed and the files went nowhere — they were held in a client-side '
  'store and discarded on reset, which made the control a lie. Stores a storage '
  'PATH rather than a URL, because the row should outlive any particular host or '
  'signing scheme.';

alter table public.booking_reference_photos enable row level security;
revoke all on public.booking_reference_photos from public, anon, authenticated;
grant select, insert, delete on public.booking_reference_photos to authenticated;
grant select, insert, update, delete on public.booking_reference_photos to service_role;

-- BOTH PARTIES READ. The client who attached them, and the provider who has to
-- decide on the request — which is the entire point.
drop policy if exists "booking_photos_participants_read" on public.booking_reference_photos;
create policy "booking_photos_participants_read" on public.booking_reference_photos
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_id
         and (
           b.user_id = (select auth.uid())
           or exists (select 1 from public.providers p
                       where p.id = b.provider_id and p.user_id = (select auth.uid()))
         )
    )
  );

-- ONLY THE CLIENT WRITES, and only onto their own booking. A provider adding
-- "reference photos" to a client's request would be putting words in their mouth.
drop policy if exists "booking_photos_client_insert" on public.booking_reference_photos;
create policy "booking_photos_client_insert" on public.booking_reference_photos
  for insert to authenticated
  with check (
    uploaded_by_user_id = (select auth.uid())
    and exists (select 1 from public.bookings b
                 where b.id = booking_id and b.user_id = (select auth.uid()))
  );

-- And may remove their own, before or after sending. Nothing else may.
drop policy if exists "booking_photos_client_delete" on public.booking_reference_photos;
create policy "booking_photos_client_delete" on public.booking_reference_photos
  for delete to authenticated
  using (
    uploaded_by_user_id = (select auth.uid())
    and exists (select 1 from public.bookings b
                 where b.id = booking_id and b.user_id = (select auth.uid()))
  );

-- ── 3. Three, and the limit is the server's ───────────────────────────────
--
-- The screen says "Up to 3". A limit only the screen enforces is not a limit.
create or replace function public.enforce_booking_photo_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.booking_reference_photos
   where booking_id = new.booking_id;
  if v_n >= 3 then
    raise exception 'A booking request may have at most three reference photos.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter function public.enforce_booking_photo_limit() owner to postgres;
revoke all on function public.enforce_booking_photo_limit()
  from public, anon, authenticated;

drop trigger if exists zz_booking_photo_limit on public.booking_reference_photos;
create trigger zz_booking_photo_limit
  before insert on public.booking_reference_photos
  for each row execute function public.enforce_booking_photo_limit();

-- ── 4. Object-bound storage authorization ─────────────────────────────────
--
-- Mirrors `can_read_contract_pdf`. A folder-prefix rule cannot work here: the
-- PROVIDER must read an object the CLIENT uploaded, so the path cannot encode
-- its only legitimate reader, and the answer has to be resolved through the
-- booking instead.
create or replace function public.can_read_booking_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.booking_reference_photos rp
      join public.bookings b on b.id = rp.booking_id
     where rp.storage_path = object_name
       and (
         b.user_id = (select auth.uid())
         or exists (select 1 from public.providers p
                     where p.id = b.provider_id and p.user_id = (select auth.uid()))
       )
  );
$$;

alter function public.can_read_booking_photo(text) owner to postgres;
revoke all on function public.can_read_booking_photo(text) from public, anon;
grant execute on function public.can_read_booking_photo(text) to authenticated;

comment on function public.can_read_booking_photo(text) is
  'Object-bound read authorization for the booking-photos bucket, resolved '
  'through the booking rather than through the path. The provider must be able '
  'to read a file the client uploaded, so a folder-prefix rule — which is how '
  'own-media buckets are scoped — cannot express this. An object with no '
  'booking_reference_photos row is readable by nobody, which is also what makes '
  'an orphaned upload harmless.';

drop policy if exists booking_photos_read on storage.objects;
create policy booking_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'booking-photos' and public.can_read_booking_photo(name));

-- WRITES are folder-scoped to the uploader, which is the ordinary own-media
-- rule and is safe here because only the client uploads.
drop policy if exists booking_photos_insert_own on storage.objects;
create policy booking_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'booking-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists booking_photos_delete_own on storage.objects;
create policy booking_photos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'booking-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- No UPDATE policy: an attached reference photo is not edited in place. Replacing
-- one is a delete and a new upload, which leaves the record honest about what was
-- attached and when.
