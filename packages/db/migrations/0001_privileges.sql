-- SCHEMA §4.1 / ARCHITECTURE §9.5: the Supabase anon key must read nothing. Runs only where the
-- Supabase roles exist (plain Postgres, PGlite and the CI container skip it).
CREATE SCHEMA IF NOT EXISTS refund;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA refund FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA refund FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA refund FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA refund REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA refund REVOKE ALL ON SEQUENCES FROM anon, authenticated';
  END IF;
END $$;
