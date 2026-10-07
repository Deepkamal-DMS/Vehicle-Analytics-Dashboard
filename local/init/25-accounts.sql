-- Replaces local/server/.env's IMPORT_ADMIN_USER/IMPORT_ADMIN_PASSWORD/
-- IMPORT_EXTRA_CREDENTIALS now that an account is more than a
-- username/password pair - see server.js's own header for the full
-- story. Left empty on purpose: server.js seeds the admin and Anuj
-- rows itself on first start, hashed, so no password is ever hand-
-- typed into a SQL file.
--
-- No GRANT to anon/authenticated: read and written only by
-- server.js, which connects as the postgres superuser directly, not
-- through PostgREST - a browser can never reach this table.

CREATE TABLE accounts (
    username          text PRIMARY KEY,
    password_hash     bytea NOT NULL,
    password_salt     bytea NOT NULL,
    name              text NOT NULL,
    dealership        text NOT NULL DEFAULT '',
    can_manage_users  boolean NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now()
);
