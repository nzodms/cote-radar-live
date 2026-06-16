-- ============================================================================
-- CoteRadar Live — Migration 0002 : Live Advice + Commentaires + Cotes
-- ============================================================================
-- À exécuter dans Supabase (SQL Editor) sur une base déjà initialisée avec
-- supabase/schema.sql. Idempotent.
-- ============================================================================

create extension if not exists "pgcrypto";

-- Minute de jeu sur les snapshots de stats (nécessaire à l'analyse par fenêtres).
alter table match_statistics_snapshots add column if not exists elapsed int;

-- ----------------------------------------------------------------------------
-- live_advice_snapshots : chaque conseil live calculé (assistant)
-- ----------------------------------------------------------------------------
create table if not exists live_advice_snapshots (
  id uuid primary key default gen_random_uuid(),
  fixture_id bigint not null,
  collected_at timestamptz default now(),
  minute int,
  score_home int,
  score_away int,
  action text,
  main_advice text,
  confidence text,
  urgency text,
  recommended_markets jsonb,
  avoid_markets jsonb,
  risks jsonb,
  invalidation_conditions jsonb,
  data_quality jsonb,
  raw_advice jsonb
);

create index if not exists idx_las_fixture on live_advice_snapshots (fixture_id);
create index if not exists idx_las_collected on live_advice_snapshots (fixture_id, collected_at desc);

-- ----------------------------------------------------------------------------
-- external_live_commentary_events : source secondaire (désactivée par défaut)
-- ----------------------------------------------------------------------------
create table if not exists external_live_commentary_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id bigint not null,
  source_name text not null,
  source_url text,
  collected_at timestamptz default now(),
  event_minute int,
  event_time_label text,
  team_name text,
  player_name text,
  event_type text,
  normalized_impact text,
  raw_title text,
  raw_description text,
  validation_status text,
  raw_event jsonb
);

create index if not exists idx_elce_fixture on external_live_commentary_events (fixture_id);
create index if not exists idx_elce_collected on external_live_commentary_events (fixture_id, collected_at desc);

-- ----------------------------------------------------------------------------
-- odds_snapshots : préparation cotes / value / affiliation
-- ----------------------------------------------------------------------------
create table if not exists odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  fixture_id bigint not null,
  source text,
  bookmaker text,
  market text,
  selection text,
  odd decimal,
  implied_probability decimal,
  collected_at timestamptz default now(),
  raw_odds jsonb
);

create index if not exists idx_os_fixture on odds_snapshots (fixture_id);
create index if not exists idx_os_collected on odds_snapshots (fixture_id, collected_at desc);

-- ----------------------------------------------------------------------------
-- RLS : activé, sans policy publique (accès via service_role uniquement)
-- ----------------------------------------------------------------------------
alter table live_advice_snapshots enable row level security;
alter table external_live_commentary_events enable row level security;
alter table odds_snapshots enable row level security;
