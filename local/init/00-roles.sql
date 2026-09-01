-- Mirrors the Supabase access path rather than running everything as
-- superuser: the dashboard reads as `anon` through PostgREST, every
-- table has RLS on with a SELECT-only policy, and writes are refused
-- by the database. Testing against superuser would not exercise any
-- of that.

CREATE ROLE anon NOLOGIN;

CREATE ROLE authenticated NOLOGIN;

CREATE ROLE authenticator LOGIN PASSWORD 'authenticator' NOINHERIT;

GRANT anon TO authenticator;
GRANT authenticated TO authenticator;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
