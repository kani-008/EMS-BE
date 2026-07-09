-- ============================================================================
-- Run this FIRST against your single Supabase Postgres database.
-- Creates the two schemas that replace the old two-MySQL-database split,
-- plus one shared trigger function used by both.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS credentials;
CREATE SCHEMA IF NOT EXISTS event_management;

-- Shared trigger function (keeps last_updated_on current on every UPDATE —
-- Postgres has no "ON UPDATE CURRENT_TIMESTAMP" column clause like MySQL).
-- Lives in `public` so both schemas can reference it without duplication.
CREATE OR REPLACE FUNCTION public.set_last_updated_on()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_on = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
