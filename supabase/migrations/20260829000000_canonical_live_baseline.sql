-- =============================================================================
-- CANONICAL LIVE BASELINE (candidate)  -- public application schema
-- =============================================================================
-- Derived from docs/audits/F4_LIVE_SCHEMA_SNAPSHOT.sql (exact pg_get_* capture of
-- live project kxregomuawwcqvisuhtr, Postgres 17.6, post-S1B).
--
-- PURPOSE: reproduce the CURRENT live application-owned schema on a FRESH,
-- ISOLATED Supabase project for validation (F5B). It intentionally reproduces
-- current live state INCLUDING known-bad security definitions (see F3): it is a
-- reproducibility artifact, not a cleanup. Security fixes are forward migrations
-- authored AFTER this baseline (batch S2).
--
-- DO NOT apply this to the linked/live project. DO NOT db push / migration repair
-- until F5B has applied it to an isolated fresh environment and proven equivalence.
--
-- PREREQUISITES assumed present on a fresh Supabase project (NOT created here):
--   schemas: auth, storage, extensions, vault, graphql, etc. (Supabase-managed)
--   extensions: plpgsql (default), supabase_vault, pg_stat_statements (managed)
--   roles: anon, authenticated, service_role, postgres (Supabase-managed)
--   table: auth.users (referenced by some FKs)
-- =============================================================================

-- ============================= 1. EXTENSIONS (app-relevant only) =============================
create extension if not exists "pgcrypto" with schema extensions;   -- gen_random_uuid()
create extension if not exists "uuid-ossp" with schema extensions;

-- ============================= 1b. SEQUENCES (1) =============================
-- CORRECTION (F5B): the F4 relation capture excluded sequences (relkind 'S').
-- categories.id is a serial-style integer PK whose default references this
-- owned sequence; it must exist BEFORE the categories table below. Ownership
-- (OWNED BY) is set after the table/column exists (see section 2b). Exact live
-- attributes: integer, start 1, increment 1, minvalue 1, maxvalue 2147483647,
-- cache 1, no cycle. Live ACL grants anon/authenticated/service_role USAGE,
-- SELECT, UPDATE (reproduced as-is).
create sequence if not exists public.categories_id_seq
  as integer increment by 1 minvalue 1 maxvalue 2147483647 start with 1 cache 1 no cycle;
grant usage, select, update on sequence public.categories_id_seq to anon, authenticated, service_role;

-- ============================= 2. TABLES (39) =============================

create table public.barter_interests (
  id uuid not null default gen_random_uuid(),
  offer_id uuid not null,
  interested_provider_id uuid not null,
  interested_user_id uuid not null,
  message text,
  status text not null default 'pending'::text,
  created_at timestamp with time zone not null default now()
);

create table public.barter_offers (
  id uuid not null default gen_random_uuid(),
  provider_id uuid not null,
  user_id uuid not null,
  offering_service text not null,
  seeking_service text not null,
  offering_value integer,
  notes text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table public.booking_events (
  id uuid not null default gen_random_uuid(),
  booking_id uuid,
  event_type text not null,
  actor_type text,
  actor_id uuid,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table public.bookings (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  provider_id uuid not null,
  service_name text not null,
  requested_date date not null,
  requested_time text,
  message text,
  status text default 'pending'::text,
  created_at timestamp with time zone default now(),
  appointment_time timestamp with time zone,
  client_checked_in_at timestamp with time zone,
  provider_confirmed_at timestamp with time zone,
  completed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  cancellation_reason text,
  service_id uuid,
  stripe_payment_intent_id text,
  payment_status text not null default 'unpaid'::text,
  payment_amount numeric(10,2),
  payment_authorized_at timestamp with time zone,
  payment_captured_at timestamp with time zone,
  stripe_last_event_id text,
  stripe_last_event_at timestamp with time zone,
  issue_reported boolean not null default false,
  issue_reported_at timestamp with time zone,
  issue_reason text,
  under_review boolean not null default false,
  capture_scheduled_for timestamp with time zone,
  payment_finalized boolean not null default false,
  provider_first_response_at timestamp with time zone,
  cancelled_by text,
  cancellation_actor text,
  refund_status text not null default 'none'::text,
  dispute_flag boolean not null default false,
  no_show_flag boolean not null default false,
  provider_safety_notes text,
  client_safety_notes text,
  admin_resolution_notes text
);

create table public.care_reminders (
  id uuid not null default gen_random_uuid(),
  client_user_id uuid not null,
  provider_id uuid,
  service_name text not null,
  interval_days integer not null default 30,
  last_booked_at timestamp with time zone,
  next_reminder_at timestamp with time zone,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table public.categories (
  id integer not null default nextval('categories_id_seq'::regclass),
  name text not null,
  slug text not null
);

create table public.client_reviews (
  id uuid not null default gen_random_uuid(),
  booking_id uuid not null,
  client_user_id uuid not null,
  reviewer_provider_id uuid not null,
  rating integer not null,
  review_text text,
  tags text[],
  created_at timestamp with time zone not null default now(),
  showed_up boolean,
  on_time boolean,
  followed_policy boolean,
  payment_completed boolean,
  private_note text
);

create table public.clients (
  id uuid not null default gen_random_uuid(),
  name text not null,
  notes text,
  created_at timestamp with time zone default now(),
  avatar_url text,
  neighborhood text
);

create table public.community_bookmarks (
  user_id uuid not null,
  post_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create table public.community_post_likes (
  user_id uuid not null,
  post_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create table public.community_posts (
  id uuid not null default gen_random_uuid(),
  provider_id uuid not null,
  user_id uuid not null,
  content text not null,
  category text not null default 'general'::text,
  like_count integer not null default 0,
  reply_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.community_replies (
  id uuid not null default gen_random_uuid(),
  post_id uuid not null,
  provider_id uuid not null,
  user_id uuid not null,
  content text not null,
  created_at timestamp with time zone not null default now()
);

create table public.community_reports (
  id uuid not null default gen_random_uuid(),
  reporter_user_id uuid not null,
  post_id uuid,
  reason text not null,
  created_at timestamp with time zone not null default now()
);

create table public.contract_signatures (
  id uuid not null default gen_random_uuid(),
  contract_id uuid not null,
  booking_id uuid not null,
  client_user_id uuid not null,
  signature_url text,
  signed_at timestamp with time zone,
  status text not null default 'pending'::text,
  created_at timestamp with time zone not null default now()
);

create table public.contracts (
  id uuid not null default gen_random_uuid(),
  provider_id uuid not null,
  user_id uuid not null,
  title text not null default 'Service Agreement'::text,
  body text not null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  contract_type text not null default 'text'::text,
  pdf_url text,
  pdf_filename text
);

create table public.conversation (
  id uuid not null default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  provider_id uuid default gen_random_uuid(),
  booking_id uuid default gen_random_uuid(),
  last_message_at timestamp with time zone,
  created_at timestamp with time zone
);

create table public.feature_interest (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  feature_name text not null,
  created_at timestamp with time zone not null default now()
);

create table public.messages (
  id uuid not null default gen_random_uuid(),
  conversation_id uuid not null default gen_random_uuid(),
  sender_id uuid default gen_random_uuid(),
  content text,
  is_read boolean default false,
  created_at timestamp with time zone
);

create table public.post_comments (
  id uuid not null default gen_random_uuid(),
  post_id uuid not null,
  user_id uuid not null,
  comment_text text not null,
  created_at timestamp with time zone not null default now()
);

create table public.post_likes (
  id uuid not null default gen_random_uuid(),
  post_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create table public.post_saves (
  id uuid not null default gen_random_uuid(),
  post_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create table public.post_views (
  id uuid not null default gen_random_uuid(),
  post_id uuid not null,
  provider_id uuid not null,
  viewer_user_id uuid,
  created_at timestamp with time zone not null default now()
);

create table public.posts (
  id uuid not null default gen_random_uuid(),
  provider_id uuid not null,
  media_url text not null,
  media_type text not null,
  caption text,
  category_id integer,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  is_demo boolean not null default false,
  content_type text not null default 'portfolio'::text,
  tags text[] not null default '{}'::text[],
  featured boolean not null default false,
  engagement_score numeric(8,2) not null default 0,
  service_type text,
  visibility text not null default 'public'::text,
  thumbnail_url text,
  sort_order integer not null default 0,
  comment_count integer not null default 0,
  like_count integer not null default 0,
  save_count integer not null default 0,
  view_count integer not null default 0
);

create table public.provider_availability (
  id uuid not null default gen_random_uuid(),
  provider_id uuid not null,
  weekday integer not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  is_available boolean not null default true,
  timezone text not null default 'America/Chicago'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.provider_blocked_dates (
  id uuid not null default gen_random_uuid(),
  provider_id uuid not null,
  date date not null,
  reason text,
  created_at timestamp with time zone not null default now()
);

create table public.provider_booking_clicks (
  id uuid not null default gen_random_uuid(),
  provider_id uuid not null,
  viewer_user_id uuid,
  source text,
  created_at timestamp with time zone not null default now()
);

create table public.provider_booking_preferences (
  id uuid not null default gen_random_uuid(),
  provider_id uuid not null,
  minimum_notice_hours integer not null default 2,
  same_day_booking boolean not null default true,
  requires_manual_approval boolean not null default true,
  appointment_time_required boolean not null default true,
  max_bookings_per_day integer not null default 10,
  buffer_minutes integer not null default 15,
  lateness_grace_minutes integer not null default 60,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  timezone text not null default 'America/Chicago'::text,
  cancellation_window_hours integer not null default 24,
  vacation_mode boolean not null default false
);

create table public.provider_follows (
  id uuid not null default gen_random_uuid(),
  provider_id uuid not null,
  follower_user_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create table public.provider_metrics_daily (
  id uuid not null default gen_random_uuid(),
  provider_id uuid not null,
  date date not null default CURRENT_DATE,
  profile_views integer not null default 0,
  discovery_impressions integer not null default 0,
  bookings_requested integer not null default 0,
  bookings_completed integer not null default 0,
  bookings_cancelled integer not null default 0,
  reviews_received integer not null default 0,
  follows_received integer not null default 0,
  created_at timestamp with time zone not null default now()
);

create table public.provider_policies (
  provider_id uuid not null,
  cancellation_fee_percent integer not null default 0,
  no_show_fee_percent integer not null default 100,
  reschedule_window text not null default '24 hours before'::text,
  reschedule_fee_enabled boolean not null default false,
  reschedule_fee numeric not null default 0,
  reschedule_limit text not null default 'Once per booking'::text,
  travel_fee_type text not null default 'per-mile'::text,
  travel_fee_amount numeric not null default 0,
  free_travel_radius_miles integer not null default 5,
  max_travel_distance_miles integer,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone
);

create table public.provider_profile_views (
  id uuid not null default gen_random_uuid(),
  provider_id uuid not null,
  viewer_user_id uuid,
  session_id text,
  created_at timestamp with time zone not null default now()
);

create table public.provider_reviews (
  id uuid not null default gen_random_uuid(),
  booking_id uuid not null,
  provider_id uuid not null,
  reviewer_user_id uuid not null,
  rating integer not null,
  review_text text,
  created_at timestamp with time zone not null default now(),
  reviewer_display_name text,
  is_demo boolean not null default false,
  tags text[]
);

create table public.provider_services (
  id uuid not null default gen_random_uuid(),
  provider_id uuid not null,
  name text not null,
  description text,
  price numeric(10,2) not null,
  duration_minutes integer not null default 60,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deposit_required boolean not null default false,
  deposit_type text,
  deposit_amount numeric
);

create table public.providers (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  display_name text not null,
  username text not null,
  category_id integer,
  bio text,
  location text,
  profile_photo_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  total_bookings integer not null default 0,
  no_show_count integer not null default 0,
  late_count integer not null default 0,
  rating numeric(3,2) not null default 0,
  completed_count integer not null default 0,
  stripe_account_id text,
  stripe_onboarding_complete boolean not null default false,
  stripe_charges_enabled boolean not null default false,
  stripe_payouts_enabled boolean not null default false,
  stripe_details_submitted boolean not null default false,
  stripe_account_updated_at timestamp with time zone,
  average_rating numeric(3,2) not null default 0,
  review_count integer not null default 0,
  payment_mode text not null default 'full_payment'::text,
  deposit_type text,
  deposit_value numeric(10,2),
  issue_window_hours integer not null default 2,
  follower_count integer not null default 0,
  is_demo boolean not null default false,
  cover_image_url text,
  specialties text[] not null default '{}'::text[],
  profile_style text,
  years_experience integer,
  bookings_this_week integer not null default 0,
  bookings_this_month integer not null default 0,
  repeat_client_rate numeric(4,2) not null default 0,
  next_available date,
  is_trending boolean not null default false,
  neighborhood text,
  is_featured boolean not null default false,
  is_approved boolean not null default true,
  verification_status text not null default 'unverified'::text,
  identity_verified boolean not null default false,
  business_verified boolean not null default false,
  verification_submitted_at timestamp with time zone,
  verification_notes text,
  custom_category text,
  is_mobile boolean not null default false,
  business_name text
);

create table public.rate_limit_log (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  action text not null,
  created_at timestamp with time zone not null default now()
);

create table public.reports (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  report_type text not null,
  report_reason text not null,
  report_status text not null default 'open'::text,
  notes text,
  admin_notes text,
  reporter_user_id uuid not null,
  reported_provider_id uuid,
  reported_user_id uuid,
  booking_id uuid,
  resolved_at timestamp with time zone,
  resolved_by uuid
);

create table public.saved_providers (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  provider_id uuid not null,
  created_at timestamp with time zone default now()
);

create table public.shift_clients (
  id uuid not null default gen_random_uuid(),
  shift_id uuid,
  client_id uuid,
  created_at timestamp with time zone default now(),
  spend numeric default 0
);

create table public.shifts (
  id uuid not null default gen_random_uuid(),
  venue text not null,
  shift_date date not null,
  expected numeric not null,
  actual numeric not null,
  created_at timestamp with time zone default now()
);

-- ============================= 2b. SEQUENCE OWNERSHIP =============================
-- CORRECTION (F5B): bind categories_id_seq to categories.id now that the column
-- exists (matches live OWNED BY dependency; drops the sequence with the table).
alter sequence public.categories_id_seq owned by public.categories.id;

-- ===================== 3. CONSTRAINTS (PK/UNIQUE/FK/CHECK) =====================
alter table public.barter_interests add constraint barter_interests_pkey PRIMARY KEY (id);
alter table public.barter_interests add constraint barter_interests_offer_id_interested_provider_id_key UNIQUE (offer_id, interested_provider_id);
alter table public.barter_interests add constraint barter_interests_interested_provider_id_fkey FOREIGN KEY (interested_provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.barter_interests add constraint barter_interests_interested_user_id_fkey FOREIGN KEY (interested_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.barter_interests add constraint barter_interests_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES barter_offers(id) ON DELETE CASCADE;
alter table public.barter_interests add constraint barter_interests_message_check CHECK (((message IS NULL) OR (char_length(message) <= 300)));
alter table public.barter_interests add constraint barter_interests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])));
alter table public.barter_offers add constraint barter_offers_pkey PRIMARY KEY (id);
alter table public.barter_offers add constraint barter_offers_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.barter_offers add constraint barter_offers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.barter_offers add constraint barter_offers_notes_check CHECK (((notes IS NULL) OR (char_length(notes) <= 500)));
alter table public.barter_offers add constraint barter_offers_offering_service_check CHECK ((char_length(offering_service) <= 200));
alter table public.barter_offers add constraint barter_offers_seeking_service_check CHECK ((char_length(seeking_service) <= 200));
alter table public.booking_events add constraint booking_events_pkey PRIMARY KEY (id);
alter table public.booking_events add constraint booking_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table public.bookings add constraint bookings_pkey PRIMARY KEY (id);
alter table public.bookings add constraint bookings_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.bookings add constraint bookings_service_id_fkey FOREIGN KEY (service_id) REFERENCES provider_services(id);
alter table public.bookings add constraint bookings_admin_resolution_notes_length_check CHECK (((admin_resolution_notes IS NULL) OR (char_length(admin_resolution_notes) <= 4000)));
alter table public.bookings add constraint bookings_cancellation_actor_check CHECK (((cancellation_actor = ANY (ARRAY['client'::text, 'provider'::text, 'admin'::text, 'system'::text])) OR (cancellation_actor IS NULL)));
alter table public.bookings add constraint bookings_client_safety_notes_length_check CHECK (((client_safety_notes IS NULL) OR (char_length(client_safety_notes) <= 2000)));
alter table public.bookings add constraint bookings_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'authorized'::text, 'captured'::text, 'cancelled'::text, 'refunded'::text])));
alter table public.bookings add constraint bookings_provider_safety_notes_length_check CHECK (((provider_safety_notes IS NULL) OR (char_length(provider_safety_notes) <= 2000)));
alter table public.bookings add constraint bookings_refund_status_check CHECK ((refund_status = ANY (ARRAY['none'::text, 'pending'::text, 'released'::text, 'refunded'::text, 'partially_refunded'::text, 'disputed'::text])));
alter table public.bookings add constraint bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'canceled'::text, 'cancelled_by_client'::text, 'cancelled_by_provider'::text, 'arriving'::text, 'checked_in'::text, 'completed'::text, 'late_cancelled'::text, 'no_show'::text, 'rescheduled'::text])));
alter table public.care_reminders add constraint care_reminders_pkey PRIMARY KEY (id);
alter table public.care_reminders add constraint care_reminders_client_user_id_fkey FOREIGN KEY (client_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.care_reminders add constraint care_reminders_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL;
alter table public.categories add constraint categories_pkey PRIMARY KEY (id);
alter table public.categories add constraint categories_slug_key UNIQUE (slug);
alter table public.client_reviews add constraint client_reviews_pkey PRIMARY KEY (id);
alter table public.client_reviews add constraint client_reviews_booking_id_key UNIQUE (booking_id);
alter table public.client_reviews add constraint client_reviews_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table public.client_reviews add constraint client_reviews_reviewer_provider_id_fkey FOREIGN KEY (reviewer_provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.client_reviews add constraint client_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
alter table public.clients add constraint clients_pkey PRIMARY KEY (id);
alter table public.community_bookmarks add constraint community_bookmarks_pkey PRIMARY KEY (user_id, post_id);
alter table public.community_bookmarks add constraint community_bookmarks_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
alter table public.community_bookmarks add constraint community_bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.community_post_likes add constraint community_post_likes_pkey PRIMARY KEY (user_id, post_id);
alter table public.community_post_likes add constraint community_post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
alter table public.community_post_likes add constraint community_post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.community_posts add constraint community_posts_pkey PRIMARY KEY (id);
alter table public.community_posts add constraint community_posts_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.community_posts add constraint community_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.community_posts add constraint community_posts_content_check CHECK ((char_length(content) <= 1000));
alter table public.community_replies add constraint community_replies_pkey PRIMARY KEY (id);
alter table public.community_replies add constraint community_replies_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
alter table public.community_replies add constraint community_replies_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.community_replies add constraint community_replies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.community_replies add constraint community_replies_content_check CHECK ((char_length(content) <= 500));
alter table public.community_reports add constraint community_reports_pkey PRIMARY KEY (id);
alter table public.community_reports add constraint community_reports_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
alter table public.community_reports add constraint community_reports_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.contract_signatures add constraint contract_signatures_pkey PRIMARY KEY (id);
alter table public.contract_signatures add constraint contract_signatures_booking_id_key UNIQUE (booking_id);
alter table public.contract_signatures add constraint contract_signatures_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table public.contract_signatures add constraint contract_signatures_client_user_id_fkey FOREIGN KEY (client_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.contract_signatures add constraint contract_signatures_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE;
alter table public.contract_signatures add constraint contract_signatures_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'signed'::text, 'declined'::text])));
alter table public.contracts add constraint contracts_pkey PRIMARY KEY (id);
alter table public.contracts add constraint contracts_provider_id_key UNIQUE (provider_id);
alter table public.contracts add constraint contracts_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.contracts add constraint contracts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.contracts add constraint contracts_contract_type_check CHECK ((contract_type = ANY (ARRAY['text'::text, 'pdf'::text])));
alter table public.conversation add constraint conversation_pkey PRIMARY KEY (id);
alter table public.conversation add constraint conversation_unique_pair UNIQUE (client_id, provider_id);
alter table public.feature_interest add constraint feature_interest_pkey PRIMARY KEY (id);
alter table public.feature_interest add constraint feature_interest_user_id_feature_name_key UNIQUE (user_id, feature_name);
alter table public.feature_interest add constraint feature_interest_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.messages add constraint messages_pkey PRIMARY KEY (id);
alter table public.post_comments add constraint post_comments_pkey PRIMARY KEY (id);
alter table public.post_comments add constraint post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
alter table public.post_comments add constraint post_comments_comment_text_check CHECK (((char_length(comment_text) >= 1) AND (char_length(comment_text) <= 500)));
alter table public.post_likes add constraint post_likes_pkey PRIMARY KEY (id);
alter table public.post_likes add constraint post_likes_post_id_user_id_key UNIQUE (post_id, user_id);
alter table public.post_likes add constraint post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
alter table public.post_likes add constraint post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.post_saves add constraint post_saves_pkey PRIMARY KEY (id);
alter table public.post_saves add constraint post_saves_post_id_user_id_key UNIQUE (post_id, user_id);
alter table public.post_saves add constraint post_saves_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
alter table public.post_saves add constraint post_saves_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.post_views add constraint post_views_pkey PRIMARY KEY (id);
alter table public.post_views add constraint post_views_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
alter table public.post_views add constraint post_views_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.post_views add constraint post_views_viewer_user_id_fkey FOREIGN KEY (viewer_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.posts add constraint posts_pkey PRIMARY KEY (id);
alter table public.posts add constraint posts_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);
alter table public.posts add constraint posts_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.posts add constraint posts_content_type_check CHECK ((content_type = ANY (ARRAY['portfolio'::text, 'transformation'::text, 'reel'::text, 'process'::text, 'testimonial'::text, 'lifestyle'::text, 'salon'::text, 'before_after'::text, 'client_result'::text, 'trending'::text, 'profile'::text])));
alter table public.posts add constraint posts_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text])));
alter table public.posts add constraint posts_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'followers_only'::text])));
alter table public.provider_availability add constraint provider_availability_pkey PRIMARY KEY (id);
alter table public.provider_availability add constraint provider_availability_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.provider_availability add constraint provider_availability_time_check CHECK ((start_time < end_time));
alter table public.provider_availability add constraint provider_availability_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)));
alter table public.provider_blocked_dates add constraint provider_blocked_dates_pkey PRIMARY KEY (id);
alter table public.provider_blocked_dates add constraint provider_blocked_dates_provider_id_date_key UNIQUE (provider_id, date);
alter table public.provider_blocked_dates add constraint provider_blocked_dates_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.provider_booking_clicks add constraint provider_booking_clicks_pkey PRIMARY KEY (id);
alter table public.provider_booking_clicks add constraint provider_booking_clicks_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.provider_booking_clicks add constraint provider_booking_clicks_viewer_user_id_fkey FOREIGN KEY (viewer_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.provider_booking_preferences add constraint provider_booking_preferences_pkey PRIMARY KEY (id);
alter table public.provider_booking_preferences add constraint provider_booking_preferences_provider_id_key UNIQUE (provider_id);
alter table public.provider_booking_preferences add constraint provider_booking_preferences_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.provider_follows add constraint provider_follows_pkey PRIMARY KEY (id);
alter table public.provider_follows add constraint provider_follows_provider_id_follower_user_id_key UNIQUE (provider_id, follower_user_id);
alter table public.provider_follows add constraint provider_follows_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.provider_metrics_daily add constraint provider_metrics_daily_pkey PRIMARY KEY (id);
alter table public.provider_metrics_daily add constraint provider_metrics_daily_provider_id_date_key UNIQUE (provider_id, date);
alter table public.provider_metrics_daily add constraint provider_metrics_daily_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.provider_policies add constraint provider_policies_pkey PRIMARY KEY (provider_id);
alter table public.provider_policies add constraint provider_policies_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.provider_policies add constraint provider_policies_travel_fee_type_check CHECK ((travel_fee_type = ANY (ARRAY['flat'::text, 'per-mile'::text, 'free'::text])));
alter table public.provider_profile_views add constraint provider_profile_views_pkey PRIMARY KEY (id);
alter table public.provider_profile_views add constraint provider_profile_views_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.provider_reviews add constraint provider_reviews_pkey PRIMARY KEY (id);
alter table public.provider_reviews add constraint provider_reviews_booking_id_key UNIQUE (booking_id);
alter table public.provider_reviews add constraint provider_reviews_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table public.provider_reviews add constraint provider_reviews_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.provider_reviews add constraint provider_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
alter table public.provider_services add constraint provider_services_pkey PRIMARY KEY (id);
alter table public.provider_services add constraint provider_services_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.provider_services add constraint provider_services_deposit_type_check CHECK ((deposit_type = ANY (ARRAY['fixed'::text, 'percentage'::text])));
alter table public.providers add constraint providers_pkey PRIMARY KEY (id);
alter table public.providers add constraint providers_user_id_key UNIQUE (user_id);
alter table public.providers add constraint providers_username_key UNIQUE (username);
alter table public.providers add constraint providers_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);
alter table public.providers add constraint providers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.providers add constraint providers_deposit_type_check CHECK (((deposit_type = ANY (ARRAY['flat'::text, 'percentage'::text])) OR (deposit_type IS NULL)));
alter table public.providers add constraint providers_deposit_value_check CHECK (((deposit_value IS NULL) OR (deposit_value >= (0)::numeric)));
alter table public.providers add constraint providers_issue_window_hours_check CHECK (((issue_window_hours >= 1) AND (issue_window_hours <= 24)));
alter table public.providers add constraint providers_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['full_payment'::text, 'deposit'::text])));
alter table public.providers add constraint providers_profile_style_check CHECK (((profile_style IS NULL) OR (profile_style = ANY (ARRAY['luxury'::text, 'urban'::text, 'minimalist'::text, 'trendy'::text, 'soft_feminine'::text, 'athletic'::text, 'premium_barber'::text, 'natural_hair'::text]))));
alter table public.providers add constraint providers_verification_status_check CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'rejected'::text])));
alter table public.providers add constraint username_format CHECK ((username ~ '^[a-z0-9_]{3,30}$'::text));
alter table public.rate_limit_log add constraint rate_limit_log_pkey PRIMARY KEY (id);
alter table public.rate_limit_log add constraint rate_limit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.reports add constraint reports_pkey PRIMARY KEY (id);
alter table public.reports add constraint reports_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;
alter table public.reports add constraint reports_reported_provider_id_fkey FOREIGN KEY (reported_provider_id) REFERENCES providers(id) ON DELETE SET NULL;
alter table public.reports add constraint reports_reported_user_id_fkey FOREIGN KEY (reported_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.reports add constraint reports_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.reports add constraint reports_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.reports add constraint reports_admin_notes_length_check CHECK (((admin_notes IS NULL) OR (char_length(admin_notes) <= 4000)));
alter table public.reports add constraint reports_notes_length_check CHECK (((notes IS NULL) OR (char_length(notes) <= 2000)));
alter table public.reports add constraint reports_reason_length_check CHECK (((char_length(report_reason) >= 2) AND (char_length(report_reason) <= 80)));
alter table public.reports add constraint reports_status_check CHECK ((report_status = ANY (ARRAY['open'::text, 'reviewing'::text, 'resolved'::text, 'dismissed'::text])));
alter table public.reports add constraint reports_target_check CHECK (((reported_provider_id IS NOT NULL) OR (reported_user_id IS NOT NULL) OR (booking_id IS NOT NULL)));
alter table public.reports add constraint reports_type_check CHECK ((report_type = ANY (ARRAY['provider'::text, 'client'::text, 'booking'::text, 'content'::text])));
alter table public.saved_providers add constraint saved_providers_pkey PRIMARY KEY (id);
alter table public.saved_providers add constraint saved_providers_user_id_provider_id_key UNIQUE (user_id, provider_id);
alter table public.saved_providers add constraint saved_providers_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table public.saved_providers add constraint saved_providers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.shift_clients add constraint shift_clients_pkey PRIMARY KEY (id);
alter table public.shift_clients add constraint shift_clients_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.shift_clients add constraint shift_clients_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE;
alter table public.shifts add constraint shifts_pkey PRIMARY KEY (id);

-- ===================== 4. INDEXES (non PK/UNIQUE-constraint) =====================
CREATE INDEX booking_events_booking_id_idx ON public.booking_events USING btree (booking_id);
CREATE INDEX booking_events_created_at_idx ON public.booking_events USING btree (created_at DESC);
CREATE INDEX booking_events_event_type_idx ON public.booking_events USING btree (event_type);
CREATE INDEX bookings_capture_due_idx ON public.bookings USING btree (capture_scheduled_for) WHERE ((payment_status = 'authorized'::text) AND (issue_reported = false) AND (payment_finalized = false));
CREATE INDEX idx_bookings_dispute_flag ON public.bookings USING btree (created_at DESC) WHERE (dispute_flag = true);
CREATE INDEX idx_bookings_no_show_flag ON public.bookings USING btree (created_at DESC) WHERE (no_show_flag = true);
CREATE INDEX idx_bookings_refund_status ON public.bookings USING btree (refund_status, created_at DESC);
CREATE INDEX client_reviews_client_user_id_idx ON public.client_reviews USING btree (client_user_id);
CREATE INDEX client_reviews_created_at_idx ON public.client_reviews USING btree (created_at DESC);
CREATE INDEX client_reviews_reviewer_provider_id_idx ON public.client_reviews USING btree (reviewer_provider_id);
CREATE INDEX idx_post_comments_created ON public.post_comments USING btree (created_at DESC);
CREATE INDEX idx_post_comments_post_created ON public.post_comments USING btree (post_id, created_at DESC);
CREATE INDEX idx_post_comments_post_id ON public.post_comments USING btree (post_id);
CREATE INDEX idx_post_likes_post ON public.post_likes USING btree (post_id);
CREATE INDEX idx_post_saves_post ON public.post_saves USING btree (post_id);
CREATE INDEX idx_post_views_post_created ON public.post_views USING btree (post_id, created_at DESC);
CREATE INDEX idx_post_views_provider_created ON public.post_views USING btree (provider_id, created_at DESC);
CREATE INDEX posts_active_idx ON public.posts USING btree (is_active) WHERE (is_active = true);
CREATE INDEX posts_content_type_idx ON public.posts USING btree (content_type);
CREATE INDEX posts_created_idx ON public.posts USING btree (created_at DESC);
CREATE INDEX posts_engagement_score_idx ON public.posts USING btree (engagement_score DESC);
CREATE INDEX posts_featured_idx ON public.posts USING btree (featured) WHERE (featured = true);
CREATE INDEX posts_feed_composite_idx ON public.posts USING btree (is_active, visibility, engagement_score DESC, created_at DESC) WHERE ((is_active = true) AND (visibility = 'public'::text));
CREATE INDEX posts_is_demo_idx ON public.posts USING btree (is_demo) WHERE (is_demo = true);
CREATE INDEX posts_provider_idx ON public.posts USING btree (provider_id);
CREATE INDEX posts_tags_gin_idx ON public.posts USING gin (tags);
CREATE INDEX idx_provider_availability_provider_weekday ON public.provider_availability USING btree (provider_id, weekday, start_time);
CREATE INDEX idx_provider_blocked_dates_provider_date ON public.provider_blocked_dates USING btree (provider_id, date);
CREATE INDEX idx_provider_booking_clicks_provider_created ON public.provider_booking_clicks USING btree (provider_id, created_at DESC);
CREATE INDEX provider_follows_follower_idx ON public.provider_follows USING btree (follower_user_id);
CREATE INDEX provider_follows_provider_idx ON public.provider_follows USING btree (provider_id);
CREATE INDEX idx_pmd_provider_date ON public.provider_metrics_daily USING btree (provider_id, date DESC);
CREATE INDEX idx_ppv_created_at ON public.provider_profile_views USING btree (created_at DESC);
CREATE INDEX idx_ppv_provider_id ON public.provider_profile_views USING btree (provider_id);
CREATE INDEX idx_ppv_viewer_provider ON public.provider_profile_views USING btree (provider_id, viewer_user_id) WHERE (viewer_user_id IS NOT NULL);
CREATE INDEX provider_reviews_created_at_idx ON public.provider_reviews USING btree (created_at DESC);
CREATE INDEX provider_reviews_provider_id_idx ON public.provider_reviews USING btree (provider_id);
CREATE INDEX provider_reviews_reviewer_id_idx ON public.provider_reviews USING btree (reviewer_user_id);
CREATE INDEX provider_services_is_active_idx ON public.provider_services USING btree (is_active);
CREATE INDEX provider_services_provider_id_idx ON public.provider_services USING btree (provider_id);
CREATE INDEX idx_providers_is_featured ON public.providers USING btree (is_featured) WHERE (is_featured = true);
CREATE INDEX idx_providers_pending_verification ON public.providers USING btree (verification_submitted_at) WHERE (verification_status = 'pending'::text);
CREATE INDEX idx_providers_verification_status ON public.providers USING btree (verification_status);
CREATE INDEX providers_category_idx ON public.providers USING btree (category_id);
CREATE INDEX providers_is_demo_idx ON public.providers USING btree (is_demo) WHERE (is_demo = true);
CREATE INDEX providers_most_booked_idx ON public.providers USING btree (total_bookings DESC);
CREATE INDEX providers_profile_style_idx ON public.providers USING btree (profile_style) WHERE (profile_style IS NOT NULL);
CREATE INDEX providers_specialties_gin_idx ON public.providers USING gin (specialties);
CREATE UNIQUE INDEX providers_stripe_account_id_unique ON public.providers USING btree (stripe_account_id) WHERE (stripe_account_id IS NOT NULL);
CREATE INDEX providers_trending_idx ON public.providers USING btree (is_trending, bookings_this_week DESC) WHERE (is_trending = true);
CREATE INDEX providers_username_idx ON public.providers USING btree (username);
CREATE INDEX rate_limit_log_lookup ON public.rate_limit_log USING btree (user_id, action, created_at DESC);
CREATE INDEX idx_reports_booking ON public.reports USING btree (booking_id, created_at DESC) WHERE (booking_id IS NOT NULL);
CREATE INDEX idx_reports_provider ON public.reports USING btree (reported_provider_id, created_at DESC) WHERE (reported_provider_id IS NOT NULL);
CREATE INDEX idx_reports_reporter ON public.reports USING btree (reporter_user_id, created_at DESC);
CREATE INDEX idx_reports_status_created ON public.reports USING btree (report_status, created_at DESC);
CREATE INDEX idx_reports_type_created ON public.reports USING btree (report_type, created_at DESC);
CREATE INDEX idx_reports_user ON public.reports USING btree (reported_user_id, created_at DESC) WHERE (reported_user_id IS NOT NULL);

-- ============================= 5. VIEWS (2) =============================
-- owner: postgres
create or replace view public.clients_provider with (security_invoker=false) as
 SELECT id,
    name,
    created_at,
    neighborhood
   FROM clients c
  WHERE (EXISTS ( SELECT 1
           FROM bookings b
             JOIN providers p ON p.id = b.provider_id
          WHERE b.user_id = c.id AND p.user_id = auth.uid())) OR (EXISTS ( SELECT 1
           FROM conversation cv
             JOIN providers p ON p.id = cv.provider_id
          WHERE cv.client_id = c.id AND p.user_id = auth.uid()));
-- owner: postgres
create or replace view public.clients_public with (security_invoker=false) as
 SELECT id,
    name,
    avatar_url
   FROM clients c;

-- ============================= 6. FUNCTIONS (11) =============================
-- EXECUTE granted to: -,anon,authenticated,postgres,service_role
CREATE OR REPLACE FUNCTION public.debug_whoami()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object(
    'uid', auth.uid(),
    'role', current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    'sub_claim', current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    'raw_claims', nullif(current_setting('request.jwt.claims', true), '')
  );
$function$
;

-- EXECUTE granted to: -,anon,authenticated,postgres,service_role
CREATE OR REPLACE FUNCTION public.prevent_provider_verification_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

-- EXECUTE granted to: anon,authenticated,postgres,service_role
CREATE OR REPLACE FUNCTION public.provider_review_revealed(p_booking_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

-- EXECUTE granted to: -,anon,authenticated,postgres,service_role
CREATE OR REPLACE FUNCTION public.recompute_provider_rating()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- EXECUTE granted to: -,anon,authenticated,postgres,service_role
CREATE OR REPLACE FUNCTION public.reject_self_provider_action()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

-- EXECUTE granted to: -,anon,authenticated,postgres,service_role
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

-- EXECUTE granted to: -,anon,authenticated,postgres,service_role
CREATE OR REPLACE FUNCTION public.update_community_like_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if TG_OP = 'INSERT' then
    update community_posts set like_count = like_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update community_posts set like_count = greatest(like_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$function$
;

-- EXECUTE granted to: -,anon,authenticated,postgres,service_role
CREATE OR REPLACE FUNCTION public.update_community_reply_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if TG_OP = 'INSERT' then
    update community_posts set reply_count = reply_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update community_posts set reply_count = greatest(reply_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$function$
;

-- EXECUTE granted to: -,anon,authenticated,postgres,service_role
CREATE OR REPLACE FUNCTION public.update_post_comment_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if TG_OP = 'INSERT' then
    update posts set comment_count = comment_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update posts set comment_count = greatest(comment_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$function$
;

-- EXECUTE granted to: -,anon,authenticated,postgres,service_role
CREATE OR REPLACE FUNCTION public.update_post_like_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if TG_OP = 'INSERT' then
    update posts set like_count = like_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update posts set like_count = greatest(like_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$function$
;

-- EXECUTE granted to: -,anon,authenticated,postgres,service_role
CREATE OR REPLACE FUNCTION public.update_post_save_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if TG_OP = 'INSERT' then
    update posts set save_count = save_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update posts set save_count = greatest(save_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$function$
;

-- ============================= 7. TRIGGERS (17) =============================
CREATE TRIGGER trg_no_self_booking BEFORE INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION reject_self_provider_action('user_id');
CREATE TRIGGER trg_community_like_count AFTER INSERT OR DELETE ON community_post_likes FOR EACH ROW EXECUTE FUNCTION update_community_like_count();
CREATE TRIGGER trg_community_reply_count AFTER INSERT OR DELETE ON community_replies FOR EACH ROW EXECUTE FUNCTION update_community_reply_count();
CREATE TRIGGER trg_no_self_conversation BEFORE INSERT OR UPDATE ON conversation FOR EACH ROW EXECUTE FUNCTION reject_self_provider_action('client_id');
CREATE TRIGGER trg_post_comment_count AFTER INSERT OR DELETE ON post_comments FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();
CREATE TRIGGER trg_post_like_count AFTER INSERT OR DELETE ON post_likes FOR EACH ROW EXECUTE FUNCTION update_post_like_count();
CREATE TRIGGER trg_post_save_count AFTER INSERT OR DELETE ON post_saves FOR EACH ROW EXECUTE FUNCTION update_post_save_count();
CREATE TRIGGER provider_availability_updated_at BEFORE UPDATE ON provider_availability FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER provider_booking_preferences_updated_at BEFORE UPDATE ON provider_booking_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_no_self_follow BEFORE INSERT OR UPDATE ON provider_follows FOR EACH ROW EXECUTE FUNCTION reject_self_provider_action('follower_user_id');
CREATE TRIGGER provider_reviews_recompute_rating AFTER INSERT OR DELETE OR UPDATE ON provider_reviews FOR EACH ROW EXECUTE FUNCTION recompute_provider_rating();
CREATE TRIGGER trg_no_self_review BEFORE INSERT OR UPDATE ON provider_reviews FOR EACH ROW EXECUTE FUNCTION reject_self_provider_action('reviewer_user_id');
CREATE TRIGGER provider_services_updated_at BEFORE UPDATE ON provider_services FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER providers_updated_at BEFORE UPDATE ON providers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER providers_verification_admin_only BEFORE UPDATE ON providers FOR EACH ROW EXECUTE FUNCTION prevent_provider_verification_self_update();
CREATE TRIGGER reports_updated_at BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_no_self_save BEFORE INSERT OR UPDATE ON saved_providers FOR EACH ROW EXECUTE FUNCTION reject_self_provider_action('user_id');

-- ============================= 8. RLS ENABLE =============================
alter table public.barter_interests enable row level security;
alter table public.barter_offers enable row level security;
alter table public.booking_events enable row level security;
alter table public.bookings enable row level security;
alter table public.care_reminders enable row level security;
-- RLS DISABLED (live): public.categories  (SECURITY: see plan / F3)
alter table public.client_reviews enable row level security;
alter table public.clients enable row level security;
alter table public.community_bookmarks enable row level security;
alter table public.community_post_likes enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_replies enable row level security;
alter table public.community_reports enable row level security;
alter table public.contract_signatures enable row level security;
alter table public.contracts enable row level security;
alter table public.conversation enable row level security;
alter table public.feature_interest enable row level security;
alter table public.messages enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_saves enable row level security;
alter table public.post_views enable row level security;
alter table public.posts enable row level security;
alter table public.provider_availability enable row level security;
alter table public.provider_blocked_dates enable row level security;
alter table public.provider_booking_clicks enable row level security;
alter table public.provider_booking_preferences enable row level security;
alter table public.provider_follows enable row level security;
alter table public.provider_metrics_daily enable row level security;
alter table public.provider_policies enable row level security;
alter table public.provider_profile_views enable row level security;
alter table public.provider_reviews enable row level security;
alter table public.provider_services enable row level security;
alter table public.providers enable row level security;
alter table public.rate_limit_log enable row level security;
alter table public.reports enable row level security;
alter table public.saved_providers enable row level security;
-- RLS DISABLED (live): public.shift_clients  (SECURITY: see plan / F3)
-- RLS DISABLED (live): public.shifts  (SECURITY: see plan / F3)

-- ============================= 9. POLICIES (97) =============================
-- --- barter_interests ---
create policy "barter_interests_own_delete" on public.barter_interests
  as permissive for delete to authenticated
  using ((auth.uid() = interested_user_id));
create policy "barter_interests_provider_insert" on public.barter_interests
  as permissive for insert to authenticated
  with check (((auth.uid() = interested_user_id) AND (auth.uid() IN ( SELECT providers.user_id
   FROM providers))));
create policy "barter_interests_offer_owner_read" on public.barter_interests
  as permissive for select to public
  using (((auth.uid() IN ( SELECT barter_offers.user_id
   FROM barter_offers
  WHERE (barter_offers.id = barter_interests.offer_id))) OR (auth.uid() = interested_user_id)));
create policy "barter_interests_owner_update" on public.barter_interests
  as permissive for update to public
  using ((auth.uid() IN ( SELECT barter_offers.user_id
   FROM barter_offers
  WHERE (barter_offers.id = barter_interests.offer_id))));
-- --- barter_offers ---
create policy "barter_offers_owner_delete" on public.barter_offers
  as permissive for delete to authenticated
  using ((auth.uid() = user_id));
create policy "barter_offers_provider_insert" on public.barter_offers
  as permissive for insert to authenticated
  with check (((auth.uid() = user_id) AND (auth.uid() IN ( SELECT providers.user_id
   FROM providers))));
create policy "barter_offers_provider_read" on public.barter_offers
  as permissive for select to public
  using ((auth.uid() IN ( SELECT providers.user_id
   FROM providers)));
create policy "barter_offers_owner_update" on public.barter_offers
  as permissive for update to public
  using ((auth.uid() = user_id));
-- --- bookings ---
create policy "Users can insert own bookings" on public.bookings
  as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "Providers can view their bookings" on public.bookings
  as permissive for select to public
  using ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
create policy "Users can view own bookings" on public.bookings
  as permissive for select to authenticated
  using ((auth.uid() = user_id));
create policy "clients_cancel_own_bookings" on public.bookings
  as permissive for update to authenticated
  using (((auth.uid() = user_id) AND (status = ANY (ARRAY['pending'::text, 'accepted'::text]))))
  with check (((auth.uid() = user_id) AND (status = 'cancelled'::text) AND (payment_amount = payment_amount) AND (payment_status = payment_status) AND (payment_finalized = payment_finalized) AND (no_show_flag = no_show_flag) AND (dispute_flag = dispute_flag)));
create policy "providers_manage_own_bookings" on public.bookings
  as permissive for update to authenticated
  using ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))))
  with check (((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))) AND (payment_amount = payment_amount)));
-- --- care_reminders ---
create policy "reminders_own_delete" on public.care_reminders
  as permissive for delete to authenticated
  using ((auth.uid() = client_user_id));
create policy "reminders_own_insert" on public.care_reminders
  as permissive for insert to authenticated
  with check ((auth.uid() = client_user_id));
create policy "reminders_own_read" on public.care_reminders
  as permissive for select to public
  using ((auth.uid() = client_user_id));
create policy "reminders_own_update" on public.care_reminders
  as permissive for update to public
  using ((auth.uid() = client_user_id));
-- --- categories ---
create policy "categories_public_read" on public.categories
  as permissive for select to public
  using (true);
-- --- client_reviews ---
create policy "client_reviews_insert_bound" on public.client_reviews
  as permissive for insert to authenticated
  with check (((auth.uid() IN ( SELECT p.user_id
   FROM providers p
  WHERE (p.id = client_reviews.reviewer_provider_id))) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = client_reviews.booking_id) AND (b.status = 'completed'::text) AND (b.provider_id = client_reviews.reviewer_provider_id))))));
create policy "provider_select_own_client_reviews" on public.client_reviews
  as permissive for select to public
  using ((reviewer_provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
-- --- clients ---
create policy "clients_insert_self" on public.clients
  as permissive for insert to authenticated
  with check ((id = auth.uid()));
create policy "clients_select_self" on public.clients
  as permissive for select to authenticated
  using ((id = auth.uid()));
create policy "clients_update_self" on public.clients
  as permissive for update to authenticated
  using ((id = auth.uid()))
  with check ((id = auth.uid()));
-- --- community_bookmarks ---
create policy "bookmarks_own_delete" on public.community_bookmarks
  as permissive for delete to authenticated
  using ((auth.uid() = user_id));
create policy "bookmarks_own_insert" on public.community_bookmarks
  as permissive for insert to authenticated
  with check ((auth.uid() = user_id));
create policy "bookmarks_own_read" on public.community_bookmarks
  as permissive for select to public
  using ((auth.uid() = user_id));
-- --- community_post_likes ---
create policy "community_likes_delete" on public.community_post_likes
  as permissive for delete to authenticated
  using ((auth.uid() = user_id));
create policy "community_likes_insert" on public.community_post_likes
  as permissive for insert to authenticated
  with check ((auth.uid() = user_id));
create policy "community_likes_provider_read" on public.community_post_likes
  as permissive for select to public
  using ((auth.uid() IN ( SELECT providers.user_id
   FROM providers)));
-- --- community_posts ---
create policy "community_posts_owner_delete" on public.community_posts
  as permissive for delete to authenticated
  using ((auth.uid() = user_id));
create policy "community_posts_provider_insert" on public.community_posts
  as permissive for insert to authenticated
  with check (((auth.uid() = user_id) AND (auth.uid() IN ( SELECT providers.user_id
   FROM providers))));
create policy "community_posts_provider_read" on public.community_posts
  as permissive for select to public
  using ((auth.uid() IN ( SELECT providers.user_id
   FROM providers)));
create policy "community_posts_owner_update" on public.community_posts
  as permissive for update to public
  using ((auth.uid() = user_id));
-- --- community_replies ---
create policy "community_replies_owner_delete" on public.community_replies
  as permissive for delete to authenticated
  using ((auth.uid() = user_id));
create policy "community_replies_provider_insert" on public.community_replies
  as permissive for insert to authenticated
  with check (((auth.uid() = user_id) AND (auth.uid() IN ( SELECT providers.user_id
   FROM providers))));
create policy "community_replies_provider_read" on public.community_replies
  as permissive for select to public
  using ((auth.uid() IN ( SELECT providers.user_id
   FROM providers)));
-- --- community_reports ---
create policy "reports_insert_own" on public.community_reports
  as permissive for insert to authenticated
  with check ((auth.uid() = reporter_user_id));
-- --- contract_signatures ---
create policy "signatures_client_insert" on public.contract_signatures
  as permissive for insert to authenticated
  with check ((auth.uid() = client_user_id));
create policy "signatures_read_own" on public.contract_signatures
  as permissive for select to public
  using (((auth.uid() = client_user_id) OR (auth.uid() IN ( SELECT contracts.user_id
   FROM contracts
  WHERE (contracts.id = contract_signatures.contract_id)))));
create policy "signatures_client_update" on public.contract_signatures
  as permissive for update to public
  using ((auth.uid() = client_user_id));
-- --- contracts ---
create policy "contracts_provider_delete" on public.contracts
  as permissive for delete to authenticated
  using ((auth.uid() = user_id));
create policy "contracts_provider_insert" on public.contracts
  as permissive for insert to authenticated
  with check (((auth.uid() = user_id) AND (auth.uid() IN ( SELECT providers.user_id
   FROM providers))));
create policy "contracts_provider_read" on public.contracts
  as permissive for select to public
  using (((auth.uid() = user_id) OR (auth.uid() IN ( SELECT cs.client_user_id
   FROM contract_signatures cs
  WHERE (cs.contract_id = contracts.id)))));
create policy "contracts_provider_update" on public.contracts
  as permissive for update to public
  using ((auth.uid() = user_id));
-- --- conversation ---
create policy "Users can create conversations" on public.conversation
  as permissive for insert to public
  with check (((auth.uid() = client_id) OR (auth.uid() IN ( SELECT providers.user_id
   FROM providers
  WHERE (providers.id = conversation.provider_id)))));
create policy "Users can view their conversations" on public.conversation
  as permissive for select to public
  using (((auth.uid() = client_id) OR (auth.uid() IN ( SELECT providers.user_id
   FROM providers
  WHERE (providers.id = conversation.provider_id)))));
-- --- feature_interest ---
create policy "Users can insert their own interest" on public.feature_interest
  as permissive for insert to authenticated
  with check ((user_id = auth.uid()));
create policy "Users can read their own interest" on public.feature_interest
  as permissive for select to authenticated
  using ((user_id = auth.uid()));
-- --- messages ---
create policy "Participants can send messages" on public.messages
  as permissive for insert to authenticated
  with check (((sender_id = auth.uid()) AND (conversation_id IN ( SELECT conversation.id
   FROM conversation
  WHERE ((conversation.client_id = auth.uid()) OR (conversation.provider_id IN ( SELECT providers.id
           FROM providers
          WHERE (providers.user_id = auth.uid()))))))));
create policy "Participants can read messages" on public.messages
  as permissive for select to authenticated
  using ((conversation_id IN ( SELECT conversation.id
   FROM conversation
  WHERE ((conversation.client_id = auth.uid()) OR (conversation.provider_id IN ( SELECT providers.id
           FROM providers
          WHERE (providers.user_id = auth.uid())))))));
create policy "participants_mark_messages_read" on public.messages
  as permissive for update to authenticated
  using ((conversation_id IN ( SELECT conversation.id
   FROM conversation
  WHERE ((conversation.client_id = auth.uid()) OR (conversation.provider_id IN ( SELECT providers.id
           FROM providers
          WHERE (providers.user_id = auth.uid())))))))
  with check (((conversation_id IN ( SELECT conversation.id
   FROM conversation
  WHERE ((conversation.client_id = auth.uid()) OR (conversation.provider_id IN ( SELECT providers.id
           FROM providers
          WHERE (providers.user_id = auth.uid())))))) AND (sender_id = sender_id) AND (content = content) AND (created_at = created_at)));
-- --- post_comments ---
create policy "comments_delete_own" on public.post_comments
  as permissive for delete to authenticated
  using ((auth.uid() = user_id));
create policy "comments_insert_own" on public.post_comments
  as permissive for insert to authenticated
  with check ((auth.uid() = user_id));
create policy "comments_public_read" on public.post_comments
  as permissive for select to public
  using (true);
-- --- post_likes ---
create policy "likes_delete_own" on public.post_likes
  as permissive for delete to authenticated
  using ((auth.uid() = user_id));
create policy "likes_insert_own" on public.post_likes
  as permissive for insert to authenticated
  with check ((auth.uid() = user_id));
create policy "likes_public_read" on public.post_likes
  as permissive for select to public
  using (true);
-- --- post_saves ---
create policy "saves_delete_own" on public.post_saves
  as permissive for delete to authenticated
  using ((auth.uid() = user_id));
create policy "saves_insert_own" on public.post_saves
  as permissive for insert to authenticated
  with check ((auth.uid() = user_id));
create policy "saves_public_read" on public.post_saves
  as permissive for select to public
  using ((auth.uid() = user_id));
-- --- post_views ---
create policy "Providers read post views" on public.post_views
  as permissive for select to public
  using ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
-- --- posts ---
create policy "posts_insert_own" on public.posts
  as permissive for insert to public
  with check ((auth.uid() = ( SELECT providers.user_id
   FROM providers
  WHERE (providers.id = posts.provider_id))));
create policy "posts_public_read" on public.posts
  as permissive for select to public
  using ((is_active = true));
create policy "posts_update_own" on public.posts
  as permissive for update to public
  using ((auth.uid() = ( SELECT providers.user_id
   FROM providers
  WHERE (providers.id = posts.provider_id))));
-- --- provider_availability ---
create policy "Providers manage own availability" on public.provider_availability
  as permissive for all to public
  using ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))))
  with check ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
create policy "Anyone can read provider availability" on public.provider_availability
  as permissive for select to public
  using (true);
-- --- provider_blocked_dates ---
create policy "Providers manage own blocked dates" on public.provider_blocked_dates
  as permissive for all to public
  using ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))))
  with check ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
create policy "Anyone can read provider blocked dates" on public.provider_blocked_dates
  as permissive for select to public
  using (true);
-- --- provider_booking_clicks ---
create policy "Providers read booking clicks" on public.provider_booking_clicks
  as permissive for select to public
  using ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
-- --- provider_booking_preferences ---
create policy "provider_insert_own_preferences" on public.provider_booking_preferences
  as permissive for insert to public
  with check ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
create policy "provider_read_own_preferences" on public.provider_booking_preferences
  as permissive for select to public
  using ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
create policy "provider_update_own_preferences" on public.provider_booking_preferences
  as permissive for update to public
  using ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
-- --- provider_follows ---
create policy "auth users can unfollow" on public.provider_follows
  as permissive for delete to public
  using ((auth.uid() = follower_user_id));
create policy "auth users can follow" on public.provider_follows
  as permissive for insert to public
  with check ((auth.uid() = follower_user_id));
create policy "public read follows" on public.provider_follows
  as permissive for select to public
  using (true);
-- --- provider_metrics_daily ---
create policy "Providers read own daily metrics" on public.provider_metrics_daily
  as permissive for select to public
  using ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
-- --- provider_policies ---
create policy "provider_policies_owner" on public.provider_policies
  as permissive for all to public
  using ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))))
  with check ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
create policy "provider_policies_read" on public.provider_policies
  as permissive for select to public
  using (true);
-- --- provider_profile_views ---
create policy "Providers read own profile views" on public.provider_profile_views
  as permissive for select to public
  using ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
-- --- provider_reviews ---
create policy "provider_reviews_insert_bound" on public.provider_reviews
  as permissive for insert to authenticated
  with check (((auth.uid() = reviewer_user_id) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = provider_reviews.booking_id) AND (b.user_id = auth.uid()) AND (b.provider_id = provider_reviews.provider_id) AND (b.status = 'completed'::text))))));
create policy "provider_reviews_read" on public.provider_reviews
  as permissive for select to public
  using (((auth.uid() = reviewer_user_id) OR provider_review_revealed(booking_id)));
create policy "provider_reviews_read_revealed" on public.provider_reviews
  as permissive for select to public
  using (((EXISTS ( SELECT 1
   FROM client_reviews cr
  WHERE (cr.booking_id = provider_reviews.booking_id))) OR (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = provider_reviews.booking_id) AND (b.completed_at < (now() - '7 days'::interval))))) OR (auth.uid() = reviewer_user_id)));
-- --- provider_services ---
create policy "provider_delete_own_services" on public.provider_services
  as permissive for delete to public
  using ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
create policy "provider_insert_own_services" on public.provider_services
  as permissive for insert to public
  with check ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
create policy "provider_read_own_services" on public.provider_services
  as permissive for select to public
  using ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
create policy "public_read_active_services" on public.provider_services
  as permissive for select to public
  using ((is_active = true));
create policy "provider_update_own_services" on public.provider_services
  as permissive for update to public
  using ((provider_id IN ( SELECT providers.id
   FROM providers
  WHERE (providers.user_id = auth.uid()))));
-- --- providers ---
create policy "providers_insert_own" on public.providers
  as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "providers_public_read" on public.providers
  as permissive for select to public
  using (true);
create policy "providers_update_own" on public.providers
  as permissive for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "providers_update_safe_columns_only" on public.providers
  as permissive for update to public
  using ((auth.uid() = user_id))
  with check (((auth.uid() = user_id) AND (is_approved = is_approved) AND (is_featured = is_featured) AND (is_trending = is_trending) AND (identity_verified = identity_verified) AND (business_verified = business_verified) AND (verification_status = verification_status) AND (stripe_charges_enabled = stripe_charges_enabled) AND (stripe_payouts_enabled = stripe_payouts_enabled) AND (stripe_onboarding_complete = stripe_onboarding_complete) AND (rating = rating) AND (review_count = review_count) AND (average_rating = average_rating)));
-- --- rate_limit_log ---
create policy "rate_limit_insert_own" on public.rate_limit_log
  as permissive for insert to authenticated
  with check ((auth.uid() = user_id));
-- --- reports ---
create policy "Users can create reports" on public.reports
  as permissive for insert to public
  with check ((auth.uid() = reporter_user_id));
create policy "Users can read own reports" on public.reports
  as permissive for select to public
  using ((auth.uid() = reporter_user_id));
-- --- saved_providers ---
create policy "saved_delete_own" on public.saved_providers
  as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "saved_insert_own" on public.saved_providers
  as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "saved_read_own" on public.saved_providers
  as permissive for select to public
  using ((auth.uid() = user_id));

-- ============================= 10. GRANTS (table/view; anon/authenticated/service_role) =============================
-- NOTE: pg_attribute.attacl capture returned 0 rows -> there are NO genuine
-- column-level grants in public; all column privileges reflect table grants.
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.barter_interests to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.barter_interests to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.barter_interests to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.barter_offers to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.barter_offers to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.barter_offers to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.booking_events to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.booking_events to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.booking_events to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.bookings to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.bookings to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.bookings to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.care_reminders to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.care_reminders to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.care_reminders to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.categories to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.categories to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.categories to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.client_reviews to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.client_reviews to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.client_reviews to service_role;
grant INSERT,SELECT,UPDATE on public.clients to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.clients to service_role;
grant SELECT on public.clients_provider to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.clients_provider to service_role;
grant SELECT on public.clients_public to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.clients_public to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_bookmarks to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_bookmarks to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_bookmarks to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_post_likes to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_post_likes to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_post_likes to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_posts to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_posts to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_posts to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_replies to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_replies to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_replies to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_reports to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_reports to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.community_reports to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.contract_signatures to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.contract_signatures to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.contract_signatures to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.contracts to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.contracts to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.contracts to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.conversation to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.conversation to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.conversation to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.feature_interest to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.feature_interest to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.feature_interest to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.messages to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.messages to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.messages to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.post_comments to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.post_comments to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.post_comments to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.post_likes to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.post_likes to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.post_likes to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.post_saves to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.post_saves to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.post_saves to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.post_views to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.post_views to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.post_views to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.posts to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.posts to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.posts to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_availability to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_availability to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_availability to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_blocked_dates to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_blocked_dates to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_blocked_dates to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_booking_clicks to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_booking_clicks to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_booking_clicks to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_booking_preferences to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_booking_preferences to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_booking_preferences to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_follows to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_follows to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_follows to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_metrics_daily to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_metrics_daily to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_metrics_daily to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_policies to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_policies to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_policies to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_profile_views to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_profile_views to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_profile_views to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_reviews to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_reviews to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_reviews to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_services to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_services to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.provider_services to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.providers to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.providers to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.providers to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.rate_limit_log to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.rate_limit_log to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.rate_limit_log to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.reports to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.reports to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.reports to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.saved_providers to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.saved_providers to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.saved_providers to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.shift_clients to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.shift_clients to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.shift_clients to service_role;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.shifts to anon;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.shifts to authenticated;
grant DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE on public.shifts to service_role;


-- --- preserve S1B clients grant lockdown (match live exactly) ---
-- (Fresh Supabase default privileges would otherwise re-grant anon/authenticated;
--  RLS still enforces access, but this matches the live ACL precisely.)
revoke all privileges on public.clients from anon;
revoke delete, truncate, references, trigger on public.clients from authenticated;

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

