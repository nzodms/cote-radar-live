-- ============================================================================
-- CoteRadar Live — Schéma Supabase (Postgres)
-- ============================================================================
-- À exécuter dans Supabase: SQL Editor > New query > coller > Run.
-- Idempotent: utilise CREATE TABLE IF NOT EXISTS.
--
-- Sécurité: RLS activé sur toutes les tables, SANS policy publique.
-- L'app accède aux données côté serveur via la SERVICE_ROLE_KEY (bypass RLS).
-- L'anon key ne peut donc rien lire/écrire par défaut (outil privé).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- world_cup_matches : 1 ligne par fixture Coupe du monde suivie
-- ----------------------------------------------------------------------------
create table if not exists world_cup_matches (
  id uuid primary key default gen_random_uuid(),
  fixture_id bigint unique not null,
  league_id int,
  league_name text,
  season int,
  round text,
  group_name text,
  home_team_id bigint,
  home_team_name text,
  home_team_logo text,
  away_team_id bigint,
  away_team_name text,
  away_team_logo text,
  kickoff_at timestamptz,
  status_short text,
  status_long text,
  elapsed int,
  home_goals int,
  away_goals int,
  venue_name text,
  venue_city text,
  raw_fixture jsonb,
  last_synced_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_wcm_status on world_cup_matches (status_short);
create index if not exists idx_wcm_kickoff on world_cup_matches (kickoff_at);
create index if not exists idx_wcm_season on world_cup_matches (season);

-- ----------------------------------------------------------------------------
-- match_statistics_snapshots : snapshot horodaté des stats live
-- ----------------------------------------------------------------------------
create table if not exists match_statistics_snapshots (
  id uuid primary key default gen_random_uuid(),
  fixture_id bigint not null,
  collected_at timestamptz default now(),
  home_stats jsonb,
  away_stats jsonb,
  raw_statistics jsonb
);

create index if not exists idx_mss_fixture on match_statistics_snapshots (fixture_id);
create index if not exists idx_mss_collected on match_statistics_snapshots (fixture_id, collected_at desc);

-- ----------------------------------------------------------------------------
-- match_events : événements (buts, cartons, changements, penalties, VAR)
-- ----------------------------------------------------------------------------
create table if not exists match_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id bigint not null,
  event_time int,
  team_id bigint,
  team_name text,
  player_name text,
  assist_name text,
  type text,
  detail text,
  comments text,
  raw_event jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_me_fixture on match_events (fixture_id);

-- ----------------------------------------------------------------------------
-- match_lineups : compositions (titulaires/remplaçants/formation/coach)
-- ----------------------------------------------------------------------------
create table if not exists match_lineups (
  id uuid primary key default gen_random_uuid(),
  fixture_id bigint not null,
  team_id bigint,
  team_name text,
  formation text,
  coach_name text,
  raw_lineup jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_ml_fixture on match_lineups (fixture_id);

-- ----------------------------------------------------------------------------
-- analysis_snapshots : sorties horodatées du moteur d'analyse
-- ----------------------------------------------------------------------------
create table if not exists analysis_snapshots (
  id uuid primary key default gen_random_uuid(),
  fixture_id bigint not null,
  collected_at timestamptz default now(),
  home_momentum int,
  away_momentum int,
  signal_level text,
  confidence_level text,
  market_signals jsonb,
  risks jsonb,
  verdict text,
  raw_analysis jsonb
);

create index if not exists idx_as_fixture on analysis_snapshots (fixture_id);
create index if not exists idx_as_collected on analysis_snapshots (fixture_id, collected_at desc);

-- ----------------------------------------------------------------------------
-- api_usage_logs : audit de consommation API-Football (quota Free 100/jour)
-- ----------------------------------------------------------------------------
create table if not exists api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  endpoint text,
  fixture_id bigint,
  called_at timestamptz default now(),
  estimated_cost int default 1,
  success boolean,
  error_message text
);

create index if not exists idx_aul_called on api_usage_logs (called_at desc);

-- ----------------------------------------------------------------------------
-- affiliate_clicks : préparation affiliation (non utilisé en V1)
-- ----------------------------------------------------------------------------
create table if not exists affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  fixture_id bigint,
  bookmaker text,
  target_url text,
  created_at timestamptz default now(),
  user_agent text,
  ip_hash text
);

create index if not exists idx_ac_fixture on affiliate_clicks (fixture_id);

-- ----------------------------------------------------------------------------
-- RLS : activé partout, aucune policy publique (accès via service_role only)
-- ----------------------------------------------------------------------------
alter table world_cup_matches enable row level security;
alter table match_statistics_snapshots enable row level security;
alter table match_events enable row level security;
alter table match_lineups enable row level security;
alter table analysis_snapshots enable row level security;
alter table api_usage_logs enable row level security;
alter table affiliate_clicks enable row level security;

-- ============================================================================
-- V2 — Live Advice + Commentaires (source secondaire) + Cotes
-- (équivalent à supabase/migrations/0002_live_advice.sql)
-- ============================================================================

-- Minute de jeu sur les snapshots stats (analyse par fenêtres 5/10 min).
alter table match_statistics_snapshots add column if not exists elapsed int;

-- ----------------------------------------------------------------------------
-- live_advice_snapshots : conseils live calculés par l'assistant
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

alter table live_advice_snapshots enable row level security;
alter table external_live_commentary_events enable row level security;
alter table odds_snapshots enable row level security;

-- ============================================================================
-- V3 — Surveillance live continue (équivalent à migrations/0003_live_monitor.sql)
-- ============================================================================
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
  mode text,
  last_alert_at timestamptz,
  last_alert_signature text,
  last_alert_text text
);

create index if not exists idx_lws_status on live_watch_sessions (status);
create index if not exists idx_lws_next_poll on live_watch_sessions (status, next_poll_at);
create unique index if not exists idx_lws_active_fixture
  on live_watch_sessions (fixture_id)
  where status = 'active';

alter table live_watch_sessions enable row level security;
