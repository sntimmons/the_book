-- =============================================================================
-- CANONICAL LIVE BASELINE (candidate) -- public application schema
-- =============================================================================
-- AUTHORITATIVE SOURCE: pg_dump --schema public of live project
-- kxregomuawwcqvisuhtr (Postgres 17.6, post-S1B), produced read-only on CI
-- (F5B-C2 workflow, GitHub Actions run 33232611192). Regenerated from that dump
-- so table/constraint/view/function/trigger DEFINITIONS and their DEPENDENCY
-- ORDERING are exactly as Postgres emits them (fixes the earlier hand-authored
-- FK-ordering and sequence defects). Cross-checked against
-- docs/audits/F4_LIVE_SCHEMA_SNAPSHOT.sql.
--
-- PURPOSE: reproduce the CURRENT live application-owned schema on a FRESH,
-- ISOLATED Supabase project for validation (F5B). It intentionally reproduces
-- current live state INCLUDING known-bad security definitions (see F3): it is a
-- reproducibility artifact, not a cleanup. Security fixes are forward migrations
-- authored AFTER this baseline (batch S2).
--
-- DO NOT apply to the linked/live project. DO NOT db push / migration repair
-- until F5B has applied it to an isolated fresh environment and proven equivalence.
--
-- TWO THINGS pg_dump --schema public CANNOT express on Supabase, added by hand:
--   (a) app extensions (pgcrypto, uuid-ossp) live in the `extensions` schema,
--       excluded by --schema public. Added below, idempotently.
--   (b) the S1B anon lockdown on clients / clients_public / clients_provider.
--       Supabase pre-configures ALTER DEFAULT PRIVILEGES granting anon ALL on
--       every new table/view; pg_dump represents a revoked-anon ACL by OMITTING
--       the anon GRANT, not by emitting a REVOKE. On a fresh project the default
--       privilege would re-grant anon, silently regressing S1B. The explicit
--       ACL-correction block after the dump body counteracts that. These 3 are
--       the ONLY objects live diverges from the anon-ALL default (verified).
--   Storage (buckets + storage.objects policies) is also outside `public`; the
--   F4-captured storage section is appended verbatim.
-- =============================================================================

-- ============================= 1. EXTENSIONS (app-relevant only) =============================
create extension if not exists "pgcrypto" with schema extensions;   -- gen_random_uuid()
create extension if not exists "uuid-ossp" with schema extensions;

-- ============================= 2. PUBLIC SCHEMA (verbatim pg_dump, authoritative) =============================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."debug_whoami"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  select jsonb_build_object(
    'uid', auth.uid(),
    'role', current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    'sub_claim', current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    'raw_claims', nullif(current_setting('request.jwt.claims', true), '')
  );
$$;


ALTER FUNCTION "public"."debug_whoami"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_provider_verification_self_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.verification_status is distinct from old.verification_status
    or new.identity_verified is distinct from old.identity_verified
    or new.business_verified is distinct from old.business_verified
    or new.verification_submitted_at is distinct from old.verification_submitted_at
    or new.verification_notes is distinct from old.verification_notes
  then
    raise exception 'Provider verification fields are admin-managed';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_provider_verification_self_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_review_revealed"("p_booking_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    exists (
      select 1
      from public.client_reviews cr
      where cr.booking_id = p_booking_id
    )
    or exists (
      select 1
      from public.bookings b
      where b.id = p_booking_id
        and b.completed_at is not null
        and b.completed_at <= now() - interval '7 days'
    );
$$;


ALTER FUNCTION "public"."provider_review_revealed"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_provider_rating"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  pid uuid;
begin
  pid := coalesce(new.provider_id, old.provider_id);
  if pid is null then
    return coalesce(new, old);
  end if;

  update public.providers
  set
    average_rating = coalesce(
      (select round(avg(rating)::numeric, 2)
         from public.provider_reviews
        where provider_id = pid),
      0
    ),
    review_count = (
      select count(*)
        from public.provider_reviews
       where provider_id = pid
    )
  where id = pid;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."recompute_provider_rating"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_self_provider_action"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  actor_col       text  := tg_argv[0];
  row_json        jsonb := to_jsonb(new);
  actor_id        uuid;
  target_provider uuid;
  owner_id        uuid;
begin
  if actor_col is null then
    raise exception
      'reject_self_provider_action on %: missing actor column trigger argument',
      tg_table_name
      using errcode = 'undefined_column';
  end if;
  if not (row_json ? actor_col) then
    raise exception
      'reject_self_provider_action on %: actor column "%" does not exist',
      tg_table_name, actor_col
      using errcode = 'undefined_column';
  end if;
  if not (row_json ? 'provider_id') then
    raise exception
      'reject_self_provider_action on %: provider_id column does not exist',
      tg_table_name
      using errcode = 'undefined_column';
  end if;

  actor_id        := (row_json ->> actor_col)::uuid;
  target_provider := (row_json ->> 'provider_id')::uuid;

  if actor_id is null or target_provider is null then
    return new;
  end if;

  select user_id into owner_id
  from public.providers
  where id = target_provider;

  if owner_id is not null and owner_id = actor_id then
    raise exception
      'self-referential row on % rejected: user % owns provider %',
      tg_table_name, actor_id, target_provider
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."reject_self_provider_action"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_community_like_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if TG_OP = 'INSERT' then
    update community_posts set like_count = like_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update community_posts set like_count = greatest(like_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."update_community_like_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_community_reply_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if TG_OP = 'INSERT' then
    update community_posts set reply_count = reply_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update community_posts set reply_count = greatest(reply_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."update_community_reply_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_post_comment_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if TG_OP = 'INSERT' then
    update posts set comment_count = comment_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update posts set comment_count = greatest(comment_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."update_post_comment_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_post_like_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if TG_OP = 'INSERT' then
    update posts set like_count = like_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update posts set like_count = greatest(like_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."update_post_like_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_post_save_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if TG_OP = 'INSERT' then
    update posts set save_count = save_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update posts set save_count = greatest(save_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."update_post_save_count"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."barter_interests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "offer_id" "uuid" NOT NULL,
    "interested_provider_id" "uuid" NOT NULL,
    "interested_user_id" "uuid" NOT NULL,
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "barter_interests_message_check" CHECK ((("message" IS NULL) OR ("char_length"("message") <= 300))),
    CONSTRAINT "barter_interests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."barter_interests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."barter_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "offering_service" "text" NOT NULL,
    "seeking_service" "text" NOT NULL,
    "offering_value" integer,
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "barter_offers_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 500))),
    CONSTRAINT "barter_offers_offering_service_check" CHECK (("char_length"("offering_service") <= 200)),
    CONSTRAINT "barter_offers_seeking_service_check" CHECK (("char_length"("seeking_service") <= 200))
);


ALTER TABLE "public"."barter_offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid",
    "event_type" "text" NOT NULL,
    "actor_type" "text",
    "actor_id" "uuid",
    "message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."booking_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."booking_events" IS 'Immutable audit trail for booking lifecycle events.';



COMMENT ON COLUMN "public"."booking_events"."actor_type" IS 'system | client | provider | stripe';



COMMENT ON COLUMN "public"."booking_events"."metadata" IS 'Arbitrary context such as Stripe event IDs, amounts, reasons.';



CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "service_name" "text" NOT NULL,
    "requested_date" "date" NOT NULL,
    "requested_time" "text",
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "appointment_time" timestamp with time zone,
    "client_checked_in_at" timestamp with time zone,
    "provider_confirmed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "service_id" "uuid",
    "stripe_payment_intent_id" "text",
    "payment_status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "payment_amount" numeric(10,2),
    "payment_authorized_at" timestamp with time zone,
    "payment_captured_at" timestamp with time zone,
    "stripe_last_event_id" "text",
    "stripe_last_event_at" timestamp with time zone,
    "issue_reported" boolean DEFAULT false NOT NULL,
    "issue_reported_at" timestamp with time zone,
    "issue_reason" "text",
    "under_review" boolean DEFAULT false NOT NULL,
    "capture_scheduled_for" timestamp with time zone,
    "payment_finalized" boolean DEFAULT false NOT NULL,
    "provider_first_response_at" timestamp with time zone,
    "cancelled_by" "text",
    "cancellation_actor" "text",
    "refund_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "dispute_flag" boolean DEFAULT false NOT NULL,
    "no_show_flag" boolean DEFAULT false NOT NULL,
    "provider_safety_notes" "text",
    "client_safety_notes" "text",
    "admin_resolution_notes" "text",
    CONSTRAINT "bookings_admin_resolution_notes_length_check" CHECK ((("admin_resolution_notes" IS NULL) OR ("char_length"("admin_resolution_notes") <= 4000))),
    CONSTRAINT "bookings_cancellation_actor_check" CHECK ((("cancellation_actor" = ANY (ARRAY['client'::"text", 'provider'::"text", 'admin'::"text", 'system'::"text"])) OR ("cancellation_actor" IS NULL))),
    CONSTRAINT "bookings_client_safety_notes_length_check" CHECK ((("client_safety_notes" IS NULL) OR ("char_length"("client_safety_notes") <= 2000))),
    CONSTRAINT "bookings_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'authorized'::"text", 'captured'::"text", 'cancelled'::"text", 'refunded'::"text"]))),
    CONSTRAINT "bookings_provider_safety_notes_length_check" CHECK ((("provider_safety_notes" IS NULL) OR ("char_length"("provider_safety_notes") <= 2000))),
    CONSTRAINT "bookings_refund_status_check" CHECK (("refund_status" = ANY (ARRAY['none'::"text", 'pending'::"text", 'released'::"text", 'refunded'::"text", 'partially_refunded'::"text", 'disputed'::"text"]))),
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'canceled'::"text", 'cancelled_by_client'::"text", 'cancelled_by_provider'::"text", 'arriving'::"text", 'checked_in'::"text", 'completed'::"text", 'late_cancelled'::"text", 'no_show'::"text", 'rescheduled'::"text"])))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."bookings"."cancelled_at" IS 'Timestamp when the booking was cancelled.';



COMMENT ON COLUMN "public"."bookings"."cancellation_reason" IS 'Structured or freeform cancellation reason used for booking protection review.';



COMMENT ON COLUMN "public"."bookings"."stripe_payment_intent_id" IS 'Stripe PaymentIntent ID (pi_...). Capture is always manual.';



COMMENT ON COLUMN "public"."bookings"."payment_status" IS 'unpaid → authorized → captured (or cancelled/refunded)';



COMMENT ON COLUMN "public"."bookings"."payment_amount" IS 'Authorized amount in dollars (server-calculated from service price)';



COMMENT ON COLUMN "public"."bookings"."stripe_last_event_id" IS 'Last processed Stripe event ID — used for idempotency.';



COMMENT ON COLUMN "public"."bookings"."issue_reported" IS 'True if client filed an issue during the window.';



COMMENT ON COLUMN "public"."bookings"."under_review" IS 'True while an issue is being reviewed — blocks auto-capture and reviews.';



COMMENT ON COLUMN "public"."bookings"."capture_scheduled_for" IS 'When the payment should be captured (completion + issue_window_hours).';



COMMENT ON COLUMN "public"."bookings"."payment_finalized" IS 'True once capture or final release has been processed.';



COMMENT ON COLUMN "public"."bookings"."provider_first_response_at" IS 'Timestamp of the provider first accepting or declining this booking. Used to compute response speed metrics.';



COMMENT ON COLUMN "public"."bookings"."cancelled_by" IS 'Who initiated the cancellation: "client" or "provider".';



COMMENT ON COLUMN "public"."bookings"."cancellation_actor" IS 'Actor responsible for cancellation: client, provider, admin, or system.';



COMMENT ON COLUMN "public"."bookings"."refund_status" IS 'Foundation refund workflow status: none, pending, released, refunded, partially_refunded, disputed.';



COMMENT ON COLUMN "public"."bookings"."dispute_flag" IS 'Admin-visible flag for bookings requiring dispute review.';



COMMENT ON COLUMN "public"."bookings"."no_show_flag" IS 'Admin-visible flag for no-show review across client and provider cases.';



COMMENT ON COLUMN "public"."bookings"."provider_safety_notes" IS 'Provider-side safety context reserved for future reporting flows.';



COMMENT ON COLUMN "public"."bookings"."client_safety_notes" IS 'Client-side safety context reserved for future reporting flows.';



COMMENT ON COLUMN "public"."bookings"."admin_resolution_notes" IS 'Private admin resolution notes for disputes, refunds, cancellations, and no-shows.';



CREATE TABLE IF NOT EXISTS "public"."care_reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_user_id" "uuid" NOT NULL,
    "provider_id" "uuid",
    "service_name" "text" NOT NULL,
    "interval_days" integer DEFAULT 30 NOT NULL,
    "last_booked_at" timestamp with time zone,
    "next_reminder_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."care_reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."categories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."categories_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."categories_id_seq" OWNED BY "public"."categories"."id";



CREATE TABLE IF NOT EXISTS "public"."client_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "client_user_id" "uuid" NOT NULL,
    "reviewer_provider_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "review_text" "text",
    "tags" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "showed_up" boolean,
    "on_time" boolean,
    "followed_policy" boolean,
    "payment_completed" boolean,
    "private_note" "text",
    CONSTRAINT "client_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."client_reviews" OWNER TO "postgres";


COMMENT ON TABLE "public"."client_reviews" IS 'Private. Provider rates client after a completed booking. Clients must never see the contents — no client-readable policy is added.';



COMMENT ON COLUMN "public"."client_reviews"."booking_id" IS 'Unique. One private review per booking.';



COMMENT ON COLUMN "public"."client_reviews"."client_user_id" IS 'The client being rated (auth.users.id).';



COMMENT ON COLUMN "public"."client_reviews"."private_note" IS 'Provider-only context note. Max 150 chars. Never shown to clients or other providers.';



CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "avatar_url" "text",
    "neighborhood" "text"
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid" DEFAULT "gen_random_uuid"(),
    "booking_id" "uuid" DEFAULT "gen_random_uuid"(),
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."conversation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "username" "text" NOT NULL,
    "category_id" integer,
    "bio" "text",
    "location" "text",
    "profile_photo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "total_bookings" integer DEFAULT 0 NOT NULL,
    "no_show_count" integer DEFAULT 0 NOT NULL,
    "late_count" integer DEFAULT 0 NOT NULL,
    "rating" numeric(3,2) DEFAULT 0 NOT NULL,
    "completed_count" integer DEFAULT 0 NOT NULL,
    "stripe_account_id" "text",
    "stripe_onboarding_complete" boolean DEFAULT false NOT NULL,
    "stripe_charges_enabled" boolean DEFAULT false NOT NULL,
    "stripe_payouts_enabled" boolean DEFAULT false NOT NULL,
    "stripe_details_submitted" boolean DEFAULT false NOT NULL,
    "stripe_account_updated_at" timestamp with time zone,
    "average_rating" numeric(3,2) DEFAULT 0 NOT NULL,
    "review_count" integer DEFAULT 0 NOT NULL,
    "payment_mode" "text" DEFAULT 'full_payment'::"text" NOT NULL,
    "deposit_type" "text",
    "deposit_value" numeric(10,2),
    "issue_window_hours" integer DEFAULT 2 NOT NULL,
    "follower_count" integer DEFAULT 0 NOT NULL,
    "is_demo" boolean DEFAULT false NOT NULL,
    "cover_image_url" "text",
    "specialties" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "profile_style" "text",
    "years_experience" integer,
    "bookings_this_week" integer DEFAULT 0 NOT NULL,
    "bookings_this_month" integer DEFAULT 0 NOT NULL,
    "repeat_client_rate" numeric(4,2) DEFAULT 0 NOT NULL,
    "next_available" "date",
    "is_trending" boolean DEFAULT false NOT NULL,
    "neighborhood" "text",
    "is_featured" boolean DEFAULT false NOT NULL,
    "is_approved" boolean DEFAULT true NOT NULL,
    "verification_status" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "identity_verified" boolean DEFAULT false NOT NULL,
    "business_verified" boolean DEFAULT false NOT NULL,
    "verification_submitted_at" timestamp with time zone,
    "verification_notes" "text",
    "custom_category" "text",
    "is_mobile" boolean DEFAULT false NOT NULL,
    "business_name" "text",
    CONSTRAINT "providers_deposit_type_check" CHECK ((("deposit_type" = ANY (ARRAY['flat'::"text", 'percentage'::"text"])) OR ("deposit_type" IS NULL))),
    CONSTRAINT "providers_deposit_value_check" CHECK ((("deposit_value" IS NULL) OR ("deposit_value" >= (0)::numeric))),
    CONSTRAINT "providers_issue_window_hours_check" CHECK ((("issue_window_hours" >= 1) AND ("issue_window_hours" <= 24))),
    CONSTRAINT "providers_payment_mode_check" CHECK (("payment_mode" = ANY (ARRAY['full_payment'::"text", 'deposit'::"text"]))),
    CONSTRAINT "providers_profile_style_check" CHECK ((("profile_style" IS NULL) OR ("profile_style" = ANY (ARRAY['luxury'::"text", 'urban'::"text", 'minimalist'::"text", 'trendy'::"text", 'soft_feminine'::"text", 'athletic'::"text", 'premium_barber'::"text", 'natural_hair'::"text"])))),
    CONSTRAINT "providers_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['unverified'::"text", 'pending'::"text", 'verified'::"text", 'rejected'::"text"]))),
    CONSTRAINT "username_format" CHECK (("username" ~ '^[a-z0-9_]{3,30}$'::"text"))
);


ALTER TABLE "public"."providers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."providers"."stripe_account_id" IS 'Stripe Express connected account ID (acct_...)';



COMMENT ON COLUMN "public"."providers"."stripe_onboarding_complete" IS 'True when details_submitted=true AND payouts_enabled=true';



COMMENT ON COLUMN "public"."providers"."stripe_charges_enabled" IS 'Cached from Stripe: true only when charges_enabled AND payouts_enabled. Refreshed on Connect status check.';



COMMENT ON COLUMN "public"."providers"."average_rating" IS 'Computed average of all verified reviews. Updated on each new review.';



COMMENT ON COLUMN "public"."providers"."review_count" IS 'Total verified review count. Updated on each new review.';



COMMENT ON COLUMN "public"."providers"."payment_mode" IS 'full_payment | deposit — controls how much is authorized at booking time.';



COMMENT ON COLUMN "public"."providers"."deposit_type" IS 'flat | percentage — only relevant when payment_mode = deposit.';



COMMENT ON COLUMN "public"."providers"."deposit_value" IS 'Flat dollar amount or percentage value for deposits.';



COMMENT ON COLUMN "public"."providers"."issue_window_hours" IS 'Hours after completion a client may report an issue before capture runs.';



COMMENT ON COLUMN "public"."providers"."is_demo" IS 'True for demo/seed providers. Never set on real user accounts.';



COMMENT ON COLUMN "public"."providers"."cover_image_url" IS 'Banner/header image displayed at the top of the provider profile page.';



COMMENT ON COLUMN "public"."providers"."specialties" IS 'Provider-declared specialties used for search and profile display. e.g. {Silk Press, Braids, Color}';



COMMENT ON COLUMN "public"."providers"."profile_style" IS 'Visual persona — used as a theming hint. Does not affect functionality.';



COMMENT ON COLUMN "public"."providers"."years_experience" IS 'Self-reported years in the industry. Shown on profile if set.';



COMMENT ON COLUMN "public"."providers"."bookings_this_week" IS 'Rolling 7-day booking count. Updated by seed or cron job.';



COMMENT ON COLUMN "public"."providers"."bookings_this_month" IS 'Rolling 30-day booking count. Updated by seed or cron job.';



COMMENT ON COLUMN "public"."providers"."repeat_client_rate" IS 'Percentage of bookings from returning clients (0–100).';



COMMENT ON COLUMN "public"."providers"."next_available" IS 'Next open booking date. Updated by seed or provider.';



COMMENT ON COLUMN "public"."providers"."is_trending" IS 'Manually or algorithmically flagged as trending this week.';



COMMENT ON COLUMN "public"."providers"."neighborhood" IS 'Local neighborhood within city for discovery context.';



COMMENT ON COLUMN "public"."providers"."is_featured" IS 'Admin-curated featured flag. Appears in featured carousels.';



COMMENT ON COLUMN "public"."providers"."is_approved" IS 'Admin approval gate. False = hidden from discovery feed.';



COMMENT ON COLUMN "public"."providers"."verification_status" IS 'Provider trust workflow status: unverified, pending, verified, rejected.';



COMMENT ON COLUMN "public"."providers"."identity_verified" IS 'True when admin has verified the provider identity. Future uploads can feed this review.';



COMMENT ON COLUMN "public"."providers"."business_verified" IS 'True when admin has verified business credentials such as license or registration.';



COMMENT ON COLUMN "public"."providers"."verification_submitted_at" IS 'Timestamp for the latest provider verification submission. Reserved for future upload flows.';



COMMENT ON COLUMN "public"."providers"."verification_notes" IS 'Private admin moderation notes for provider verification decisions.';



CREATE OR REPLACE VIEW "public"."clients_provider" WITH ("security_invoker"='false') AS
 SELECT "id",
    "name",
    "created_at",
    "neighborhood"
   FROM "public"."clients" "c"
  WHERE ((EXISTS ( SELECT 1
           FROM ("public"."bookings" "b"
             JOIN "public"."providers" "p" ON (("p"."id" = "b"."provider_id")))
          WHERE (("b"."user_id" = "c"."id") AND ("p"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM ("public"."conversation" "cv"
             JOIN "public"."providers" "p" ON (("p"."id" = "cv"."provider_id")))
          WHERE (("cv"."client_id" = "c"."id") AND ("p"."user_id" = "auth"."uid"())))));


ALTER VIEW "public"."clients_provider" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."clients_public" WITH ("security_invoker"='false') AS
 SELECT "id",
    "name",
    "avatar_url"
   FROM "public"."clients" "c";


ALTER VIEW "public"."clients_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_bookmarks" (
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."community_bookmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_post_likes" (
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."community_post_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "like_count" integer DEFAULT 0 NOT NULL,
    "reply_count" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_posts_content_check" CHECK (("char_length"("content") <= 1000))
);


ALTER TABLE "public"."community_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_replies_content_check" CHECK (("char_length"("content") <= 500))
);


ALTER TABLE "public"."community_replies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_user_id" "uuid" NOT NULL,
    "post_id" "uuid",
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."community_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_signatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "client_user_id" "uuid" NOT NULL,
    "signature_url" "text",
    "signed_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contract_signatures_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'signed'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."contract_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contracts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'Service Agreement'::"text" NOT NULL,
    "body" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contract_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "pdf_url" "text",
    "pdf_filename" "text",
    CONSTRAINT "contracts_contract_type_check" CHECK (("contract_type" = ANY (ARRAY['text'::"text", 'pdf'::"text"])))
);


ALTER TABLE "public"."contracts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_interest" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "feature_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feature_interest" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" DEFAULT "gen_random_uuid"(),
    "content" "text",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "comment_text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "post_comments_comment_text_check" CHECK ((("char_length"("comment_text") >= 1) AND ("char_length"("comment_text") <= 500)))
);


ALTER TABLE "public"."post_comments" OWNER TO "postgres";


COMMENT ON TABLE "public"."post_comments" IS 'Comments on provider portfolio and reel posts.';



CREATE TABLE IF NOT EXISTS "public"."post_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."post_likes" OWNER TO "postgres";


COMMENT ON TABLE "public"."post_likes" IS 'Persistent likes on provider portfolio and reel posts.';



CREATE TABLE IF NOT EXISTS "public"."post_saves" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."post_saves" OWNER TO "postgres";


COMMENT ON TABLE "public"."post_saves" IS 'User saved/favorited provider posts.';



CREATE TABLE IF NOT EXISTS "public"."post_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "viewer_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."post_views" OWNER TO "postgres";


COMMENT ON TABLE "public"."post_views" IS 'Lightweight view analytics for provider post and reel media.';



CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "media_url" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "caption" "text",
    "category_id" integer,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_demo" boolean DEFAULT false NOT NULL,
    "content_type" "text" DEFAULT 'portfolio'::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "featured" boolean DEFAULT false NOT NULL,
    "engagement_score" numeric(8,2) DEFAULT 0 NOT NULL,
    "service_type" "text",
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "thumbnail_url" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "comment_count" integer DEFAULT 0 NOT NULL,
    "like_count" integer DEFAULT 0 NOT NULL,
    "save_count" integer DEFAULT 0 NOT NULL,
    "view_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "posts_content_type_check" CHECK (("content_type" = ANY (ARRAY['portfolio'::"text", 'transformation'::"text", 'reel'::"text", 'process'::"text", 'testimonial'::"text", 'lifestyle'::"text", 'salon'::"text", 'before_after'::"text", 'client_result'::"text", 'trending'::"text", 'profile'::"text"]))),
    CONSTRAINT "posts_media_type_check" CHECK (("media_type" = ANY (ARRAY['image'::"text", 'video'::"text"]))),
    CONSTRAINT "posts_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'followers_only'::"text"])))
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."posts"."is_demo" IS 'True for demo/seed posts. Never set on real user posts.';



COMMENT ON COLUMN "public"."posts"."content_type" IS 'Content classification used for feed diversity and AI recommendations.';



COMMENT ON COLUMN "public"."posts"."tags" IS 'Searchable free-form tags. e.g. {silk-press, natural-hair, protective-style}';



COMMENT ON COLUMN "public"."posts"."featured" IS 'Provider-pinned post. Shown first on their profile and gets a feed visibility bonus.';



COMMENT ON COLUMN "public"."posts"."engagement_score" IS 'Composite signal: profile views from post, saves, booking clicks. Updated by background job.';



COMMENT ON COLUMN "public"."posts"."service_type" IS 'The specific service this post demonstrates, e.g. "Silk Press" or "Skin Fade".';



COMMENT ON COLUMN "public"."posts"."visibility" IS 'public = everyone, followers_only = gated to followers (future).';



COMMENT ON COLUMN "public"."posts"."thumbnail_url" IS 'Server-generated thumbnail for video posts. Null for images.';



COMMENT ON COLUMN "public"."posts"."sort_order" IS 'Manual sort weight within a provider portfolio. Lower value = shown first.';



COMMENT ON COLUMN "public"."posts"."comment_count" IS 'Denormalized comment count for fast display.';



CREATE TABLE IF NOT EXISTS "public"."provider_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "weekday" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "timezone" "text" DEFAULT 'America/Chicago'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_availability_time_check" CHECK (("start_time" < "end_time")),
    CONSTRAINT "provider_availability_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


ALTER TABLE "public"."provider_availability" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_availability" IS 'Weekly provider availability blocks. Weekday uses 0=Sunday through 6=Saturday.';



CREATE TABLE IF NOT EXISTS "public"."provider_blocked_dates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."provider_blocked_dates" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_blocked_dates" IS 'Provider-specific unavailable dates for vacations, emergencies, and one-off blocks.';



CREATE TABLE IF NOT EXISTS "public"."provider_booking_clicks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "viewer_user_id" "uuid",
    "source" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."provider_booking_clicks" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_booking_clicks" IS 'Booking CTA click analytics by provider profile source.';



CREATE TABLE IF NOT EXISTS "public"."provider_booking_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "minimum_notice_hours" integer DEFAULT 2 NOT NULL,
    "same_day_booking" boolean DEFAULT true NOT NULL,
    "requires_manual_approval" boolean DEFAULT true NOT NULL,
    "appointment_time_required" boolean DEFAULT true NOT NULL,
    "max_bookings_per_day" integer DEFAULT 10 NOT NULL,
    "buffer_minutes" integer DEFAULT 15 NOT NULL,
    "lateness_grace_minutes" integer DEFAULT 60 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text" DEFAULT 'America/Chicago'::"text" NOT NULL,
    "cancellation_window_hours" integer DEFAULT 24 NOT NULL,
    "vacation_mode" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."provider_booking_preferences" OWNER TO "postgres";


COMMENT ON COLUMN "public"."provider_booking_preferences"."timezone" IS 'IANA timezone used for provider availability display and future timezone-safe scheduling.';



COMMENT ON COLUMN "public"."provider_booking_preferences"."cancellation_window_hours" IS 'Minimum hours before appointment required for standard client cancellation.';



COMMENT ON COLUMN "public"."provider_booking_preferences"."vacation_mode" IS 'When true, clients cannot request new appointment times.';



CREATE TABLE IF NOT EXISTS "public"."provider_follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "follower_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."provider_follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_metrics_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "profile_views" integer DEFAULT 0 NOT NULL,
    "discovery_impressions" integer DEFAULT 0 NOT NULL,
    "bookings_requested" integer DEFAULT 0 NOT NULL,
    "bookings_completed" integer DEFAULT 0 NOT NULL,
    "bookings_cancelled" integer DEFAULT 0 NOT NULL,
    "reviews_received" integer DEFAULT 0 NOT NULL,
    "follows_received" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."provider_metrics_daily" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_metrics_daily" IS 'Rolled-up daily engagement and conversion metrics per provider.';



CREATE TABLE IF NOT EXISTS "public"."provider_policies" (
    "provider_id" "uuid" NOT NULL,
    "cancellation_fee_percent" integer DEFAULT 0 NOT NULL,
    "no_show_fee_percent" integer DEFAULT 100 NOT NULL,
    "reschedule_window" "text" DEFAULT '24 hours before'::"text" NOT NULL,
    "reschedule_fee_enabled" boolean DEFAULT false NOT NULL,
    "reschedule_fee" numeric DEFAULT 0 NOT NULL,
    "reschedule_limit" "text" DEFAULT 'Once per booking'::"text" NOT NULL,
    "travel_fee_type" "text" DEFAULT 'per-mile'::"text" NOT NULL,
    "travel_fee_amount" numeric DEFAULT 0 NOT NULL,
    "free_travel_radius_miles" integer DEFAULT 5 NOT NULL,
    "max_travel_distance_miles" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "provider_policies_travel_fee_type_check" CHECK (("travel_fee_type" = ANY (ARRAY['flat'::"text", 'per-mile'::"text", 'free'::"text"])))
);


ALTER TABLE "public"."provider_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_profile_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "viewer_user_id" "uuid",
    "session_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."provider_profile_views" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_profile_views" IS 'One row per profile view event. Application enforces one view per user per provider per day.';



CREATE TABLE IF NOT EXISTS "public"."provider_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "reviewer_user_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "review_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewer_display_name" "text",
    "is_demo" boolean DEFAULT false NOT NULL,
    "tags" "text"[],
    CONSTRAINT "provider_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."provider_reviews" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_reviews" IS 'Verified reviews — only completed, payment-verified bookings qualify.';



COMMENT ON COLUMN "public"."provider_reviews"."booking_id" IS 'Unique — one review per booking, enforced at column level.';



COMMENT ON COLUMN "public"."provider_reviews"."tags" IS 'Optional chip tags selected on the review screen. Lowercase canonicalization handled in app code if needed.';



CREATE TABLE IF NOT EXISTS "public"."provider_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price" numeric(10,2) NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deposit_required" boolean DEFAULT false NOT NULL,
    "deposit_type" "text",
    "deposit_amount" numeric,
    CONSTRAINT "provider_services_deposit_type_check" CHECK (("deposit_type" = ANY (ARRAY['fixed'::"text", 'percentage'::"text"])))
);


ALTER TABLE "public"."provider_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_limit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "report_type" "text" NOT NULL,
    "report_reason" "text" NOT NULL,
    "report_status" "text" DEFAULT 'open'::"text" NOT NULL,
    "notes" "text",
    "admin_notes" "text",
    "reporter_user_id" "uuid" NOT NULL,
    "reported_provider_id" "uuid",
    "reported_user_id" "uuid",
    "booking_id" "uuid",
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    CONSTRAINT "reports_admin_notes_length_check" CHECK ((("admin_notes" IS NULL) OR ("char_length"("admin_notes") <= 4000))),
    CONSTRAINT "reports_notes_length_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 2000))),
    CONSTRAINT "reports_reason_length_check" CHECK ((("char_length"("report_reason") >= 2) AND ("char_length"("report_reason") <= 80))),
    CONSTRAINT "reports_status_check" CHECK (("report_status" = ANY (ARRAY['open'::"text", 'reviewing'::"text", 'resolved'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "reports_target_check" CHECK ((("reported_provider_id" IS NOT NULL) OR ("reported_user_id" IS NOT NULL) OR ("booking_id" IS NOT NULL))),
    CONSTRAINT "reports_type_check" CHECK (("report_type" = ANY (ARRAY['provider'::"text", 'client'::"text", 'booking'::"text", 'content'::"text"])))
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."reports" IS 'Trust and safety reports for providers, clients, bookings, and future content moderation.';



COMMENT ON COLUMN "public"."reports"."report_type" IS 'Moderation target type: provider, client, booking, content.';



COMMENT ON COLUMN "public"."reports"."report_reason" IS 'Reporter-selected reason such as unsafe_behavior, scam, harassment, booking_dispute, inappropriate_conduct, refund_abuse.';



COMMENT ON COLUMN "public"."reports"."report_status" IS 'Admin moderation workflow status: open, reviewing, resolved, dismissed.';



COMMENT ON COLUMN "public"."reports"."notes" IS 'Optional reporter-provided context.';



COMMENT ON COLUMN "public"."reports"."admin_notes" IS 'Private admin moderation notes.';



CREATE TABLE IF NOT EXISTS "public"."saved_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."saved_providers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shift_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shift_id" "uuid",
    "client_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "spend" numeric DEFAULT 0
);


ALTER TABLE "public"."shift_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venue" "text" NOT NULL,
    "shift_date" "date" NOT NULL,
    "expected" numeric NOT NULL,
    "actual" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shifts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."categories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."categories_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."barter_interests"
    ADD CONSTRAINT "barter_interests_offer_id_interested_provider_id_key" UNIQUE ("offer_id", "interested_provider_id");



ALTER TABLE ONLY "public"."barter_interests"
    ADD CONSTRAINT "barter_interests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."barter_offers"
    ADD CONSTRAINT "barter_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_events"
    ADD CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."care_reminders"
    ADD CONSTRAINT "care_reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."client_reviews"
    ADD CONSTRAINT "client_reviews_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."client_reviews"
    ADD CONSTRAINT "client_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_bookmarks"
    ADD CONSTRAINT "community_bookmarks_pkey" PRIMARY KEY ("user_id", "post_id");



ALTER TABLE ONLY "public"."community_post_likes"
    ADD CONSTRAINT "community_post_likes_pkey" PRIMARY KEY ("user_id", "post_id");



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_replies"
    ADD CONSTRAINT "community_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_reports"
    ADD CONSTRAINT "community_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_signatures"
    ADD CONSTRAINT "contract_signatures_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."contract_signatures"
    ADD CONSTRAINT "contract_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_provider_id_key" UNIQUE ("provider_id");



ALTER TABLE ONLY "public"."conversation"
    ADD CONSTRAINT "conversation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation"
    ADD CONSTRAINT "conversation_unique_pair" UNIQUE ("client_id", "provider_id");



ALTER TABLE ONLY "public"."feature_interest"
    ADD CONSTRAINT "feature_interest_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_interest"
    ADD CONSTRAINT "feature_interest_user_id_feature_name_key" UNIQUE ("user_id", "feature_name");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_comments"
    ADD CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_post_id_user_id_key" UNIQUE ("post_id", "user_id");



ALTER TABLE ONLY "public"."post_saves"
    ADD CONSTRAINT "post_saves_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_saves"
    ADD CONSTRAINT "post_saves_post_id_user_id_key" UNIQUE ("post_id", "user_id");



ALTER TABLE ONLY "public"."post_views"
    ADD CONSTRAINT "post_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_availability"
    ADD CONSTRAINT "provider_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_blocked_dates"
    ADD CONSTRAINT "provider_blocked_dates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_blocked_dates"
    ADD CONSTRAINT "provider_blocked_dates_provider_id_date_key" UNIQUE ("provider_id", "date");



ALTER TABLE ONLY "public"."provider_booking_clicks"
    ADD CONSTRAINT "provider_booking_clicks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_booking_preferences"
    ADD CONSTRAINT "provider_booking_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_booking_preferences"
    ADD CONSTRAINT "provider_booking_preferences_provider_id_key" UNIQUE ("provider_id");



ALTER TABLE ONLY "public"."provider_follows"
    ADD CONSTRAINT "provider_follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_follows"
    ADD CONSTRAINT "provider_follows_provider_id_follower_user_id_key" UNIQUE ("provider_id", "follower_user_id");



ALTER TABLE ONLY "public"."provider_metrics_daily"
    ADD CONSTRAINT "provider_metrics_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_metrics_daily"
    ADD CONSTRAINT "provider_metrics_daily_provider_id_date_key" UNIQUE ("provider_id", "date");



ALTER TABLE ONLY "public"."provider_policies"
    ADD CONSTRAINT "provider_policies_pkey" PRIMARY KEY ("provider_id");



ALTER TABLE ONLY "public"."provider_profile_views"
    ADD CONSTRAINT "provider_profile_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_reviews"
    ADD CONSTRAINT "provider_reviews_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."provider_reviews"
    ADD CONSTRAINT "provider_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_services"
    ADD CONSTRAINT "provider_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."providers"
    ADD CONSTRAINT "providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."providers"
    ADD CONSTRAINT "providers_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."providers"
    ADD CONSTRAINT "providers_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."rate_limit_log"
    ADD CONSTRAINT "rate_limit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_providers"
    ADD CONSTRAINT "saved_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_providers"
    ADD CONSTRAINT "saved_providers_user_id_provider_id_key" UNIQUE ("user_id", "provider_id");



ALTER TABLE ONLY "public"."shift_clients"
    ADD CONSTRAINT "shift_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_pkey" PRIMARY KEY ("id");



CREATE INDEX "booking_events_booking_id_idx" ON "public"."booking_events" USING "btree" ("booking_id");



CREATE INDEX "booking_events_created_at_idx" ON "public"."booking_events" USING "btree" ("created_at" DESC);



CREATE INDEX "booking_events_event_type_idx" ON "public"."booking_events" USING "btree" ("event_type");



CREATE INDEX "bookings_capture_due_idx" ON "public"."bookings" USING "btree" ("capture_scheduled_for") WHERE (("payment_status" = 'authorized'::"text") AND ("issue_reported" = false) AND ("payment_finalized" = false));



CREATE INDEX "client_reviews_client_user_id_idx" ON "public"."client_reviews" USING "btree" ("client_user_id");



CREATE INDEX "client_reviews_created_at_idx" ON "public"."client_reviews" USING "btree" ("created_at" DESC);



CREATE INDEX "client_reviews_reviewer_provider_id_idx" ON "public"."client_reviews" USING "btree" ("reviewer_provider_id");



CREATE INDEX "idx_bookings_dispute_flag" ON "public"."bookings" USING "btree" ("created_at" DESC) WHERE ("dispute_flag" = true);



CREATE INDEX "idx_bookings_no_show_flag" ON "public"."bookings" USING "btree" ("created_at" DESC) WHERE ("no_show_flag" = true);



CREATE INDEX "idx_bookings_refund_status" ON "public"."bookings" USING "btree" ("refund_status", "created_at" DESC);



CREATE INDEX "idx_pmd_provider_date" ON "public"."provider_metrics_daily" USING "btree" ("provider_id", "date" DESC);



CREATE INDEX "idx_post_comments_created" ON "public"."post_comments" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_post_comments_post_created" ON "public"."post_comments" USING "btree" ("post_id", "created_at" DESC);



CREATE INDEX "idx_post_comments_post_id" ON "public"."post_comments" USING "btree" ("post_id");



CREATE INDEX "idx_post_likes_post" ON "public"."post_likes" USING "btree" ("post_id");



CREATE INDEX "idx_post_saves_post" ON "public"."post_saves" USING "btree" ("post_id");



CREATE INDEX "idx_post_views_post_created" ON "public"."post_views" USING "btree" ("post_id", "created_at" DESC);



CREATE INDEX "idx_post_views_provider_created" ON "public"."post_views" USING "btree" ("provider_id", "created_at" DESC);



CREATE INDEX "idx_ppv_created_at" ON "public"."provider_profile_views" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ppv_provider_id" ON "public"."provider_profile_views" USING "btree" ("provider_id");



CREATE INDEX "idx_ppv_viewer_provider" ON "public"."provider_profile_views" USING "btree" ("provider_id", "viewer_user_id") WHERE ("viewer_user_id" IS NOT NULL);



CREATE INDEX "idx_provider_availability_provider_weekday" ON "public"."provider_availability" USING "btree" ("provider_id", "weekday", "start_time");



CREATE INDEX "idx_provider_blocked_dates_provider_date" ON "public"."provider_blocked_dates" USING "btree" ("provider_id", "date");



CREATE INDEX "idx_provider_booking_clicks_provider_created" ON "public"."provider_booking_clicks" USING "btree" ("provider_id", "created_at" DESC);



CREATE INDEX "idx_providers_is_featured" ON "public"."providers" USING "btree" ("is_featured") WHERE ("is_featured" = true);



CREATE INDEX "idx_providers_pending_verification" ON "public"."providers" USING "btree" ("verification_submitted_at") WHERE ("verification_status" = 'pending'::"text");



CREATE INDEX "idx_providers_verification_status" ON "public"."providers" USING "btree" ("verification_status");



CREATE INDEX "idx_reports_booking" ON "public"."reports" USING "btree" ("booking_id", "created_at" DESC) WHERE ("booking_id" IS NOT NULL);



CREATE INDEX "idx_reports_provider" ON "public"."reports" USING "btree" ("reported_provider_id", "created_at" DESC) WHERE ("reported_provider_id" IS NOT NULL);



CREATE INDEX "idx_reports_reporter" ON "public"."reports" USING "btree" ("reporter_user_id", "created_at" DESC);



CREATE INDEX "idx_reports_status_created" ON "public"."reports" USING "btree" ("report_status", "created_at" DESC);



CREATE INDEX "idx_reports_type_created" ON "public"."reports" USING "btree" ("report_type", "created_at" DESC);



CREATE INDEX "idx_reports_user" ON "public"."reports" USING "btree" ("reported_user_id", "created_at" DESC) WHERE ("reported_user_id" IS NOT NULL);



CREATE INDEX "posts_active_idx" ON "public"."posts" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "posts_content_type_idx" ON "public"."posts" USING "btree" ("content_type");



CREATE INDEX "posts_created_idx" ON "public"."posts" USING "btree" ("created_at" DESC);



CREATE INDEX "posts_engagement_score_idx" ON "public"."posts" USING "btree" ("engagement_score" DESC);



CREATE INDEX "posts_featured_idx" ON "public"."posts" USING "btree" ("featured") WHERE ("featured" = true);



CREATE INDEX "posts_feed_composite_idx" ON "public"."posts" USING "btree" ("is_active", "visibility", "engagement_score" DESC, "created_at" DESC) WHERE (("is_active" = true) AND ("visibility" = 'public'::"text"));



CREATE INDEX "posts_is_demo_idx" ON "public"."posts" USING "btree" ("is_demo") WHERE ("is_demo" = true);



CREATE INDEX "posts_provider_idx" ON "public"."posts" USING "btree" ("provider_id");



CREATE INDEX "posts_tags_gin_idx" ON "public"."posts" USING "gin" ("tags");



CREATE INDEX "provider_follows_follower_idx" ON "public"."provider_follows" USING "btree" ("follower_user_id");



CREATE INDEX "provider_follows_provider_idx" ON "public"."provider_follows" USING "btree" ("provider_id");



CREATE INDEX "provider_reviews_created_at_idx" ON "public"."provider_reviews" USING "btree" ("created_at" DESC);



CREATE INDEX "provider_reviews_provider_id_idx" ON "public"."provider_reviews" USING "btree" ("provider_id");



CREATE INDEX "provider_reviews_reviewer_id_idx" ON "public"."provider_reviews" USING "btree" ("reviewer_user_id");



CREATE INDEX "provider_services_is_active_idx" ON "public"."provider_services" USING "btree" ("is_active");



CREATE INDEX "provider_services_provider_id_idx" ON "public"."provider_services" USING "btree" ("provider_id");



CREATE INDEX "providers_category_idx" ON "public"."providers" USING "btree" ("category_id");



CREATE INDEX "providers_is_demo_idx" ON "public"."providers" USING "btree" ("is_demo") WHERE ("is_demo" = true);



CREATE INDEX "providers_most_booked_idx" ON "public"."providers" USING "btree" ("total_bookings" DESC);



CREATE INDEX "providers_profile_style_idx" ON "public"."providers" USING "btree" ("profile_style") WHERE ("profile_style" IS NOT NULL);



CREATE INDEX "providers_specialties_gin_idx" ON "public"."providers" USING "gin" ("specialties");



CREATE UNIQUE INDEX "providers_stripe_account_id_unique" ON "public"."providers" USING "btree" ("stripe_account_id") WHERE ("stripe_account_id" IS NOT NULL);



CREATE INDEX "providers_trending_idx" ON "public"."providers" USING "btree" ("is_trending", "bookings_this_week" DESC) WHERE ("is_trending" = true);



CREATE INDEX "providers_username_idx" ON "public"."providers" USING "btree" ("username");



CREATE INDEX "rate_limit_log_lookup" ON "public"."rate_limit_log" USING "btree" ("user_id", "action", "created_at" DESC);



CREATE OR REPLACE TRIGGER "provider_availability_updated_at" BEFORE UPDATE ON "public"."provider_availability" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "provider_booking_preferences_updated_at" BEFORE UPDATE ON "public"."provider_booking_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "provider_reviews_recompute_rating" AFTER INSERT OR DELETE OR UPDATE ON "public"."provider_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."recompute_provider_rating"();



CREATE OR REPLACE TRIGGER "provider_services_updated_at" BEFORE UPDATE ON "public"."provider_services" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "providers_updated_at" BEFORE UPDATE ON "public"."providers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "providers_verification_admin_only" BEFORE UPDATE ON "public"."providers" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_provider_verification_self_update"();



CREATE OR REPLACE TRIGGER "reports_updated_at" BEFORE UPDATE ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_community_like_count" AFTER INSERT OR DELETE ON "public"."community_post_likes" FOR EACH ROW EXECUTE FUNCTION "public"."update_community_like_count"();



CREATE OR REPLACE TRIGGER "trg_community_reply_count" AFTER INSERT OR DELETE ON "public"."community_replies" FOR EACH ROW EXECUTE FUNCTION "public"."update_community_reply_count"();



CREATE OR REPLACE TRIGGER "trg_no_self_booking" BEFORE INSERT OR UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."reject_self_provider_action"('user_id');



CREATE OR REPLACE TRIGGER "trg_no_self_conversation" BEFORE INSERT OR UPDATE ON "public"."conversation" FOR EACH ROW EXECUTE FUNCTION "public"."reject_self_provider_action"('client_id');



CREATE OR REPLACE TRIGGER "trg_no_self_follow" BEFORE INSERT OR UPDATE ON "public"."provider_follows" FOR EACH ROW EXECUTE FUNCTION "public"."reject_self_provider_action"('follower_user_id');



CREATE OR REPLACE TRIGGER "trg_no_self_review" BEFORE INSERT OR UPDATE ON "public"."provider_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."reject_self_provider_action"('reviewer_user_id');



CREATE OR REPLACE TRIGGER "trg_no_self_save" BEFORE INSERT OR UPDATE ON "public"."saved_providers" FOR EACH ROW EXECUTE FUNCTION "public"."reject_self_provider_action"('user_id');



CREATE OR REPLACE TRIGGER "trg_post_comment_count" AFTER INSERT OR DELETE ON "public"."post_comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_post_comment_count"();



CREATE OR REPLACE TRIGGER "trg_post_like_count" AFTER INSERT OR DELETE ON "public"."post_likes" FOR EACH ROW EXECUTE FUNCTION "public"."update_post_like_count"();



CREATE OR REPLACE TRIGGER "trg_post_save_count" AFTER INSERT OR DELETE ON "public"."post_saves" FOR EACH ROW EXECUTE FUNCTION "public"."update_post_save_count"();



ALTER TABLE ONLY "public"."barter_interests"
    ADD CONSTRAINT "barter_interests_interested_provider_id_fkey" FOREIGN KEY ("interested_provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."barter_interests"
    ADD CONSTRAINT "barter_interests_interested_user_id_fkey" FOREIGN KEY ("interested_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."barter_interests"
    ADD CONSTRAINT "barter_interests_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "public"."barter_offers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."barter_offers"
    ADD CONSTRAINT "barter_offers_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."barter_offers"
    ADD CONSTRAINT "barter_offers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_events"
    ADD CONSTRAINT "booking_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."provider_services"("id");



ALTER TABLE ONLY "public"."care_reminders"
    ADD CONSTRAINT "care_reminders_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."care_reminders"
    ADD CONSTRAINT "care_reminders_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_reviews"
    ADD CONSTRAINT "client_reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_reviews"
    ADD CONSTRAINT "client_reviews_reviewer_provider_id_fkey" FOREIGN KEY ("reviewer_provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_bookmarks"
    ADD CONSTRAINT "community_bookmarks_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_bookmarks"
    ADD CONSTRAINT "community_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_post_likes"
    ADD CONSTRAINT "community_post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_post_likes"
    ADD CONSTRAINT "community_post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_replies"
    ADD CONSTRAINT "community_replies_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_replies"
    ADD CONSTRAINT "community_replies_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_replies"
    ADD CONSTRAINT "community_replies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_reports"
    ADD CONSTRAINT "community_reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_reports"
    ADD CONSTRAINT "community_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_signatures"
    ADD CONSTRAINT "contract_signatures_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_signatures"
    ADD CONSTRAINT "contract_signatures_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_signatures"
    ADD CONSTRAINT "contract_signatures_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feature_interest"
    ADD CONSTRAINT "feature_interest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_comments"
    ADD CONSTRAINT "post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_saves"
    ADD CONSTRAINT "post_saves_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_saves"
    ADD CONSTRAINT "post_saves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_views"
    ADD CONSTRAINT "post_views_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_views"
    ADD CONSTRAINT "post_views_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_views"
    ADD CONSTRAINT "post_views_viewer_user_id_fkey" FOREIGN KEY ("viewer_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_availability"
    ADD CONSTRAINT "provider_availability_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_blocked_dates"
    ADD CONSTRAINT "provider_blocked_dates_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_booking_clicks"
    ADD CONSTRAINT "provider_booking_clicks_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_booking_clicks"
    ADD CONSTRAINT "provider_booking_clicks_viewer_user_id_fkey" FOREIGN KEY ("viewer_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."provider_booking_preferences"
    ADD CONSTRAINT "provider_booking_preferences_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_follows"
    ADD CONSTRAINT "provider_follows_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_metrics_daily"
    ADD CONSTRAINT "provider_metrics_daily_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_policies"
    ADD CONSTRAINT "provider_policies_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_profile_views"
    ADD CONSTRAINT "provider_profile_views_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_reviews"
    ADD CONSTRAINT "provider_reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_reviews"
    ADD CONSTRAINT "provider_reviews_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_services"
    ADD CONSTRAINT "provider_services_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."providers"
    ADD CONSTRAINT "providers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");



ALTER TABLE ONLY "public"."providers"
    ADD CONSTRAINT "providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rate_limit_log"
    ADD CONSTRAINT "rate_limit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_provider_id_fkey" FOREIGN KEY ("reported_provider_id") REFERENCES "public"."providers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."saved_providers"
    ADD CONSTRAINT "saved_providers_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_providers"
    ADD CONSTRAINT "saved_providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_clients"
    ADD CONSTRAINT "shift_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_clients"
    ADD CONSTRAINT "shift_clients_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can read provider availability" ON "public"."provider_availability" FOR SELECT USING (true);



CREATE POLICY "Anyone can read provider blocked dates" ON "public"."provider_blocked_dates" FOR SELECT USING (true);



CREATE POLICY "Participants can read messages" ON "public"."messages" FOR SELECT TO "authenticated" USING (("conversation_id" IN ( SELECT "conversation"."id"
   FROM "public"."conversation"
  WHERE (("conversation"."client_id" = "auth"."uid"()) OR ("conversation"."provider_id" IN ( SELECT "providers"."id"
           FROM "public"."providers"
          WHERE ("providers"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Participants can send messages" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("conversation_id" IN ( SELECT "conversation"."id"
   FROM "public"."conversation"
  WHERE (("conversation"."client_id" = "auth"."uid"()) OR ("conversation"."provider_id" IN ( SELECT "providers"."id"
           FROM "public"."providers"
          WHERE ("providers"."user_id" = "auth"."uid"()))))))));



CREATE POLICY "Providers can view their bookings" ON "public"."bookings" FOR SELECT USING (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Providers manage own availability" ON "public"."provider_availability" USING (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"())))) WITH CHECK (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Providers manage own blocked dates" ON "public"."provider_blocked_dates" USING (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"())))) WITH CHECK (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Providers read booking clicks" ON "public"."provider_booking_clicks" FOR SELECT USING (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Providers read own daily metrics" ON "public"."provider_metrics_daily" FOR SELECT USING (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Providers read own profile views" ON "public"."provider_profile_views" FOR SELECT USING (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Providers read post views" ON "public"."post_views" FOR SELECT USING (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can create conversations" ON "public"."conversation" FOR INSERT WITH CHECK ((("auth"."uid"() = "client_id") OR ("auth"."uid"() IN ( SELECT "providers"."user_id"
   FROM "public"."providers"
  WHERE ("providers"."id" = "conversation"."provider_id")))));



CREATE POLICY "Users can create reports" ON "public"."reports" FOR INSERT WITH CHECK (("auth"."uid"() = "reporter_user_id"));



CREATE POLICY "Users can insert own bookings" ON "public"."bookings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own interest" ON "public"."feature_interest" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read own reports" ON "public"."reports" FOR SELECT USING (("auth"."uid"() = "reporter_user_id"));



CREATE POLICY "Users can read their own interest" ON "public"."feature_interest" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own bookings" ON "public"."bookings" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their conversations" ON "public"."conversation" FOR SELECT USING ((("auth"."uid"() = "client_id") OR ("auth"."uid"() IN ( SELECT "providers"."user_id"
   FROM "public"."providers"
  WHERE ("providers"."id" = "conversation"."provider_id")))));



CREATE POLICY "auth users can follow" ON "public"."provider_follows" FOR INSERT WITH CHECK (("auth"."uid"() = "follower_user_id"));



CREATE POLICY "auth users can unfollow" ON "public"."provider_follows" FOR DELETE USING (("auth"."uid"() = "follower_user_id"));



ALTER TABLE "public"."barter_interests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "barter_interests_offer_owner_read" ON "public"."barter_interests" FOR SELECT USING ((("auth"."uid"() IN ( SELECT "barter_offers"."user_id"
   FROM "public"."barter_offers"
  WHERE ("barter_offers"."id" = "barter_interests"."offer_id"))) OR ("auth"."uid"() = "interested_user_id")));



CREATE POLICY "barter_interests_own_delete" ON "public"."barter_interests" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "interested_user_id"));



CREATE POLICY "barter_interests_owner_update" ON "public"."barter_interests" FOR UPDATE USING (("auth"."uid"() IN ( SELECT "barter_offers"."user_id"
   FROM "public"."barter_offers"
  WHERE ("barter_offers"."id" = "barter_interests"."offer_id"))));



CREATE POLICY "barter_interests_provider_insert" ON "public"."barter_interests" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "interested_user_id") AND ("auth"."uid"() IN ( SELECT "providers"."user_id"
   FROM "public"."providers"))));



ALTER TABLE "public"."barter_offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "barter_offers_owner_delete" ON "public"."barter_offers" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "barter_offers_owner_update" ON "public"."barter_offers" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "barter_offers_provider_insert" ON "public"."barter_offers" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND ("auth"."uid"() IN ( SELECT "providers"."user_id"
   FROM "public"."providers"))));



CREATE POLICY "barter_offers_provider_read" ON "public"."barter_offers" FOR SELECT USING (("auth"."uid"() IN ( SELECT "providers"."user_id"
   FROM "public"."providers")));



ALTER TABLE "public"."booking_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookmarks_own_delete" ON "public"."community_bookmarks" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "bookmarks_own_insert" ON "public"."community_bookmarks" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "bookmarks_own_read" ON "public"."community_bookmarks" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."care_reminders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_public_read" ON "public"."categories" FOR SELECT USING (true);



ALTER TABLE "public"."client_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_reviews_insert_bound" ON "public"."client_reviews" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() IN ( SELECT "p"."user_id"
   FROM "public"."providers" "p"
  WHERE ("p"."id" = "client_reviews"."reviewer_provider_id"))) AND (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "client_reviews"."booking_id") AND ("b"."status" = 'completed'::"text") AND ("b"."provider_id" = "client_reviews"."reviewer_provider_id"))))));



ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_cancel_own_bookings" ON "public"."bookings" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND ("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text"])))) WITH CHECK ((("auth"."uid"() = "user_id") AND ("status" = 'cancelled'::"text") AND ("payment_amount" = "payment_amount") AND ("payment_status" = "payment_status") AND ("payment_finalized" = "payment_finalized") AND ("no_show_flag" = "no_show_flag") AND ("dispute_flag" = "dispute_flag")));



CREATE POLICY "clients_insert_self" ON "public"."clients" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "clients_select_self" ON "public"."clients" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "clients_update_self" ON "public"."clients" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "comments_delete_own" ON "public"."post_comments" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "comments_insert_own" ON "public"."post_comments" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "comments_public_read" ON "public"."post_comments" FOR SELECT USING (true);



ALTER TABLE "public"."community_bookmarks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "community_likes_delete" ON "public"."community_post_likes" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "community_likes_insert" ON "public"."community_post_likes" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "community_likes_provider_read" ON "public"."community_post_likes" FOR SELECT USING (("auth"."uid"() IN ( SELECT "providers"."user_id"
   FROM "public"."providers")));



ALTER TABLE "public"."community_post_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "community_posts_owner_delete" ON "public"."community_posts" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "community_posts_owner_update" ON "public"."community_posts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "community_posts_provider_insert" ON "public"."community_posts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND ("auth"."uid"() IN ( SELECT "providers"."user_id"
   FROM "public"."providers"))));



CREATE POLICY "community_posts_provider_read" ON "public"."community_posts" FOR SELECT USING (("auth"."uid"() IN ( SELECT "providers"."user_id"
   FROM "public"."providers")));



ALTER TABLE "public"."community_replies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "community_replies_owner_delete" ON "public"."community_replies" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "community_replies_provider_insert" ON "public"."community_replies" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND ("auth"."uid"() IN ( SELECT "providers"."user_id"
   FROM "public"."providers"))));



CREATE POLICY "community_replies_provider_read" ON "public"."community_replies" FOR SELECT USING (("auth"."uid"() IN ( SELECT "providers"."user_id"
   FROM "public"."providers")));



ALTER TABLE "public"."community_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_signatures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contracts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contracts_provider_delete" ON "public"."contracts" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "contracts_provider_insert" ON "public"."contracts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND ("auth"."uid"() IN ( SELECT "providers"."user_id"
   FROM "public"."providers"))));



CREATE POLICY "contracts_provider_read" ON "public"."contracts" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() IN ( SELECT "cs"."client_user_id"
   FROM "public"."contract_signatures" "cs"
  WHERE ("cs"."contract_id" = "contracts"."id")))));



CREATE POLICY "contracts_provider_update" ON "public"."contracts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."conversation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feature_interest" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "likes_delete_own" ON "public"."post_likes" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "likes_insert_own" ON "public"."post_likes" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "likes_public_read" ON "public"."post_likes" FOR SELECT USING (true);



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "participants_mark_messages_read" ON "public"."messages" FOR UPDATE TO "authenticated" USING (("conversation_id" IN ( SELECT "conversation"."id"
   FROM "public"."conversation"
  WHERE (("conversation"."client_id" = "auth"."uid"()) OR ("conversation"."provider_id" IN ( SELECT "providers"."id"
           FROM "public"."providers"
          WHERE ("providers"."user_id" = "auth"."uid"()))))))) WITH CHECK ((("conversation_id" IN ( SELECT "conversation"."id"
   FROM "public"."conversation"
  WHERE (("conversation"."client_id" = "auth"."uid"()) OR ("conversation"."provider_id" IN ( SELECT "providers"."id"
           FROM "public"."providers"
          WHERE ("providers"."user_id" = "auth"."uid"())))))) AND ("sender_id" = "sender_id") AND ("content" = "content") AND ("created_at" = "created_at")));



ALTER TABLE "public"."post_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_saves" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "posts_insert_own" ON "public"."posts" FOR INSERT WITH CHECK (("auth"."uid"() = ( SELECT "providers"."user_id"
   FROM "public"."providers"
  WHERE ("providers"."id" = "posts"."provider_id"))));



CREATE POLICY "posts_public_read" ON "public"."posts" FOR SELECT USING (("is_active" = true));



CREATE POLICY "posts_update_own" ON "public"."posts" FOR UPDATE USING (("auth"."uid"() = ( SELECT "providers"."user_id"
   FROM "public"."providers"
  WHERE ("providers"."id" = "posts"."provider_id"))));



ALTER TABLE "public"."provider_availability" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_blocked_dates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_booking_clicks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_booking_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_delete_own_services" ON "public"."provider_services" FOR DELETE USING (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."provider_follows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_insert_own_preferences" ON "public"."provider_booking_preferences" FOR INSERT WITH CHECK (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



CREATE POLICY "provider_insert_own_services" ON "public"."provider_services" FOR INSERT WITH CHECK (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."provider_metrics_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_policies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_policies_owner" ON "public"."provider_policies" USING (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"())))) WITH CHECK (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



CREATE POLICY "provider_policies_read" ON "public"."provider_policies" FOR SELECT USING (true);



ALTER TABLE "public"."provider_profile_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_read_own_preferences" ON "public"."provider_booking_preferences" FOR SELECT USING (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



CREATE POLICY "provider_read_own_services" ON "public"."provider_services" FOR SELECT USING (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."provider_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_reviews_insert_bound" ON "public"."provider_reviews" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "reviewer_user_id") AND (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "provider_reviews"."booking_id") AND ("b"."user_id" = "auth"."uid"()) AND ("b"."provider_id" = "provider_reviews"."provider_id") AND ("b"."status" = 'completed'::"text"))))));



CREATE POLICY "provider_reviews_read" ON "public"."provider_reviews" FOR SELECT USING ((("auth"."uid"() = "reviewer_user_id") OR "public"."provider_review_revealed"("booking_id")));



CREATE POLICY "provider_reviews_read_revealed" ON "public"."provider_reviews" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."client_reviews" "cr"
  WHERE ("cr"."booking_id" = "provider_reviews"."booking_id"))) OR (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "provider_reviews"."booking_id") AND ("b"."completed_at" < ("now"() - '7 days'::interval))))) OR ("auth"."uid"() = "reviewer_user_id")));



CREATE POLICY "provider_select_own_client_reviews" ON "public"."client_reviews" FOR SELECT USING (("reviewer_provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."provider_services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_update_own_preferences" ON "public"."provider_booking_preferences" FOR UPDATE USING (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



CREATE POLICY "provider_update_own_services" ON "public"."provider_services" FOR UPDATE USING (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."providers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "providers_insert_own" ON "public"."providers" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "providers_manage_own_bookings" ON "public"."bookings" FOR UPDATE TO "authenticated" USING (("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"())))) WITH CHECK ((("provider_id" IN ( SELECT "providers"."id"
   FROM "public"."providers"
  WHERE ("providers"."user_id" = "auth"."uid"()))) AND ("payment_amount" = "payment_amount")));



CREATE POLICY "providers_public_read" ON "public"."providers" FOR SELECT USING (true);



CREATE POLICY "providers_update_own" ON "public"."providers" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "providers_update_safe_columns_only" ON "public"."providers" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND ("is_approved" = "is_approved") AND ("is_featured" = "is_featured") AND ("is_trending" = "is_trending") AND ("identity_verified" = "identity_verified") AND ("business_verified" = "business_verified") AND ("verification_status" = "verification_status") AND ("stripe_charges_enabled" = "stripe_charges_enabled") AND ("stripe_payouts_enabled" = "stripe_payouts_enabled") AND ("stripe_onboarding_complete" = "stripe_onboarding_complete") AND ("rating" = "rating") AND ("review_count" = "review_count") AND ("average_rating" = "average_rating")));



CREATE POLICY "public read follows" ON "public"."provider_follows" FOR SELECT USING (true);



CREATE POLICY "public_read_active_services" ON "public"."provider_services" FOR SELECT USING (("is_active" = true));



CREATE POLICY "rate_limit_insert_own" ON "public"."rate_limit_log" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."rate_limit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reminders_own_delete" ON "public"."care_reminders" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "client_user_id"));



CREATE POLICY "reminders_own_insert" ON "public"."care_reminders" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "client_user_id"));



CREATE POLICY "reminders_own_read" ON "public"."care_reminders" FOR SELECT USING (("auth"."uid"() = "client_user_id"));



CREATE POLICY "reminders_own_update" ON "public"."care_reminders" FOR UPDATE USING (("auth"."uid"() = "client_user_id"));



ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reports_insert_own" ON "public"."community_reports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "reporter_user_id"));



CREATE POLICY "saved_delete_own" ON "public"."saved_providers" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "saved_insert_own" ON "public"."saved_providers" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."saved_providers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saved_read_own" ON "public"."saved_providers" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "saves_delete_own" ON "public"."post_saves" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "saves_insert_own" ON "public"."post_saves" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "saves_public_read" ON "public"."post_saves" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "signatures_client_insert" ON "public"."contract_signatures" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "client_user_id"));



CREATE POLICY "signatures_client_update" ON "public"."contract_signatures" FOR UPDATE USING (("auth"."uid"() = "client_user_id"));



CREATE POLICY "signatures_read_own" ON "public"."contract_signatures" FOR SELECT USING ((("auth"."uid"() = "client_user_id") OR ("auth"."uid"() IN ( SELECT "contracts"."user_id"
   FROM "public"."contracts"
  WHERE ("contracts"."id" = "contract_signatures"."contract_id")))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."debug_whoami"() TO "anon";
GRANT ALL ON FUNCTION "public"."debug_whoami"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."debug_whoami"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_provider_verification_self_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_provider_verification_self_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_provider_verification_self_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."provider_review_revealed"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provider_review_revealed"("p_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."provider_review_revealed"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."provider_review_revealed"("p_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_provider_rating"() TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_provider_rating"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_provider_rating"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_self_provider_action"() TO "anon";
GRANT ALL ON FUNCTION "public"."reject_self_provider_action"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_self_provider_action"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_community_like_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_community_like_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_community_like_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_community_reply_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_community_reply_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_community_reply_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_post_comment_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_post_comment_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_post_comment_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_post_like_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_post_like_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_post_like_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_post_save_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_post_save_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_post_save_count"() TO "service_role";



GRANT ALL ON TABLE "public"."barter_interests" TO "anon";
GRANT ALL ON TABLE "public"."barter_interests" TO "authenticated";
GRANT ALL ON TABLE "public"."barter_interests" TO "service_role";



GRANT ALL ON TABLE "public"."barter_offers" TO "anon";
GRANT ALL ON TABLE "public"."barter_offers" TO "authenticated";
GRANT ALL ON TABLE "public"."barter_offers" TO "service_role";



GRANT ALL ON TABLE "public"."booking_events" TO "anon";
GRANT ALL ON TABLE "public"."booking_events" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_events" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."care_reminders" TO "anon";
GRANT ALL ON TABLE "public"."care_reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."care_reminders" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON SEQUENCE "public"."categories_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."categories_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."categories_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."client_reviews" TO "anon";
GRANT ALL ON TABLE "public"."client_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."client_reviews" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."conversation" TO "anon";
GRANT ALL ON TABLE "public"."conversation" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation" TO "service_role";



GRANT ALL ON TABLE "public"."providers" TO "anon";
GRANT ALL ON TABLE "public"."providers" TO "authenticated";
GRANT ALL ON TABLE "public"."providers" TO "service_role";



GRANT ALL ON TABLE "public"."clients_provider" TO "service_role";
GRANT SELECT ON TABLE "public"."clients_provider" TO "authenticated";



GRANT ALL ON TABLE "public"."clients_public" TO "service_role";
GRANT SELECT ON TABLE "public"."clients_public" TO "authenticated";



GRANT ALL ON TABLE "public"."community_bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."community_bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."community_bookmarks" TO "service_role";



GRANT ALL ON TABLE "public"."community_post_likes" TO "anon";
GRANT ALL ON TABLE "public"."community_post_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."community_post_likes" TO "service_role";



GRANT ALL ON TABLE "public"."community_posts" TO "anon";
GRANT ALL ON TABLE "public"."community_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."community_posts" TO "service_role";



GRANT ALL ON TABLE "public"."community_replies" TO "anon";
GRANT ALL ON TABLE "public"."community_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."community_replies" TO "service_role";



GRANT ALL ON TABLE "public"."community_reports" TO "anon";
GRANT ALL ON TABLE "public"."community_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."community_reports" TO "service_role";



GRANT ALL ON TABLE "public"."contract_signatures" TO "anon";
GRANT ALL ON TABLE "public"."contract_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."contracts" TO "anon";
GRANT ALL ON TABLE "public"."contracts" TO "authenticated";
GRANT ALL ON TABLE "public"."contracts" TO "service_role";



GRANT ALL ON TABLE "public"."feature_interest" TO "anon";
GRANT ALL ON TABLE "public"."feature_interest" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_interest" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."post_comments" TO "anon";
GRANT ALL ON TABLE "public"."post_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."post_comments" TO "service_role";



GRANT ALL ON TABLE "public"."post_likes" TO "anon";
GRANT ALL ON TABLE "public"."post_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."post_likes" TO "service_role";



GRANT ALL ON TABLE "public"."post_saves" TO "anon";
GRANT ALL ON TABLE "public"."post_saves" TO "authenticated";
GRANT ALL ON TABLE "public"."post_saves" TO "service_role";



GRANT ALL ON TABLE "public"."post_views" TO "anon";
GRANT ALL ON TABLE "public"."post_views" TO "authenticated";
GRANT ALL ON TABLE "public"."post_views" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT ALL ON TABLE "public"."provider_availability" TO "anon";
GRANT ALL ON TABLE "public"."provider_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_availability" TO "service_role";



GRANT ALL ON TABLE "public"."provider_blocked_dates" TO "anon";
GRANT ALL ON TABLE "public"."provider_blocked_dates" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_blocked_dates" TO "service_role";



GRANT ALL ON TABLE "public"."provider_booking_clicks" TO "anon";
GRANT ALL ON TABLE "public"."provider_booking_clicks" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_booking_clicks" TO "service_role";



GRANT ALL ON TABLE "public"."provider_booking_preferences" TO "anon";
GRANT ALL ON TABLE "public"."provider_booking_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_booking_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."provider_follows" TO "anon";
GRANT ALL ON TABLE "public"."provider_follows" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_follows" TO "service_role";



GRANT ALL ON TABLE "public"."provider_metrics_daily" TO "anon";
GRANT ALL ON TABLE "public"."provider_metrics_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_metrics_daily" TO "service_role";



GRANT ALL ON TABLE "public"."provider_policies" TO "anon";
GRANT ALL ON TABLE "public"."provider_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_policies" TO "service_role";



GRANT ALL ON TABLE "public"."provider_profile_views" TO "anon";
GRANT ALL ON TABLE "public"."provider_profile_views" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_profile_views" TO "service_role";



GRANT ALL ON TABLE "public"."provider_reviews" TO "anon";
GRANT ALL ON TABLE "public"."provider_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."provider_services" TO "anon";
GRANT ALL ON TABLE "public"."provider_services" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_services" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_log" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_log" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."saved_providers" TO "anon";
GRANT ALL ON TABLE "public"."saved_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_providers" TO "service_role";



GRANT ALL ON TABLE "public"."shift_clients" TO "anon";
GRANT ALL ON TABLE "public"."shift_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_clients" TO "service_role";



GRANT ALL ON TABLE "public"."shifts" TO "anon";
GRANT ALL ON TABLE "public"."shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."shifts" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- ============================= 3. ACL CORRECTIONS (S1B; counteract Supabase default privileges) =============================
-- pg_dump could not express these (see header note b). Re-qualify search_path
-- first: the dump preamble set it to '' and the storage policies below reference
-- unqualified public tables.
set search_path = public, extensions, storage;

-- clients (base table): remove anon entirely; trim authenticated back to the live
-- verb set (select,insert,update,maintain) by revoking the default-granted extras.
revoke all privileges on public.clients from anon;
revoke delete, truncate, references, trigger on public.clients from authenticated;

-- clients_public / clients_provider (S1B views): authenticated SELECT only, no anon.
revoke all on public.clients_public   from anon, authenticated;
grant  select on public.clients_public   to authenticated;
revoke all on public.clients_provider from anon, authenticated;
grant  select on public.clients_provider to authenticated;

-- ============================= 11. STORAGE =============================
-- Storage schema is Supabase-managed and assumed present. Below: application-owned
-- bucket config rows and application-specific storage.objects policies.
-- SECURITY: these object policies reproduce live AS-IS incl the F3-P1-003 weaknesses
-- (contract_pdfs_read / signatures_read_own_storage not object-bound; provider_media
-- delete/update not ownership-bound). NOT fixed here; forward-remediate in S2.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('contract-pdfs',       'contract-pdfs',       false, null,     null),
  ('contract-signatures', 'contract-signatures', false, null,     null),
  ('posts-media',         'posts-media',         true,  52428800, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm']),
  ('provider-media',      'provider-media',      true,  52428800, array['image/*','video/*','mp4/*'])
on conflict (id) do nothing;

create policy "Authenticated users can upload 1x3bwnc_0" on storage.objects
  as permissive for insert to public
  with check (((bucket_id = 'provider-media'::text) AND (auth.uid() IS NOT NULL)));
create policy "contract_pdfs_delete_own" on storage.objects
  as permissive for delete to authenticated
  using (((bucket_id = 'contract-pdfs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "contract_pdfs_read" on storage.objects
  as permissive for select to public
  using (((bucket_id = 'contract-pdfs'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (auth.uid() IN ( SELECT cs.client_user_id
   FROM (contract_signatures cs
     JOIN contracts c ON ((c.id = cs.contract_id)))
  WHERE (c.pdf_url IS NOT NULL))))));
create policy "contract_pdfs_upload_own" on storage.objects
  as permissive for insert to authenticated
  with check (((bucket_id = 'contract-pdfs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "posts_media_authenticated_upload" on storage.objects
  as permissive for insert to authenticated
  with check ((bucket_id = 'posts-media'::text));
create policy "posts_media_public_read" on storage.objects
  as permissive for select to public
  using ((bucket_id = 'posts-media'::text));
create policy "provider_media_authenticated_delete" on storage.objects
  as permissive for delete to authenticated
  using ((bucket_id = 'provider-media'::text));
create policy "provider_media_authenticated_update" on storage.objects
  as permissive for update to authenticated
  using ((bucket_id = 'provider-media'::text));
create policy "provider_media_authenticated_upload" on storage.objects
  as permissive for insert to authenticated
  with check ((bucket_id = 'provider-media'::text));
create policy "provider_media_public_read" on storage.objects
  as permissive for select to public
  using ((bucket_id = 'provider-media'::text));
create policy "signatures_read_own_storage" on storage.objects
  as permissive for select to public
  using (((bucket_id = 'contract-signatures'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (auth.uid() IN ( SELECT providers.user_id
   FROM providers)))));
create policy "signatures_upload_own" on storage.objects
  as permissive for insert to authenticated
  with check (((bucket_id = 'contract-signatures'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- ============================= UNKNOWNS =============================
-- * Population mechanism/purpose of live-only tables booking_events,
--   provider_metrics_daily, post_views, provider_profile_views,
--   provider_booking_clicks, shifts, shift_clients: no app .from / no trigger
--   writer found. Captured structurally; semantics UNKNOWN.
-- * feature_interest / rate_limit_log are live tables defined only in loose
--   repo SQL / Edge Function docs, not in migrations.
-- * feature_interest_count() function is absent live (app .rpc call would fail).
-- END OF SNAPSHOT
