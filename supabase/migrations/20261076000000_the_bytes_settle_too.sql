-- FORWARD CORRECTION to 20261075000000 (Ruling B).
--
-- ══ THE ROW SETTLED; THE BYTES DID NOT ════════════════════════════════════
--
-- `20261075000000` narrowed the DELETE policy on `booking_reference_photos` and
-- added a trigger, and its own comment then claimed the photo *"cannot be
-- removed"* once the request is sent. **That was true of the row and false of
-- the object.**
--
-- `booking_photos_delete_own` is folder-scoped — `foldername(name)[1] =
-- auth.uid()` — with no `submitted_at` test, and the app writes
-- `<uid>/<bookingId>/<n>.<ext>`, so the uploader could delete any object they
-- had uploaded at any stage. The row survived, still asserting the photo was
-- attached, while the bytes were gone.
--
-- **And the provider would never notice.** `bookingPhotoUrls` drops any path
-- whose signed-URL call fails and the screen renders only survivors — by design,
-- so a provider deciding on a request sees photos or nothing rather than broken
-- frames. The consequence is that a withdrawal is SILENT: three attached, two
-- shown, no indication anything is missing.
--
-- Substitution followed from the same gap: delete the object, re-upload
-- different bytes to the same path, and the record points at an image the
-- provider never saw.
--
-- ══ THE FIX ═══════════════════════════════════════════════════════════════
--
-- DELETE on the object is now resolved THROUGH THE BOOKING, exactly as read
-- authorization already is — and for the same reason a folder rule cannot
-- express it: the question is not "whose folder is this" but "has the request
-- this photo belongs to been sent".
--
-- INSERT stays folder-scoped and must: the object is uploaded BEFORE its row
-- exists, so there is nothing to resolve through at that moment. Substitution is
-- closed anyway, because `upload` without `upsert` fails on an existing path and
-- the delete that would clear it is now refused.
create or replace function public.can_modify_booking_photo_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- An object with no row is an orphan from an abandoned upload. Its uploader
    -- may still clean it up — nothing references it, nobody can read it
    -- (`can_read_booking_photo` is false without a row), and refusing would
    -- strand bytes with no owner able to remove them.
    not exists (
      select 1 from public.booking_reference_photos rp where rp.storage_path = object_name
    )
    or exists (
      select 1
        from public.booking_reference_photos rp
        join public.bookings b on b.id = rp.booking_id
       where rp.storage_path = object_name
         and rp.uploaded_by_user_id = (select auth.uid())
         and b.user_id = (select auth.uid())
         -- THE LINE. Still composing: theirs. Sent: part of the record.
         and b.submitted_at is null
    );
$$;

alter function public.can_modify_booking_photo_object(text) owner to postgres;
revoke all on function public.can_modify_booking_photo_object(text) from public, anon;
grant execute on function public.can_modify_booking_photo_object(text) to authenticated;

comment on function public.can_modify_booking_photo_object(text) is
  'Whether the caller may DELETE this booking-photo object. Resolved through the '
  'booking, not the folder: a folder rule answers "whose upload is this", and the '
  'question is "has the request it belongs to been sent". An orphan with no row '
  'stays deletable by its uploader — nothing references it, nobody can read it, '
  'and refusing would strand bytes no one can clear. service_role bypasses RLS '
  'entirely, so erasure is unaffected.';

drop policy if exists booking_photos_delete_own on storage.objects;
create policy booking_photos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'booking-photos'
    -- Both: the folder rule still keeps one client out of another's prefix, and
    -- the booking rule decides whether their own is still theirs to change.
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_modify_booking_photo_object(name)
  );

-- ══ AND THE SET IS SETTLED, NOT JUST ITS MEMBERS ══════════════════════════
--
-- The review also found that INSERT carried no `submitted_at` test, so a client
-- could ADD photos to a request the provider had already read and decided on.
--
-- Ruling B scoped itself to removal, so this is a judgement rather than a
-- quotation — but the ruling's reason applies unchanged: *"the reference photos
-- become part of the booking transaction record"*, and a record whose contents
-- can still grow after the decision is not settled. A provider who declined
-- three photos should not later be answering for four. The shipped app never
-- does this — `attachBookingPhotos` runs before `submitBookingRequest` — so
-- nothing legitimate is lost.
drop policy if exists "booking_photos_client_insert" on public.booking_reference_photos;
create policy "booking_photos_client_insert" on public.booking_reference_photos
  for insert to authenticated
  with check (
    uploaded_by_user_id = (select auth.uid())
    and exists (select 1 from public.bookings b
                 where b.id = booking_id
                   and b.user_id = (select auth.uid())
                   and b.submitted_at is null)
  );

comment on table public.booking_reference_photos is
  'Reference photos a client attached to a booking request, so the PROVIDER can '
  'see them before deciding. At most three, server-enforced. **The SET settles '
  'when the request is sent**: before that the client may add, remove and replace '
  'freely; after it, neither the rows NOR the storage objects may be added to or '
  'removed (Ruling B, completed by 20261076000000 — the first pass settled the '
  'rows and left the bytes deletable, which the provider''s screen would have '
  'hidden silently). Erasure and retention stay DELIBERATELY UNRESOLVED '
  '(Ruling C / OQ-077): rows cascade from bookings and auth.users, storage '
  'objects do not, and the final treatment belongs to Operations, legal and '
  'account-deletion policy.';
