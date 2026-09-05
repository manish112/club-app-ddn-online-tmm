-- =============================================================================
-- Dehradun Online Toastmasters — complete database schema
-- =============================================================================
--
-- ONE FILE, WHOLE DATABASE. Paste it into the Supabase SQL editor of a new
-- project and the app runs. It replaces migrations 001–058, which are kept in
-- supabase/migrations-archive/ as history only — nothing needs to run them.
--
-- It is also SAFE TO RE-RUN, on this database or an older one:
--   * every table is CREATE TABLE IF NOT EXISTS, with the full final columns;
--   * every column added after a table was first created is repeated as
--     ALTER TABLE ... ADD COLUMN IF NOT EXISTS, so a database created from an
--     older migration set catches up to current when this file is run;
--   * every policy is dropped before it is created, because Postgres has no
--     CREATE POLICY IF NOT EXISTS;
--   * no statement overwrites a value an admin has chosen. The one exception is
--     flagged in section 11, which cleans junk out of meetings.meeting_link and
--     is the only part of this file that edits existing data.
--
-- Order: extensions → tables → constraints/indexes → functions → RLS →
-- realtime → storage → grants → seed rows → data hygiene.
--
-- SECURITY MODEL, IN ONE PARAGRAPH. The app has no Supabase Auth. Almost every
-- table is world-readable and world-writable through the anon key, with the
-- rules enforced in app code — that is deliberate and matches how the app was
-- built. The exceptions are the tables holding secrets or private data:
-- email_settings, email_templates, email_sends, whatsapp_settings,
-- whatsapp_templates, whatsapp_sends and device_captures have RLS enabled with
-- NO policies at all, so the anon key can neither read nor write them; only the
-- service-role key (server routes) reaches them. Do not add anon policies to
-- those seven tables — the SMTP password, the Meta access token and raw
-- visitor IPs live there.
-- =============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()


-- =============================================================================
-- 1. CORE: members, meetings, role claims
-- =============================================================================

create table if not exists members (
  id                    uuid primary key default gen_random_uuid(),
  membership_no         text unique not null,
  name                  text not null,
  display_name          text not null,          -- first name, used in WhatsApp/agenda output
  active                boolean not null default true,
  created_at            timestamptz not null default now(),

  -- profile
  introduction          text,
  mentor_id             uuid references members(id) on delete set null,
  phone                 text,
  email                 text,
  city                  text,
  gender                text check (gender in ('male', 'female', 'other')),
  avatar_url            text,
  show_phone_in_contact boolean not null default false,
  theme_preference      text check (theme_preference in ('dark', 'light')),

  -- sign-in + permissions
  password_hash         text,
  password_salt         text,
  is_admin              boolean not null default false,
  can_manage_guests     boolean not null default false,
  leadership_roles      text[] not null default '{}',

  -- how the member takes part; drives the role-reservation windows
  participation_mode    text not null default 'online',

  -- notification reach. email_notifications and whatsapp_notifications are the
  -- MEMBER's own opt-outs. whatsapp_enabled is the ADMIN's gate — every
  -- WhatsApp message costs the club money, so a new member is off until an
  -- admin says otherwise, and a member cannot switch it on themselves.
  email_notifications    boolean not null default true,
  whatsapp_notifications boolean not null default true,
  whatsapp_enabled       boolean not null default false
);

-- Catch-up for databases created before these columns existed.
alter table members add column if not exists introduction           text;
alter table members add column if not exists mentor_id              uuid references members(id) on delete set null;
alter table members add column if not exists phone                  text;
alter table members add column if not exists email                  text;
alter table members add column if not exists city                   text;
alter table members add column if not exists gender                 text;
alter table members add column if not exists avatar_url             text;
alter table members add column if not exists show_phone_in_contact  boolean not null default false;
alter table members add column if not exists theme_preference       text;
alter table members add column if not exists password_hash          text;
alter table members add column if not exists password_salt          text;
alter table members add column if not exists is_admin               boolean not null default false;
alter table members add column if not exists can_manage_guests      boolean not null default false;
alter table members add column if not exists leadership_roles       text[] not null default '{}';
alter table members add column if not exists participation_mode     text not null default 'online';
alter table members add column if not exists email_notifications    boolean not null default true;
alter table members add column if not exists whatsapp_notifications boolean not null default true;

-- whatsapp_enabled arrives nullable, is backfilled, and only then gets its
-- default and NOT NULL. Adding it as NOT NULL DEFAULT false and then updating
-- would, on a re-run, switch every member an admin had since turned off back on.
alter table members add column if not exists whatsapp_enabled boolean;
update members
   set whatsapp_enabled = (whatsapp_notifications is not false)
 where whatsapp_enabled is null;
alter table members alter column whatsapp_enabled set default false;
alter table members alter column whatsapp_enabled set not null;

-- One member may hold several offices, so leadership_roles is an array. An
-- older database has the retired singular column; fold it in, once, then leave
-- it alone (it is dropped below only when it is empty everywhere).
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'members' and column_name = 'leadership_role'
  ) then
    execute $sql$
      update members
         set leadership_roles = array[leadership_role]::text[]
       where leadership_role is not null
         and coalesce(array_length(leadership_roles, 1), 0) = 0
    $sql$;
    execute 'drop index if exists members_exclusive_leadership';
    execute 'alter table members drop constraint if exists members_leadership_role_check';
    execute 'alter table members drop column leadership_role';
  end if;
end $$;

alter table members drop constraint if exists members_participation_mode_check;
alter table members add  constraint members_participation_mode_check
  check (participation_mode in ('online', 'hybrid', 'offline'));

alter table members drop constraint if exists members_gender_check;
alter table members add  constraint members_gender_check
  check (gender is null or gender in ('male', 'female', 'other'));

alter table members drop constraint if exists members_theme_preference_check;
alter table members add  constraint members_theme_preference_check
  check (theme_preference is null or theme_preference in ('dark', 'light'));


create table if not exists meetings (
  id                   uuid primary key default gen_random_uuid(),
  number               integer unique not null,
  date                 date not null,
  start_time           time not null default '10:45:00',
  end_time             time not null default '13:00:00',
  theme                text,
  meeting_type         text not null default 'regular'
                         check (meeting_type in ('regular', 'speakathon')),
  -- Every meeting opens with ONE prepared-speaker slot; more are granted by
  -- request. base_speaker_slots is the admin-set floor speaker_slots can be
  -- trimmed back to when an extra slot is given up.
  speaker_slots        integer not null default 1,
  base_speaker_slots   integer not null default 1,
  evaluator_slots      integer not null default 2,
  jury_slots           integer not null default 0,
  disabled_roles       text[] not null default '{}',
  meeting_link         text,                      -- Zoom / Meet URL, set by the TMoD or an admin
  is_special_session   boolean not null default false,
  special_session_note text,
  -- Cancelled meetings are kept (not deleted) so the reason stays visible
  -- under Past Meetings; isMeetingPast() treats cancelled as past so a
  -- replacement can be auto-scheduled in its place.
  cancelled            boolean not null default false,
  cancellation_reason  text,
  -- Speakathon layout: named heats, slot→heat mapping, and speaking order.
  speaker_groups       jsonb not null default '[]'::jsonb,   -- [{ id, name }]
  pair_groups          jsonb not null default '{}'::jsonb,   -- { "<slotIndex>": "<groupId>" }
  pair_order           jsonb not null default '[]'::jsonb,   -- [slotIndex, …]
  -- Contest controls. The two locks are independent so scoring can be frozen
  -- without disarming reset, and vice versa.
  contest_locked       boolean not null default false,
  contest_reset_locked boolean not null default false,
  contest_show_ranking boolean not null default true,
  created_at           timestamptz not null default now()
);

alter table meetings add column if not exists disabled_roles       text[] not null default '{}';
alter table meetings add column if not exists jury_slots           integer not null default 0;
alter table meetings add column if not exists speaker_groups       jsonb   not null default '[]'::jsonb;
alter table meetings add column if not exists pair_groups          jsonb   not null default '{}'::jsonb;
alter table meetings add column if not exists pair_order           jsonb   not null default '[]'::jsonb;
alter table meetings add column if not exists contest_locked       boolean not null default false;
alter table meetings add column if not exists contest_reset_locked boolean not null default false;
alter table meetings add column if not exists contest_show_ranking boolean not null default true;
alter table meetings add column if not exists meeting_link         text;
alter table meetings add column if not exists is_special_session   boolean not null default false;
alter table meetings add column if not exists special_session_note text;
alter table meetings add column if not exists cancelled            boolean not null default false;
alter table meetings add column if not exists cancellation_reason  text;
alter table meetings alter column speaker_slots set default 1;

alter table meetings add column if not exists base_speaker_slots integer;
update meetings set base_speaker_slots = speaker_slots where base_speaker_slots is null;
alter table meetings alter column base_speaker_slots set default 1;
alter table meetings alter column base_speaker_slots set not null;


create table if not exists role_claims (
  id             uuid primary key default gen_random_uuid(),
  meeting_id     uuid not null references meetings(id) on delete cascade,
  role_key       text not null,
  slot_index     integer not null default 1,   -- 1,2,3… for speaker/evaluator/jury; always 1 otherwise
  -- Exactly one of these identifies the holder. guest_name covers a visiting
  -- Toastmaster or area director who has no member row and no login; only an
  -- admin can put one in.
  member_id      uuid references members(id),
  guest_name     text,
  claimed_at     timestamptz not null default now(),
  admin_override boolean not null default false,

  -- Speech details, meaningful only when role_key = 'speaker'.
  path           text,
  speech_level   integer check (speech_level between 1 and 5),
  project        text,
  speech_title   text,
  speech_min_mins integer check (speech_min_mins between 1 and 60),
  speech_max_mins integer check (speech_max_mins between 1 and 60),

  constraint role_claims_slot_unique unique (meeting_id, role_key, slot_index)
);

alter table role_claims add column if not exists path            text;
alter table role_claims add column if not exists speech_level    integer;
alter table role_claims add column if not exists project         text;
alter table role_claims add column if not exists speech_title    text;
alter table role_claims add column if not exists speech_min_mins integer;
alter table role_claims add column if not exists speech_max_mins integer;
alter table role_claims add column if not exists guest_name      text;
alter table role_claims alter column member_id drop not null;

alter table role_claims drop constraint if exists role_claims_role_key_check;
alter table role_claims add  constraint role_claims_role_key_check
  check (role_key in (
    'speaker','evaluator','tmod','ttm','ge',
    'grammarian','ah_counter','timer','harkmaster','jury'
  ));

alter table role_claims drop constraint if exists role_claims_holder_check;
alter table role_claims add  constraint role_claims_holder_check
  check (
    ((member_id is not null) <> (guest_name is not null))
    and (guest_name is null or length(btrim(guest_name)) > 0)
  );

-- One role per member per meeting, unless an admin overrode it. Guest rows are
-- always admin_override, and NULL member_ids never collide in a unique index.
create unique index if not exists role_claims_one_per_member
  on role_claims (meeting_id, member_id)
  where not admin_override;


create table if not exists meeting_attendees (
  meeting_id uuid not null references meetings(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meeting_id, member_id)
);


-- =============================================================================
-- 2. VOTING (awards ballot)
-- =============================================================================

create table if not exists ballots (
  id                    uuid primary key default gen_random_uuid(),
  meeting_id            uuid not null references meetings(id) on delete cascade,
  status                text not null default 'not_started'
                          check (status in ('not_started', 'open', 'closed')),
  meeting_code          text,          -- 4-digit code an admin sets when opening
  voter_count           integer,       -- expected turnout, for the live counter
  table_topics_speakers jsonb not null default '[]'::jsonb,   -- [{ id, name, is_guest }]
  opened_at             timestamptz,
  closed_at             timestamptz,
  created_at            timestamptz not null default now(),
  constraint ballots_meeting_unique unique (meeting_id)
);

alter table ballots add column if not exists voter_count           integer;
alter table ballots add column if not exists table_topics_speakers jsonb not null default '[]'::jsonb;


create table if not exists votes (
  id                  uuid primary key default gen_random_uuid(),
  ballot_id           uuid not null references ballots(id) on delete cascade,
  device_uuid         text not null,
  -- Kept only to stop someone voting for themselves; never exposed by any read
  -- path, and there is no select policy on this table at all.
  voter_member_id     uuid references members(id),
  category            text not null,
  -- A vote target is either a member or a named Table Topics guest.
  voted_for_member_id uuid references members(id),
  voted_for_name      text,
  submitted_at        timestamptz not null default now(),
  constraint votes_once_per_device_category unique (ballot_id, device_uuid, category)
);

alter table votes add column if not exists voted_for_name text;
alter table votes alter column voted_for_member_id drop not null;

-- 002 and 005 each added the same unique rule under a different name. Keep one.
alter table votes drop constraint if exists votes_device_category_unique;

alter table votes drop constraint if exists votes_category_check;
alter table votes add  constraint votes_category_check
  check (category in ('speaker', 'evaluator', 'table_topics', 'role_player', 'aux_role'));


-- =============================================================================
-- 3. CONTEST SCORING (speakathon — Item 1172 ballot)
-- =============================================================================

create table if not exists jury_scores (
  id                   uuid primary key default gen_random_uuid(),
  meeting_id           uuid not null references meetings(id) on delete cascade,
  judge_member_id      uuid not null references members(id),
  contestant_member_id uuid not null references members(id),
  scores               jsonb   not null default '{}'::jsonb,   -- { rubricKey: points }
  total                integer not null default 0,
  updated_at           timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  constraint jury_scores_unique unique (meeting_id, judge_member_id, contestant_member_id)
);

create table if not exists contest_results (
  id                   uuid primary key default gen_random_uuid(),
  meeting_id           uuid not null references meetings(id) on delete cascade,
  contestant_member_id uuid not null references members(id),
  item_avgs            jsonb   not null default '{}'::jsonb,   -- { rubricKey: avg }
  final_score          numeric not null default 0,
  rank                 integer,          -- within the heat
  overall_rank         integer,          -- across every contestant
  judge_count          integer not null default 0,
  revealed             boolean not null default false,
  computed_at          timestamptz not null default now(),
  constraint contest_results_unique unique (meeting_id, contestant_member_id)
);

alter table contest_results add column if not exists overall_rank integer;


-- =============================================================================
-- 4. REQUESTS (extra speaking slot, preferred evaluator, role interest)
-- =============================================================================

create table if not exists speaker_slot_requests (
  id                     uuid        primary key default gen_random_uuid(),
  meeting_id             uuid        not null references meetings(id) on delete cascade,
  member_id              uuid        not null references members(id) on delete cascade,
  status                 text        not null default 'pending'
                                       check (status in ('pending', 'approved', 'denied')),
  request_note           text,
  -- An extra-slot request may name a preferred evaluator up front; it becomes an
  -- evaluator_requests row when the extra slot is approved.
  preferred_evaluator_id uuid        references members(id),
  reviewer_id            uuid        references members(id),
  review_comment         text,
  reviewed_at            timestamptz,
  created_at             timestamptz not null default now(),
  unique (meeting_id, member_id)
);

alter table speaker_slot_requests add column if not exists preferred_evaluator_id uuid references members(id);


create table if not exists evaluator_requests (
  id                      uuid        primary key default gen_random_uuid(),
  meeting_id              uuid        not null references meetings(id) on delete cascade,
  -- The paired evaluator slot is the same index as the speaker slot. NULL while
  -- the request came from an extra-slot request whose slot does not exist yet.
  speaker_slot_index      integer,
  speaker_id              uuid        not null references members(id) on delete cascade,
  preferred_evaluator_id  uuid        not null references members(id) on delete cascade,
  status                  text        not null default 'pending'
                                        check (status in ('pending', 'approved', 'denied', 'cancelled')),
  speaker_slot_request_id uuid        references speaker_slot_requests(id) on delete cascade,
  reviewer_id             uuid        references members(id),
  review_comment          text,
  reviewed_at             timestamptz,
  created_at              timestamptz not null default now()
);

alter table evaluator_requests alter column speaker_slot_index drop not null;
alter table evaluator_requests add column if not exists speaker_slot_request_id uuid references speaker_slot_requests(id) on delete cascade;

-- Uniqueness is per speaker, not per slot: unbound rows carry a NULL slot, and
-- NULLs never collide, so a per-slot rule could not stop duplicates. Cancel any
-- existing duplicate pendings (keeping the newest) before the index is built.
update evaluator_requests e set status = 'cancelled'
 where status = 'pending'
   and exists (
     select 1 from evaluator_requests e2
      where e2.meeting_id = e.meeting_id
        and e2.speaker_id = e.speaker_id
        and e2.status = 'pending'
        and (e2.created_at > e.created_at or (e2.created_at = e.created_at and e2.id > e.id))
   );

alter table evaluator_requests drop constraint if exists evaluator_requests_meeting_id_speaker_slot_index_key;
create unique index if not exists evaluator_requests_one_pending_per_speaker
  on evaluator_requests (meeting_id, speaker_id) where status = 'pending';


create table if not exists role_interest_requests (
  id             uuid        primary key default gen_random_uuid(),
  meeting_id     uuid        not null references meetings(id) on delete cascade,
  member_id      uuid        not null references members(id) on delete cascade,
  role_key       text        not null,
  status         text        not null default 'pending'
                               check (status in ('pending', 'approved', 'denied', 'cancelled')),
  request_note   text,
  reviewer_id    uuid        references members(id),
  review_comment text,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  -- One live request per member per role per meeting; re-requesting after a
  -- denial reuses the row (the app upserts on these three columns).
  unique (meeting_id, member_id, role_key)
);

create index if not exists role_interest_requests_status_idx on role_interest_requests (status);


-- =============================================================================
-- 5. GUESTS & ANNOUNCEMENTS
-- =============================================================================

create table if not exists guest_registrations (
  id                  uuid        primary key default gen_random_uuid(),
  meeting_id          uuid        references meetings(id) on delete set null,
  name                text,
  phone               text        not null,
  email               text        not null,
  registration_type   text        not null default 'attendance'
                                    check (registration_type in ('attendance', 'inquiry')),
  converted_to_member boolean     not null default false,
  converted_at        timestamptz,
  created_at          timestamptz not null default now()
);

alter table guest_registrations add column if not exists registration_type   text not null default 'attendance';
alter table guest_registrations add column if not exists converted_to_member boolean not null default false;
alter table guest_registrations add column if not exists converted_at        timestamptz;

create table if not exists announcements (
  id         uuid        primary key default gen_random_uuid(),
  message    text        not null,
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);


-- =============================================================================
-- 6. SURVEYS
-- =============================================================================

-- One row per member, filled once; an admin "reset" deletes the row.
create table if not exists member_interest_surveys (
  id           uuid        primary key default gen_random_uuid(),
  member_id    uuid        not null unique references members(id) on delete cascade,
  responses    jsonb       not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);

create table if not exists club_surveys (
  id            uuid        primary key default gen_random_uuid(),
  survey_number integer     not null,
  title         text,
  status        text        not null default 'draft' check (status in ('draft', 'open', 'closed')),
  closes_at     date,       -- shown to members; the admin still opens/closes by status
  opened_at     timestamptz,
  closed_at     timestamptz,
  created_at    timestamptz not null default now()
);

alter table club_surveys add column if not exists closes_at date;

create table if not exists club_survey_responses (
  id           uuid        primary key default gen_random_uuid(),
  survey_id    uuid        not null references club_surveys(id) on delete cascade,
  member_id    uuid        not null references members(id) on delete cascade,
  responses    jsonb       not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  constraint club_survey_response_unique unique (survey_id, member_id)
);


-- =============================================================================
-- 7. CLUB CONFIGURATION (singleton, id = 1)
-- =============================================================================

create table if not exists agenda_config (
  id                              integer     primary key default 1 check (id = 1),
  -- Agenda timings, in minutes.
  networking_mins                 integer     not null default 10,
  l1_speech_mins                  integer     not null default 6,
  other_speech_mins               integer     not null default 7,
  tt_speaker_count_min            integer     not null default 4,
  tt_speaker_count_max            integer     not null default 5,
  tt_mins_per_speaker             integer     not null default 2,
  tmod_conclusion_mins            integer     not null default 5,
  lock_before_mins                integer     not null default 60,
  max_speaker_slots               integer     not null default 2,
  -- Recurring meeting slot. 0 = Sunday … 6 = Saturday.
  schedule_weekday                integer     not null default 6,
  schedule_start_time             text        not null default '19:30',
  schedule_end_time               text        not null default '21:00',
  -- When true, /api/auto-schedule (the weekly cron) creates nothing — an admin
  -- who wants a break between meetings sets this instead of racing the cron.
  auto_schedule_paused            boolean     not null default false,
  -- Role categories a brand-new meeting opens with disabled.
  default_disabled_roles          text[]      not null default '{}',
  -- Role-reservation windows. The online gate holds roles for online-only
  -- members until N days out; the offline gate is the WIC India club's own,
  -- usually much tighter, window. They are independent — neither implies the
  -- other — and the no-same-role-back-to-back rotation rule applies regardless.
  online_reservation_enabled      boolean     not null default false,
  online_reservation_days_before  integer     not null default 7,
  offline_reservation_enabled     boolean     not null default true,
  offline_reservation_days_before integer     not null default 2,
  -- Speech-timer thresholds (seconds) for the public /timer page, per mode.
  -- Defaults follow the Toastmasters 675E Timer Script.
  timer_modes                     jsonb       not null default '{
    "icebreaker":  {"green": 240, "yellow": 300, "red": 360, "grace": 30},
    "speech":      {"green": 300, "yellow": 360, "red": 420, "grace": 30},
    "tabletopics": {"green": 60,  "yellow": 90,  "red": 120, "grace": 30},
    "evaluation":  {"green": 120, "yellow": 150, "red": 180, "grace": 30}
  }'::jsonb,
  updated_at                      timestamptz not null default now()
);

alter table agenda_config add column if not exists networking_mins                 integer not null default 10;
alter table agenda_config add column if not exists schedule_weekday                integer not null default 6;
-- An older database created this column defaulting to Wednesday and moved the
-- single row to Saturday afterwards. Only the DEFAULT is corrected here — the
-- row keeps whatever day the club actually meets on.
alter table agenda_config alter column schedule_weekday set default 6;
alter table agenda_config add column if not exists schedule_start_time             text    not null default '19:30';
alter table agenda_config add column if not exists schedule_end_time               text    not null default '21:00';
alter table agenda_config add column if not exists auto_schedule_paused            boolean not null default false;
alter table agenda_config add column if not exists max_speaker_slots               integer not null default 2;
alter table agenda_config add column if not exists default_disabled_roles          text[]  not null default '{}';
alter table agenda_config add column if not exists online_reservation_enabled      boolean not null default false;
alter table agenda_config add column if not exists online_reservation_days_before  integer not null default 7;
alter table agenda_config add column if not exists offline_reservation_enabled     boolean not null default true;
alter table agenda_config add column if not exists offline_reservation_days_before integer not null default 2;
alter table agenda_config add column if not exists timer_modes                     jsonb   not null default '{
  "icebreaker":  {"green": 240, "yellow": 300, "red": 360, "grace": 30},
  "speech":      {"green": 300, "yellow": 360, "red": 420, "grace": 30},
  "tabletopics": {"green": 60,  "yellow": 90,  "red": 120, "grace": 30},
  "evaluation":  {"green": 120, "yellow": 150, "red": 180, "grace": 30}
}'::jsonb;


-- =============================================================================
-- 8. NOTIFICATIONS — email and WhatsApp
--
-- Siblings, not layers: each is configured, toggled and templated on its own,
-- and a club may run either without the other. All six tables are service-role
-- only (RLS on, no policies) — see the security note at the top of this file.
-- =============================================================================

create table if not exists email_settings (
  id                         integer     primary key default 1 check (id = 1),
  enabled                    boolean     not null default false,
  smtp_host                  text        not null default '',
  smtp_port                  integer     not null default 587,
  smtp_secure                boolean     not null default false,   -- true for port 465 (implicit TLS)
  smtp_user                  text        not null default '',
  smtp_pass                  text        not null default '',      -- SECRET
  from_name                  text        not null default 'Dehradun Online Toastmasters',
  from_email                 text        not null default '',
  reply_to                   text        not null default '',
  app_url                    text        not null default '',      -- blank falls back to NEXT_PUBLIC_APP_URL
  -- Per-notification toggles.
  day_before_enabled         boolean     not null default true,    -- role reminders, 1 day before
  day_before_meeting_enabled boolean     not null default true,    -- mass meeting reminder, 1 day before
  hour_before_enabled        boolean     not null default true,    -- mass reminder, shortly before the start
  open_roles_enabled         boolean     not null default true,
  -- Lead times in DAYS before each meeting, so the invitation tracks the club's
  -- schedule instead of a fixed weekday. ARRAY[4,2] nudges twice, each time to
  -- whoever is still without a role.
  open_roles_days_before     integer[]   not null default array[2],
  updated_at                 timestamptz not null default now()
);

alter table email_settings add column if not exists app_url                    text      not null default '';
alter table email_settings add column if not exists day_before_meeting_enabled boolean   not null default true;
alter table email_settings add column if not exists open_roles_enabled         boolean   not null default true;
alter table email_settings add column if not exists open_roles_days_before     integer[] not null default array[2];

-- An early draft shipped open_roles_days_before as a scalar integer, and ADD
-- COLUMN IF NOT EXISTS skips an existing column whatever its type. Convert it.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'email_settings'
      and column_name = 'open_roles_days_before'
      and data_type <> 'ARRAY'
  ) then
    alter table email_settings alter column open_roles_days_before drop default;
    alter table email_settings alter column open_roles_days_before type integer[]
      using array[open_roles_days_before];
    alter table email_settings alter column open_roles_days_before set default array[2];
  end if;
end $$;

-- Subject + HTML body with {{placeholders}}. A blank row falls back to the
-- built-in default in lib/email/defaults.ts, so these rows exist only to give
-- admins something to override.
create table if not exists email_templates (
  key        text        primary key,
  subject    text        not null default '',
  body_html  text        not null default '',
  enabled    boolean     not null default true,
  updated_at timestamptz not null default now()
);

-- The cron claims a dedupe_key before sending; a unique violation means
-- "already sent" → skip. Overlapping or retried runs cannot double-send.
create table if not exists email_sends (
  id              uuid        primary key default gen_random_uuid(),
  dedupe_key      text        unique,
  template_key    text,
  meeting_id      uuid        references meetings(id) on delete set null,
  recipient_count integer     not null default 0,
  status          text        not null default 'sent',   -- 'sent' | 'error'
  error           text,
  created_at      timestamptz not null default now()
);


create table if not exists whatsapp_settings (
  id                            integer     primary key default 1 check (id = 1),
  enabled                       boolean     not null default false,
  access_token                  text        not null default '',      -- SECRET (Meta system-user token)
  phone_number_id               text        not null default '',
  business_account_id           text        not null default '',      -- WABA id, keyed on by the templates endpoint
  api_version                   text        not null default 'v25.0',
  -- Members type phones in whatever shape they like; anything without a country
  -- code is assumed to be from here.
  default_country_code          text        not null default '91',
  -- Plain text instead of approved templates. Only reaches someone who messaged
  -- the club in the last 24 hours, so it is for testing, not production.
  text_mode                     boolean     not null default false,
  -- Per-notification toggles, mirroring email_settings.
  meeting_created_enabled       boolean     not null default true,
  meeting_cancelled_enabled     boolean     not null default true,
  role_reminder_enabled         boolean     not null default true,
  no_role_nudge_enabled         boolean     not null default true,
  meeting_starting_enabled      boolean     not null default true,
  welcome_enabled               boolean     not null default true,
  role_change_enabled           boolean     not null default true,
  -- Width of the "starting soon" window, not an exact lead time: the cron only
  -- runs so often, so the real lead depends on where in the window it lands.
  meeting_starting_lead_minutes integer     not null default 70,
  -- Reply automatically when someone texts the club's number, with the next
  -- meeting's details. Free text inside the 24-hour window the inbound
  -- message itself opens, so — unlike everything else in this table — it
  -- needs no Meta-approved template.
  auto_reply_enabled            boolean     not null default true,
  updated_at                    timestamptz not null default now()
);

alter table whatsapp_settings add column if not exists welcome_enabled     boolean not null default true;
alter table whatsapp_settings add column if not exists role_change_enabled boolean not null default true;
alter table whatsapp_settings add column if not exists business_account_id text    not null default '';
alter table whatsapp_settings add column if not exists auto_reply_enabled  boolean not null default true;
alter table whatsapp_settings add column if not exists meeting_cancelled_enabled boolean not null default true;
alter table whatsapp_settings alter column api_version set default 'v25.0';
-- Only a row still on the version that shipped by mistake; a version an admin
-- pinned deliberately is left alone.
update whatsapp_settings set api_version = 'v25.0' where api_version = 'v21.0';

-- Meta requires a pre-approved template for any business-initiated message, so
-- a row here is a MAPPING onto one: its approved name, its language, and which
-- of our variables fill its positional {{1}}, {{2}}… parameters. body_text is
-- kept too — it is what an admin submits for approval, what text mode sends,
-- and the source the parameter order is read from when param_vars is empty.
create table if not exists whatsapp_templates (
  key           text        primary key,
  template_name text        not null default '',   -- blank → nothing is sent for this kind
  language_code text        not null default 'en',
  body_text     text        not null default '',
  param_vars    text[]      not null default '{}',
  enabled       boolean     not null default true,
  updated_at    timestamptz not null default now()
);

-- Same dedupe contract as email_sends. The delivery_* columns are separate from
-- `status` on purpose: "Meta accepted it" and "the phone received it" are two
-- different facts, and an admin chasing a missing reminder needs to know which
-- of the two failed. delivery_status is NULL until a webhook callback arrives.
create table if not exists whatsapp_sends (
  id              uuid        primary key default gen_random_uuid(),
  dedupe_key      text        unique,
  template_key    text,
  meeting_id      uuid        references meetings(id) on delete set null,
  recipient       text,                                   -- E.164 digits, no '+'
  wa_message_id   text,                                   -- Meta's id, when accepted
  status          text        not null default 'sent',    -- 'sent' | 'error'
  error           text,
  delivery_status text,                                   -- 'sent'|'delivered'|'read'|'failed', verbatim from Meta
  delivery_error  text,
  delivery_at     timestamptz,
  created_at      timestamptz not null default now()
);

alter table whatsapp_sends add column if not exists delivery_status text;
alter table whatsapp_sends add column if not exists delivery_error  text;
alter table whatsapp_sends add column if not exists delivery_at     timestamptz;

create index if not exists whatsapp_sends_created_idx    on whatsapp_sends (created_at desc);
-- The webhook looks a row up by Meta's message id on every callback, and there
-- are three or four of those per message.
create index if not exists whatsapp_sends_wa_message_idx on whatsapp_sends (wa_message_id);


-- =============================================================================
-- 9. ANALYTICS — app-open captures
--
-- Written only by /api/capture with the service-role key. RLS is on with NO
-- policies, so the anon key can neither read nor write it: raw IPs stay
-- server-side.
-- =============================================================================

create table if not exists device_captures (
  id              uuid primary key default gen_random_uuid(),
  visitor_id      text,        -- FingerprintJS visitorId (survives storage clears)
  member_id       uuid references members(id) on delete set null,
  ip              text,
  user_agent      text,
  browser         text,
  browser_version text,
  os              text,
  os_version      text,
  device_type     text,        -- mobile | tablet | desktop | …
  device_vendor   text,
  device_model    text,
  screen          text,        -- e.g. "390x844@2"
  timezone        text,
  languages       text,
  city            text,        -- best-effort geo from the IP
  region          text,
  country         text,
  path            text,        -- pathname the capture fired from
  created_at      timestamptz not null default now()
);

create index if not exists device_captures_created_at_idx on device_captures (created_at desc);
create index if not exists device_captures_visitor_idx    on device_captures (visitor_id);
create index if not exists device_captures_member_idx     on device_captures (member_id);


-- =============================================================================
-- 10. FUNCTIONS
--
-- SECURITY DEFINER so the anon key can get aggregates out of `votes` without
-- being able to read individual rows — which is what keeps the ballot secret.
-- =============================================================================

create or replace function has_voted(p_ballot_id uuid, p_device_uuid text)
returns boolean security definer language sql stable as $$
  select exists (
    select 1 from votes where ballot_id = p_ballot_id and device_uuid = p_device_uuid
  );
$$;

-- Retained under its original name; has_voted is the one the app calls.
create or replace function has_device_voted(p_ballot_id uuid, p_device_uuid text)
returns boolean security definer language sql stable as $$
  select exists (
    select 1 from votes where ballot_id = p_ballot_id and device_uuid = p_device_uuid limit 1
  );
$$;

create or replace function get_vote_count(p_ballot_id uuid)
returns bigint security definer language sql stable as $$
  select count(distinct device_uuid) from votes where ballot_id = p_ballot_id;
$$;

create or replace function get_ballot_results(p_ballot_id uuid)
returns table (
  category               text,
  voted_for_member_id    uuid,
  voted_for_display_name text,
  vote_count             bigint
) security definer language sql stable as $$
  select
    v.category,
    v.voted_for_member_id,
    coalesce(m.display_name, v.voted_for_name, 'Unknown') as voted_for_display_name,
    count(*) as vote_count
  from votes v
  left join members m on m.id = v.voted_for_member_id
  where v.ballot_id = p_ballot_id
  group by v.category, v.voted_for_member_id, v.voted_for_name, m.display_name
  order by v.category, count(*) desc;
$$;

-- The admin resets a ballot by deleting its votes, but anon has no DELETE
-- policy on votes — so the delete happens here instead.
create or replace function delete_ballot_votes(p_ballot_id uuid)
returns void security definer language sql as $$
  delete from votes where ballot_id = p_ballot_id;
$$;


-- =============================================================================
-- 11. ROW LEVEL SECURITY
--
-- Policies are dropped before being created because Postgres has no
-- CREATE POLICY IF NOT EXISTS — that is what makes this file re-runnable.
-- =============================================================================

alter table members                 enable row level security;
alter table meetings                enable row level security;
alter table role_claims             enable row level security;
alter table meeting_attendees       enable row level security;
alter table ballots                 enable row level security;
alter table votes                   enable row level security;
alter table jury_scores             enable row level security;
alter table contest_results         enable row level security;
alter table speaker_slot_requests   enable row level security;
alter table evaluator_requests      enable row level security;
alter table role_interest_requests  enable row level security;
alter table guest_registrations     enable row level security;
alter table announcements           enable row level security;
alter table member_interest_surveys enable row level security;
alter table club_surveys            enable row level security;
alter table club_survey_responses   enable row level security;
alter table agenda_config           enable row level security;

-- Service-role only — no policies follow for these seven.
alter table email_settings     enable row level security;
alter table email_templates    enable row level security;
alter table email_sends        enable row level security;
alter table whatsapp_settings  enable row level security;
alter table whatsapp_templates enable row level security;
alter table whatsapp_sends     enable row level security;
alter table device_captures    enable row level security;

do $$
declare
  p record;
  old record;
begin
  -- Every policy on these tables is replaced, not added to. Migrations 001–054
  -- built them up under assorted names ("anon insert members", "public read
  -- attendees"…); dropping whatever is there before recreating them is what
  -- makes an upgraded database identical to a fresh one instead of carrying
  -- both sets. The verb-by-verb grants below reproduce exactly what those
  -- migrations allowed, so no table gains or loses a permission here.
  for p in
    select unnest(array[
      'members', 'meetings', 'role_claims', 'meeting_attendees', 'ballots',
      'jury_scores', 'contest_results', 'guest_registrations', 'announcements',
      'member_interest_surveys', 'club_surveys', 'club_survey_responses',
      'agenda_config', 'votes',
      'speaker_slot_requests', 'evaluator_requests', 'role_interest_requests'
    ]) as tbl
  loop
    for old in
      select policyname from pg_policies where schemaname = 'public' and tablename = p.tbl
    loop
      execute format('drop policy if exists %I on %I', old.policyname, p.tbl);
    end loop;
  end loop;

  -- Everything here is world-readable; the second column is which WRITES the
  -- anon key may make — i = insert, u = update, d = delete.
  --
  -- These are not blanket "for all" grants, and the gaps are deliberate. Nothing
  -- in the app deletes a member or a ballot, and nothing updates an attendee
  -- row, so those verbs stay closed: with the publishable key in every browser,
  -- an unused permission is only ever a way to lose the roster. `votes` is
  -- absent entirely — it gets its own far stricter policy below.
  for p in
    select * from (values
      ('members',                 'iu'),    -- no delete: the roster is never removed, only deactivated
      ('ballots',                 'iu'),    -- no delete: reset clears votes, keeps the ballot
      ('meeting_attendees',       'id'),    -- no update: a row is added or withdrawn, never edited
      ('meetings',                'iud'),
      ('role_claims',             'iud'),
      ('jury_scores',             'iud'),
      ('contest_results',         'iud'),
      ('guest_registrations',     'iud'),
      ('announcements',           'iud'),
      ('agenda_config',           'iud'),
      ('member_interest_surveys', 'iud'),
      ('club_surveys',            'iud'),
      ('club_survey_responses',   'iud')
    ) as t(tbl, verbs)
  loop
    execute format('create policy "public read %1$s" on %1$I for select using (true)', p.tbl);
    if position('i' in p.verbs) > 0 then
      execute format('create policy "public insert %1$s" on %1$I for insert with check (true)', p.tbl);
    end if;
    if position('u' in p.verbs) > 0 then
      execute format('create policy "public update %1$s" on %1$I for update using (true) with check (true)', p.tbl);
    end if;
    if position('d' in p.verbs) > 0 then
      execute format('create policy "public delete %1$s" on %1$I for delete using (true)', p.tbl);
    end if;
  end loop;

  -- The three request tables were granted to the anon role explicitly. The role
  -- exists on Supabase; the guard is for a self-hosted Postgres without it.
  for p in
    select unnest(array[
      'speaker_slot_requests', 'evaluator_requests', 'role_interest_requests'
    ]) as tbl
  loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant all on %I to anon', p.tbl);
      execute format(
        'create policy "public_access" on %I for all to anon using (true) with check (true)', p.tbl);
    else
      execute format(
        'create policy "public_access" on %I for all using (true) with check (true)', p.tbl);
    end if;
  end loop;
end $$;

-- votes is the one table with an asymmetric policy set: anyone may cast a vote
-- into an OPEN ballot, and nobody may read the rows back. The absent select
-- policy is the ballot secrecy — results come out only through
-- get_ballot_results(), which is SECURITY DEFINER and returns totals alone.
create policy "anon insert votes" on votes for insert
  with check (exists (select 1 from ballots where id = ballot_id and status = 'open'));


-- =============================================================================
-- 12. REALTIME
-- =============================================================================

-- Skipped entirely when the publication is absent (a self-hosted Postgres
-- without Supabase Realtime); the app degrades to polling rather than failing.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not found — skipping realtime setup';
    return;
  end if;
  foreach t in array array['role_claims', 'ballots', 'votes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;


-- =============================================================================
-- 13. STORAGE — member avatars
-- =============================================================================

-- A public 2 MB bucket, readable and writable by anyone: the app has no
-- Supabase Auth, so an avatar upload arrives with the anon key like everything
-- else. Skipped when the storage schema is absent (self-hosted Postgres).
do $$ begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema not found — skipping avatar bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('member-avatars', 'member-avatars', true, 2097152, array['image/jpeg', 'image/png'])
  on conflict (id) do nothing;

  drop policy if exists "avatars public read"    on storage.objects;
  drop policy if exists "avatars public upload"  on storage.objects;
  drop policy if exists "avatars public replace" on storage.objects;

  create policy "avatars public read"    on storage.objects for select using (bucket_id = 'member-avatars');
  create policy "avatars public upload"  on storage.objects for insert with check (bucket_id = 'member-avatars');
  create policy "avatars public replace" on storage.objects for update using (bucket_id = 'member-avatars');
end $$;


-- =============================================================================
-- 14. SEED ROWS
--
-- The three config singletons, and the template keys admins can override.
-- Blank template rows fall back to the built-in copy in lib/email/defaults.ts
-- and lib/whatsapp/defaults.ts, so these never need filling in to work.
-- =============================================================================

insert into agenda_config     (id) values (1) on conflict (id) do nothing;
insert into email_settings    (id) values (1) on conflict (id) do nothing;
insert into whatsapp_settings (id) values (1) on conflict (id) do nothing;

insert into email_templates (key) values
  ('meeting_created'), ('role_assigned'), ('role_removed'), ('role_reminder'),
  ('meeting_reminder'), ('evaluator_request'), ('open_roles'),
  ('activity_report'), ('activity_encouragement')
on conflict (key) do nothing;

insert into whatsapp_templates (key) values
  ('meeting_created'), ('role_reminder'), ('no_role_nudge'), ('meeting_starting'),
  ('welcome'), ('role_assigned'), ('role_removed')
on conflict (key) do nothing;


-- =============================================================================
-- 15. DATA HYGIENE — meetings.meeting_link
--
-- THE ONLY SECTION THAT EDITS EXISTING DATA. Harmless on a new database (no
-- rows), and safe to re-run, but on a live one it rewrites and in some cases
-- clears meeting_link. To see what it would touch before running it:
--
--   select number, date, meeting_link from meetings
--    where meeting_link is not null and meeting_link !~* '^https?://';
--
-- Why it exists: a TMoD pastes whatever their conferencing tool handed them,
-- often a bare host ("meet.google.com/abc-defg-hij"). Rendered into an href a
-- bare host is a RELATIVE path, so "Join meeting" 404s inside the app, and the
-- same dead string goes out in the email and WhatsApp reminders. The app now
-- normalizes on save (normalizeMeetingLink in lib/utils.ts); this brings rows
-- saved before that into line.
-- =============================================================================

-- Surrounding whitespace, then blanks to NULL — the column's "not set yet" value.
update meetings set meeting_link = btrim(meeting_link)
 where meeting_link is not null and meeting_link <> btrim(meeting_link);

update meetings set meeting_link = null
 where meeting_link is not null and btrim(meeting_link) = '';

-- Text that cannot be a URL — it contains whitespace ("to be decided", "ask the
-- TMoD"), or its host has no dot. Cleared rather than left in place: the app
-- then shows "To be set" and nags the TMoD, which is true, where a dead link is
-- a lie members only discover at meeting time.
update meetings set meeting_link = null
 where meeting_link is not null
   and (
     meeting_link ~ '[[:space:]]'
     or strpos(split_part(regexp_replace(meeting_link, '^[a-z][a-z0-9+.-]*://', '', 'i'), '/', 1), '.') = 0
   );

-- Bare host → https://, matching what the app now does on save.
update meetings set meeting_link = 'https://' || meeting_link
 where meeting_link is not null
   and meeting_link !~* '^[a-z][a-z0-9+.-]*://';

-- =============================================================================
-- End of schema.
-- =============================================================================
