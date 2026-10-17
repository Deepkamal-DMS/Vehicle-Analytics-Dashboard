-- A dealer's own named sub-entities - "Dealership A" might be a second
-- Bajaj license in the same RTO as their main one, or a Suzuki license
-- across town. Each one is scoped to exactly one Maker and one RTO-wise
-- scope (see auth.js's BACKENDS comment and script.js's RTO_SCOPES for
-- what "scope" means here) - that scope is what the per-RTO class
-- tables' dealership_id column (see 10-schema.sql) points into.
--
-- Which RTO(s) within that scope belong to this dealership lives in
-- dealership_rtos below, not a column here - a dealership almost
-- always covers exactly one (the common case, e.g. one branch), but a
-- combined one (say "Ahmedabad Region") can cover several, with
-- uploads for any of its member RTOs tagged to this same dealership.
--
-- No GRANT to anon/authenticated, same reasoning as accounts: read and
-- written only by server.js (list-dealerships/create-dealership),
-- which connects as the postgres superuser directly - a browser can
-- never query this table on its own.

CREATE TABLE dealerships (
    id              serial PRIMARY KEY,
    owner_username  text NOT NULL,
    name            text NOT NULL,
    maker           text NOT NULL,
    scope           text NOT NULL CHECK (scope IN ('gujarat', 'maharashtra')),
    -- true (the default, and almost always correct) for the account
    -- holder's own business - false marks a dealership they only
    -- added to compare themselves against, e.g. a known competitor's
    -- RTO-wise registrations. Only loadDealerContribution() reads
    -- this (it must never blend a competitor's units into "your
    -- contribution") - the dealer-wise breakdown table shows every
    -- dealership regardless, own or not, since comparing against
    -- competitors is the whole point of that one.
    is_own          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_username, name)
);

-- One row per RTO a dealership covers. Looked up with an EXISTS check
-- (see server.js's resolveDealershipId()/resolveBulkDealership()),
-- never joined back into a single "the" RTO - a dealership's RTO set
-- is genuinely a set, not a single value with a multi-value escape
-- hatch.
CREATE TABLE dealership_rtos (
    dealership_id  integer NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
    rto_code       text NOT NULL,
    PRIMARY KEY (dealership_id, rto_code)
);
