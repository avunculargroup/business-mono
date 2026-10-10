-- Stand-ins for the Supabase and platform objects the library papers migration
-- depends on, so it can run on a vanilla Postgres 16 with no pgvector.
-- See docs/features/client-app/library-papers-build-progress.md#checking-it-locally
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;

CREATE TABLE team_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_id uuid);
-- The founder the migration's licence seed names as decider.
INSERT INTO team_members (id) VALUES ('2fcaea14-6d37-4def-b56d-467d61c92f36');
CREATE TABLE client_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_type text);
CREATE TABLE client_users (id uuid PRIMARY KEY, account_id uuid, status text);

CREATE FUNCTION is_team_member() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT EXISTS (SELECT 1 FROM team_members WHERE auth_id = auth.uid()) $$;
CREATE FUNCTION current_client_account_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT account_id FROM client_users WHERE id = auth.uid() AND status = 'active' $$;
CREATE FUNCTION update_updated_at() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT ALL ON storage.objects TO anon, authenticated;

CREATE TABLE routines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action_type text);
CREATE SCHEMA extensions;
