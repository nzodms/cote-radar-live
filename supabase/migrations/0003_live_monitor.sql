-- ============================================================================
-- CoteRadar Live — Migration 0003 : Surveillance live continue (live monitor)
-- ============================================================================
-- À exécuter dans Supabase (SQL Editor). Idempotent.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- live_watch_sessions : une session de surveillance par fixture
-- ----------------------------------------------------------------------------
create table if not exists live_watch_sessions (
  id uuid primary key default gen_random_uuid(),
  fixture_id bigint not null,
  status text default 'active',
  started_at timestamptz default now(),
  stopped_at timestamptz,
  poll_interval_seconds int,
  last_polled_at timestamptz,
  next_poll_at timestamptz,
  api_calls_used int default 0,
  last_error text,
  -- colonnes additionnelles pour la stratégie / anti-spam alertes
  mode text,
  last_alert_at timestamptz,
  last_alert_signature text,
  last_alert_text text
);

create index if not exists idx_lws_status on live_watch_sessions (status);
create index if not exists idx_lws_next_poll on live_watch_sessions (status, next_poll_at);
-- Une seule session ACTIVE par fixture.
create unique index if not exists idx_lws_active_fixture
  on live_watch_sessions (fixture_id)
  where status = 'active';

alter table live_watch_sessions enable row level security;
