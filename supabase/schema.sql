-- Cordyceps schema.
-- Paste into the Supabase SQL editor. Idempotent: safe to re-run.
--
-- Design notes that are load-bearing (see docs/plan.md):
--   * resource.parent_id gives folder inheritance, so a group grant on finance/
--     resolves down to the file. Without it "broad share read" is a fiction.
--   * permission.granted_reason / last_reviewed_at carry provenance — the
--     "correct six months ago" story and the IGA answer.
--   * access_event.occurred_at is supplied by the caller, never defaulted to
--     now(). Scoring must never read the wall clock.

drop table if exists approval_request cascade;
drop table if exists access_event cascade;
drop table if exists behaviour_profile cascade;
drop table if exists permission cascade;
drop table if exists task cascade;
drop table if exists resource cascade;
drop table if exists group_membership cascade;
drop table if exists user_group cascade;
drop table if exists project_membership cascade;
drop table if exists project cascade;
drop table if exists employee cascade;

-- ---------------------------------------------------------------- identities

create table employee (
  id                text primary key,
  name              text not null,
  role              text not null,
  department        text,
  manager_id        text references employee (id),
  identity_type     text not null default 'human'
                    check (identity_type in ('human','admin','service','oauth_app')),
  -- oauth_app only:
  acts_for          text references employee (id),
  connected_at      timestamptz,
  scope             text,
  last_reviewed_at  timestamptz,
  last_used_at      timestamptz,
  -- humans only: local time-of-day baseline
  work_hours_start  time,
  work_hours_end    time
);

-- ----------------------------------------------------------------- work

create table project (
  id           text primary key,
  name         text not null,
  purpose      text,
  owner_id     text references employee (id),
  status       text not null default 'active'
               check (status in ('active','paused','completed')),
  sensitivity  text not null
               check (sensitivity in ('public','internal','confidential','restricted')),
  started_at   timestamptz,
  ended_at     timestamptz
);

create table project_membership (
  employee_id      text not null references employee (id),
  project_id       text not null references project (id),
  role_on_project  text,
  primary key (employee_id, project_id)
);

create table task (
  id              text primary key,
  title           text not null,
  description     text,
  -- nullable: cross-project work (e.g. an architecture review) has no project
  project_id      text references project (id),
  assignee_id     text references employee (id),
  parent_task_id  text references task (id),
  status          text not null default 'open'
                  check (status in ('open','in_progress','done','cancelled')),
  due_at          timestamptz
);

-- ----------------------------------------------------------------- resources

create table resource (
  id           text primary key,
  name         text not null,
  type         text not null
               check (type in ('file','folder','db_table','dashboard','secret','repo')),
  project_id   text references project (id),   -- null = company-wide
  parent_id    text references resource (id),  -- folder inheritance
  owner_id     text references employee (id),
  sensitivity  text not null
               check (sensitivity in ('public','internal','confidential','restricted')),
  category     text                            -- source | technical_doc | financial | legal | ops
);

-- --------------------------------------------------------------- permissions
-- Membership and permission are deliberately separate. Alice holds the
-- permission and lacks the membership; that contradiction is the product.

create table user_group (
  id    text primary key,
  name  text not null
);

create table group_membership (
  group_id     text not null references user_group (id),
  employee_id  text not null references employee (id),
  primary key (group_id, employee_id)
);

create table permission (
  id                text primary key,
  subject_type      text not null check (subject_type in ('employee','group')),
  subject_id        text not null,
  resource_id       text not null references resource (id),
  action            text not null check (action in ('view','download','edit','delete')),
  granted_at        timestamptz,
  granted_reason    text,
  last_reviewed_at  timestamptz
);

create index permission_subject_idx on permission (subject_type, subject_id);
create index permission_resource_idx on permission (resource_id);

-- ------------------------------------------------------------------ history

create table access_event (
  id                 text primary key,
  identity_id        text not null references employee (id),
  resource_id        text not null references resource (id),
  action             text not null check (action in ('view','download','edit','delete')),
  -- supplied by the caller. NEVER default this to now().
  occurred_at        timestamptz not null,
  device             text,
  location_risk      text check (location_risk in ('low','medium','high')),
  auth_method        text,
  session_type       text check (session_type in ('password','sso','oauth_token')),
  -- null for seeded history; populated once evaluated
  -- DENY is a conventional RBAC refusal and sits outside the four contextual
  -- bands. It is recorded, but it is never routable to an approver.
  decision           text check (decision in ('ALLOW','ALLOW_AND_FLAG','STEP_UP','REQUIRE_APPROVAL','DENY')),
  risk_score         int,
  policy_reasons     jsonb,
  reasoning          text,
  is_seeded_history  boolean not null default false
);

create index access_event_identity_idx on access_event (identity_id, occurred_at desc);

-- Computed by the Modal baselining job at seed time, read at request time.
-- Precomputed on purpose: a cold start inside a live decision would be the
-- most likely way the demo dies.
create table behaviour_profile (
  employee_id        text primary key references employee (id),
  typical_start      time,
  typical_end        time,
  project_mix        jsonb,   -- { "atlas": 0.95, "beacon": 0.05 }
  category_mix       jsonb,   -- { "source": 0.6, "technical_doc": 0.4 }
  files_per_hour_p95 numeric,
  download_ratio     numeric,
  projects_never_touched jsonb,
  computed_at        timestamptz,
  computed_by        text default 'modal'
);

-- ----------------------------------------------------------------- approvals

create table approval_request (
  id               text primary key,
  access_event_id  text not null references access_event (id),
  approver_id      text not null references employee (id),
  status           text not null default 'pending'
                   check (status in ('pending','approved','rejected','expired')),
  summary          text,
  -- real wall-clock: a human is genuinely waiting. The one place now() is right.
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  decided_at       timestamptz,
  decided_by       text references employee (id),
  justification    text
);

create index approval_pending_idx on approval_request (status, created_at desc);
