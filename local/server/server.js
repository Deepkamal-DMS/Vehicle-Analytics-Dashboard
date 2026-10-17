/*
 * The local stand-in for supabase/functions/import-workbook - same
 * job, same HTTP contract (mode=ping/preview/commit/bulk, Basic auth,
 * multipart file upload), running as a plain Node process against the
 * docker-compose Postgres instead of a Deno Edge Function against
 * Supabase's. auth.js/script.js do not know or care which one they
 * are talking to; only IMPORT_FUNCTION_URL (see script.js's BACKENDS)
 * says that.
 *
 * What's reused, verbatim, from the real thing:
 *   - xlsx-reader.js / validate.js's readSheet()/describeFile()/
 *     validateWorkbook() - the exact parsing and validation rules, so
 *     a file that would pass or fail the real Import dialog passes or
 *     fails here the same way. See those files' own headers.
 *
 * What's different, and why:
 *   - Supabase checks one shared admin credential, from two platform
 *     secrets. This has moved further than that: real per-person
 *     accounts (username, password, name, dealership, and whether an
 *     account may create further ones), in the accounts table (see
 *     local/init/25-accounts.sql) rather than this folder's .env -
 *     an account is more than two strings now, and a dealership's
 *     user wants their own login, not the one shared admin/admin
 *     this whole project started with. Passwords are scrypt-hashed,
 *     never stored or sent back in the clear - see hashPassword()/
 *     verifyPassword(). The admin and Anuj accounts are seeded once,
 *     on first start against an empty table; after that this file
 *     never hard-codes a credential anywhere.
 *   - Writes go straight to Postgres via a direct connection (the
 *     `pg` pool below), calling the exact same import_maker_month()/
 *     import_rto_month() functions Supabase's copy calls - see
 *     local/init/15-import-functions.sql, copied from the migration
 *     that created them. The Supabase version goes through
 *     supabase-js's .rpc() instead, over PostgREST with a service-
 *     role key; the SQL on the other end is identical either way.
 *
 * Usage:  npm install        (once)
 *         node server.js
 *
 * Needs docker-compose's db service already running (docker compose
 * up -d from the repo root) - this connects to it on localhost:5433,
 * not through PostgREST, so it can call functions PostgREST's anon
 * role is never granted.
 */

import crypto from "crypto";
import fs from "fs";
import http from "http";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

import { readSheet } from "../../supabase/functions/import-workbook/xlsx-reader.js";
import {
    describeFile, validateWorkbook, normalizeRtoCode,
    looksLikeBulkWorkbook, validateBulkWorkbook
} from "../../supabase/functions/import-workbook/validate.js";

const { Pool } = pg;

const HERE = path.dirname(fileURLToPath(import.meta.url));

/*
 * A hand-rolled .env reader rather than a dependency - three lines,
 * KEY=VALUE, one per line, same shape as every other .env in this
 * repo. Values already in the real environment win, so a deploy that
 * sets these properly is never silently overridden by a stray file.
 */
function loadEnvFile(file) {

    if (!fs.existsSync(file)) {
        return;
    }

    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {

        const trimmed = line.trim();

        if (trimmed === "" || trimmed.startsWith("#")) {
            continue;
        }

        const at = trimmed.indexOf("=");

        if (at === -1) {
            continue;
        }

        const key = trimmed.slice(0, at).trim();
        const value = trimmed.slice(at + 1).trim();

        if (!(key in process.env)) {
            process.env[key] = value;
        }
    }
}

loadEnvFile(path.join(HERE, ".env"));

const PORT = Number(process.env.PORT || 3005);
const MAX_FILE_BYTES = 15 * 1024 * 1024;

const pool = new Pool({
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT || 5433),
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    database: process.env.PGDATABASE || "vahan"
});


/* ============================================================
   PASSWORDS - scrypt, a random salt per account, timing-safe
   comparison. Node's own crypto module, so this needed no
   dependency beyond pg.
   ============================================================ */

function hashPassword(password) {

    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 64);

    return { hash, salt };
}


function verifyPassword(password, hash, salt) {

    const candidate = crypto.scryptSync(password, salt, 64);

    return candidate.length === hash.length && crypto.timingSafeEqual(candidate, hash);
}


/* ============================================================
   ACCOUNTS - admin and Anuj are the two seed accounts, run once
   against an empty table; every account after that, including
   these two from then on, lives only in Postgres (see
   local/init/25-accounts.sql). Usernames are fixed defaults, but
   passwords are deliberately NEVER a literal in this file - this
   file is committed to a public repo, and a real password string
   here would be a credential leak the moment it's pushed, seed or
   not. Each one comes from this folder's own .env (gitignored, see
   .env.example) instead; if SEED_*_PASSWORD is not set there, a
   random one is generated and printed once below, since first run
   against a brand new database must still produce a working login.
   ============================================================ */

function randomPassword() {
    return crypto.randomBytes(18).toString("base64url");
}

async function ensureSeedAccounts() {

    const { rows } = await pool.query("SELECT count(*)::int AS n FROM accounts");

    if (rows[0].n > 0) {
        return;
    }

    const seeds = [
        {
            username: process.env.SEED_ADMIN_USERNAME || "admin",
            password: process.env.SEED_ADMIN_PASSWORD,
            name: "Admin", dealership: "", canManageUsers: true
        },
        {
            username: process.env.SEED_ANUJ_USERNAME || "Anuj",
            password: process.env.SEED_ANUJ_PASSWORD,
            name: "Anuj", dealership: "", canManageUsers: true
        }
    ];

    for (const seed of seeds) {

        const generated = !seed.password;
        const password = seed.password || randomPassword();
        const { hash, salt } = hashPassword(password);

        await pool.query(
            `INSERT INTO accounts (username, password_hash, password_salt, name, dealership, can_manage_users)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [seed.username, hash, salt, seed.name, seed.dealership, seed.canManageUsers]
        );

        if (generated) {
            console.log(
                `Seeded "${seed.username}" with a generated password (shown once, write it down): ${password}`
            );
        }
    }

    console.log(`Seeded ${seeds.length} account(s): ${seeds.map(s => s.username).join(", ")}`);
}


/*
 * Parses the Basic-auth header and checks it against the accounts
 * table, returning the row (minus the password) on success - every
 * caller needs more than a yes/no now, since mode=create-account
 * needs to know canManageUsers and mode=ping returns the profile.
 */
async function authenticate(authHeader) {

    const match = /^Basic\s+(.+)$/i.exec(authHeader || "");

    if (!match) {
        return null;
    }

    let decoded;

    try {
        decoded = Buffer.from(match[1], "base64").toString("utf8");
    } catch {
        return null;
    }

    const sep = decoded.indexOf(":");

    if (sep === -1) {
        return null;
    }

    const username = decoded.slice(0, sep);
    const password = decoded.slice(sep + 1);

    const { rows } = await pool.query(
        "SELECT * FROM accounts WHERE username = $1",
        [username]
    );

    const account = rows[0];

    if (!account || !verifyPassword(password, account.password_hash, account.password_salt)) {
        return null;
    }

    return {
        username: account.username,
        name: account.name,
        dealership: account.dealership,
        canManageUsers: account.can_manage_users
    };
}


/*
 * Shared by mode=create-account (an existing canManageUsers account
 * adding another login) and mode=signup (anyone, unauthenticated,
 * making their own) - same fields, same rules, same "cannot grant
 * canManageUsers from this form" restriction either way. Only who is
 * allowed to call it differs, and that is checked by each mode's own
 * branch in handle(), not in here.
 */
async function createAccountFromForm(form) {

    const name = String(form.get("name") || "").trim();
    const username = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "");
    const dealership = String(form.get("dealership") || "").trim();

    if (!name || !username || !password) {
        return { status: 400, body: { ok: false, error: "name, username and password are all required" } };
    }

    const { rows: existing } = await pool.query(
        "SELECT 1 FROM accounts WHERE username = $1",
        [username]
    );

    if (existing.length > 0) {
        return { status: 409, body: { ok: false, error: `"${username}" is already in use` } };
    }

    const { hash, salt } = hashPassword(password);

    await pool.query(
        `INSERT INTO accounts (username, password_hash, password_salt, name, dealership, can_manage_users)
         VALUES ($1, $2, $3, $4, $5, false)`,
        [username, hash, salt, name, dealership]
    );

    return {
        status: 200,
        body: { ok: true, account: { username, name, dealership, canManageUsers: false } }
    };
}


/*
 * Edits an existing login in place - name/dealership always, password
 * only if a new one was actually typed (an empty field means "leave
 * it"), username only if it actually changed. A username change
 * cascades: it is the join key dealerships.owner_username and every
 * data table's owner_username use, so renaming "old" to "new" means
 * updating all of those too, not just the accounts row - done in one
 * transaction so a failure partway through can never leave the
 * account renamed but its data still pointing at the old username, or
 * vice versa.
 */
async function updateAccountFromForm(form, actingAccount) {

    const originalUsername = String(form.get("original_username") || "").trim();
    const name = String(form.get("name") || "").trim();
    const newUsername = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "");
    const dealership = String(form.get("dealership") || "").trim();

    if (!originalUsername || !name || !newUsername) {
        return { status: 400, body: { ok: false, error: "name and username are both required" } };
    }

    /*
     * Self-edit needs no special permission (see handle()'s own
     * comment on this mode) - anything else, editing a DIFFERENT
     * account, still needs canManageUsers, same gate create-account/
     * list-accounts already enforce.
     */
    if (originalUsername !== actingAccount.username && !actingAccount.canManageUsers) {
        return { status: 403, body: { ok: false, error: "this account cannot manage other logins" } };
    }

    const { rows: existingRows } = await pool.query(
        "SELECT * FROM accounts WHERE username = $1",
        [originalUsername]
    );

    const existing = existingRows[0];

    if (!existing) {
        return { status: 404, body: { ok: false, error: `"${originalUsername}" does not exist` } };
    }

    const usernameChanging = newUsername !== originalUsername;

    if (usernameChanging) {

        const { rows: clash } = await pool.query(
            "SELECT 1 FROM accounts WHERE username = $1",
            [newUsername]
        );

        if (clash.length > 0) {
            return { status: 409, body: { ok: false, error: `"${newUsername}" is already in use` } };
        }
    }

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        if (password) {

            const { hash, salt } = hashPassword(password);

            await client.query(
                `UPDATE accounts SET name = $1, username = $2, dealership = $3,
                        password_hash = $4, password_salt = $5
                 WHERE username = $6`,
                [name, newUsername, dealership, hash, salt, originalUsername]
            );

        } else {

            await client.query(
                `UPDATE accounts SET name = $1, username = $2, dealership = $3
                 WHERE username = $4`,
                [name, newUsername, dealership, originalUsername]
            );
        }

        if (usernameChanging) {

            await client.query(
                "UPDATE dealerships SET owner_username = $1 WHERE owner_username = $2",
                [newUsername, originalUsername]
            );

            for (const table of ["All_India_Class_Wise", "Gujarat_RTO_Class_Wise", "Maharashtra_RTO_Class_Wise"]) {
                await client.query(
                    `UPDATE "${table}" SET owner_username = $1 WHERE owner_username = $2`,
                    [newUsername, originalUsername]
                );
            }
        }

        await client.query("COMMIT");

        return {
            status: 200,
            body: {
                ok: true,
                account: { username: newUsername, name, dealership, canManageUsers: existing.can_manage_users }
            }
        };

    } catch (error) {

        await client.query("ROLLBACK");
        throw error;

    } finally {
        client.release();
    }
}


/*
 * Admin-only (canManageUsers), and never on your own account - self-
 * delete here could lock the acting admin out mid-request with no way
 * back in short of direct DB access, so it is refused outright rather
 * than handled "carefully". Cascades through the same three places a
 * username rename does (dealerships, dealership_rtos, every data
 * table's owner_username), plus the account row itself, all in one
 * transaction so a failure partway through never leaves orphaned data
 * behind. Returns what was actually removed so the caller can show it.
 */
async function deleteAccountFromForm(form, actingAccount) {

    const username = String(form.get("username") || "").trim();

    if (!username) {
        return { status: 400, body: { ok: false, error: "username is required" } };
    }

    if (!actingAccount.canManageUsers) {
        return { status: 403, body: { ok: false, error: "this account cannot manage other logins" } };
    }

    if (username === actingAccount.username) {
        return { status: 400, body: { ok: false, error: "you cannot delete the account you are logged in as" } };
    }

    const { rows: existingRows } = await pool.query(
        "SELECT 1 FROM accounts WHERE username = $1",
        [username]
    );

    if (existingRows.length === 0) {
        return { status: 404, body: { ok: false, error: `"${username}" does not exist` } };
    }

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        const { rows: dealershipRows } = await client.query(
            "SELECT id FROM dealerships WHERE owner_username = $1",
            [username]
        );

        const dealershipIds = dealershipRows.map(row => row.id);

        if (dealershipIds.length > 0) {
            await client.query(
                "DELETE FROM dealership_rtos WHERE dealership_id = ANY($1::int[])",
                [dealershipIds]
            );
        }

        const { rowCount: dealershipsDeleted } = await client.query(
            "DELETE FROM dealerships WHERE owner_username = $1",
            [username]
        );

        let rowsDeleted = 0;

        for (const table of ["All_India_Class_Wise", "Gujarat_RTO_Class_Wise", "Maharashtra_RTO_Class_Wise"]) {

            const { rowCount } = await client.query(
                `DELETE FROM "${table}" WHERE owner_username = $1`,
                [username]
            );

            rowsDeleted += rowCount;
        }

        await client.query("DELETE FROM accounts WHERE username = $1", [username]);

        await client.query("COMMIT");

        return {
            status: 200,
            body: { ok: true, deleted: { username, dealerships: dealershipsDeleted, dataRows: rowsDeleted } }
        };

    } catch (error) {

        await client.query("ROLLBACK");
        throw error;

    } finally {
        client.release();
    }
}


/*
 * GJ.. / MH.. - the same prefix the real Vahan export's own RTO codes
 * always carry, so a dealership's RTO set can be checked against its
 * own declared scope without needing the scope spelled out a second
 * time per RTO.
 */
const SCOPE_RTO_PREFIX = { gujarat: "GJ", maharashtra: "MH" };


/*
 * owner_username always comes from the authenticated account, not a
 * form field - a dealer can only ever create a dealership for
 * themselves, the same reasoning as createAccountFromForm() never
 * reading a canManageUsers field from its own form.
 *
 * rto_codes is comma-separated ("GJ01, GJ27, GJ38") rather than one
 * rto_code field - the common case is still exactly one, but a
 * combined dealership (several RTOs uploading under one name) needs
 * more than a single text field can hold. dealerships and its RTOs
 * are inserted together in one transaction, so a failure partway
 * through never leaves a dealership with zero RTOs.
 */
async function createDealershipFromForm(form, account) {

    const name = String(form.get("name") || "").trim();
    const maker = String(form.get("maker") || "").trim();
    const scope = String(form.get("scope") || "").trim();
    const rtoCodesRaw = String(form.get("rto_codes") || "").trim();

    /*
     * Defaults true (own business) - the form sends the literal
     * string "false" only when the "this is a competitor" checkbox is
     * ticked (see profile.js), so anything else here, including the
     * field being absent entirely, means "mine".
     */
    const isOwn = String(form.get("is_own") || "").trim().toLowerCase() !== "false";

    if (!name || !maker || !rtoCodesRaw) {
        return { status: 400, body: { ok: false, error: "name, maker and at least one RTO code are all required" } };
    }

    if (scope !== "gujarat" && scope !== "maharashtra") {
        return { status: 400, body: { ok: false, error: 'scope must be "gujarat" or "maharashtra"' } };
    }

    const rtoCodes = [...new Set(
        rtoCodesRaw.split(",").map(code => code.trim().toUpperCase()).filter(Boolean)
    )];

    if (rtoCodes.length === 0) {
        return { status: 400, body: { ok: false, error: "at least one RTO code is required" } };
    }

    const expectedPrefix = SCOPE_RTO_PREFIX[scope];
    const wrongPrefix = rtoCodes.filter(code => !code.startsWith(expectedPrefix));

    if (wrongPrefix.length > 0) {
        return {
            status: 400,
            body: {
                ok: false,
                error: `${wrongPrefix.join(", ")} ${wrongPrefix.length === 1 ? "does" : "do"} not look like ` +
                    `a ${scope} RTO code (expected to start with "${expectedPrefix}")`
            }
        };
    }

    const { rows: existing } = await pool.query(
        "SELECT 1 FROM dealerships WHERE owner_username = $1 AND name = $2",
        [account.username, name]
    );

    if (existing.length > 0) {
        return { status: 409, body: { ok: false, error: `you already have a dealership named "${name}"` } };
    }

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        const { rows } = await client.query(
            `INSERT INTO dealerships (owner_username, name, maker, scope, is_own)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [account.username, name, maker, scope, isOwn]
        );

        const dealershipId = rows[0].id;

        for (const rtoCode of rtoCodes) {
            await client.query(
                "INSERT INTO dealership_rtos (dealership_id, rto_code) VALUES ($1, $2)",
                [dealershipId, rtoCode]
            );
        }

        await client.query("COMMIT");

        return {
            status: 200,
            body: { ok: true, dealership: { id: dealershipId, name, maker, scope, rtoCodes, isOwn } }
        };

    } catch (error) {

        await client.query("ROLLBACK");
        throw error;

    } finally {
        client.release();
    }
}


/* ============================================================
   WRITES - the one place this file differs from index.ts beyond
   requireAuth(): calling the RPCs over a direct pg connection
   instead of supabase-js's .rpc(). Same functions, same SQL.
   ============================================================ */

/*
 * '' is the shared/base dataset every visitor sees - what every
 * import wrote before this column existed, and still what admin/Anuj
 * write today, since they are this project's base-data curators, not
 * dealers. Anyone else's import lands under their own username
 * instead, visible only to them (see script.js's ownerFilterValues())
 * - never something this form could override even if it tried, since
 * it is derived from the authenticated account, not a request field.
 */
function ownerUsernameFor(account) {
    return account.canManageUsers ? "" : account.username;
}


/*
 * A dealership plus the full set of RTOs it covers (dealership_rtos),
 * owned by this account - the one lookup every dealership-aware
 * commit path (single-RTO file or bulk) needs before it can validate
 * anything against it.
 */
async function loadOwnedDealership(id, account) {

    const { rows } = await pool.query(
        `SELECT d.*, array_remove(array_agg(dr.rto_code), NULL) AS rto_codes
         FROM dealerships d
         LEFT JOIN dealership_rtos dr ON dr.dealership_id = d.id
         WHERE d.id = $1 AND d.owner_username = $2
         GROUP BY d.id`,
        [id, account.username]
    );

    return rows[0] || null;
}


/*
 * 0 (no dealership) unless the form names one - and even then, only
 * if it actually belongs to this account and its scope/RTO match what
 * is actually in the file being imported. Without that second check,
 * nothing would stop a dealer from tagging a Surendranagar upload to
 * their Ahmedabad dealership, silently mislabeling where the units
 * came from. A dealership can cover more than one RTO now (see
 * dealership_rtos) - this checks membership in that set, not equality
 * against a single value.
 */
async function resolveDealershipId(form, account, stamp) {

    const raw = String(form.get("dealership_id") || "").trim();

    if (raw === "" || raw === "0") {
        return { ok: true, dealershipId: 0 };
    }

    const id = Number(raw);

    if (!Number.isInteger(id) || id <= 0) {
        return { ok: false, error: "dealership_id must be a positive integer" };
    }

    const dealership = await loadOwnedDealership(id, account);

    if (!dealership) {
        return { ok: false, error: "that dealership does not exist, or is not yours" };
    }

    if (dealership.scope !== stamp.scope) {
        return {
            ok: false,
            error: `"${dealership.name}" is a ${dealership.scope} dealership, but this file is ${stamp.scope}`
        };
    }

    const isMember = dealership.rto_codes.some(
        code => normalizeRtoCode(code) === normalizeRtoCode(stamp.rtoCode)
    );

    if (!isMember) {
        return {
            ok: false,
            error: `"${dealership.name}" is registered for RTO ${dealership.rto_codes.join(", ")}, ` +
                `but this file is for ${stamp.rtoCode}`
        };
    }

    return { ok: true, dealershipId: dealership.id };
}


/*
 * A bulk file has no single stamp to check a dealership against - it
 * can name any mix of RTOs, so the dealership has to be resolved
 * first (required, not optional like the single-RTO path's "0 means
 * no dealership" - there would be no way to know which scope table
 * even to write to otherwise) and then each row's RTO checked against
 * its full set, reported together rather than one at a time.
 */
async function resolveBulkDealership(form, account) {

    const raw = String(form.get("dealership_id") || "").trim();
    const id = Number(raw);

    if (raw === "" || raw === "0" || !Number.isInteger(id) || id <= 0) {
        return { ok: false, error: "a bulk file must be uploaded against one of your own dealerships - pick one in the dialog first" };
    }

    const dealership = await loadOwnedDealership(id, account);

    if (!dealership) {
        return { ok: false, error: "that dealership does not exist, or is not yours" };
    }

    if (dealership.rto_codes.length === 0) {
        return { ok: false, error: `"${dealership.name}" has no RTOs registered against it yet` };
    }

    return { ok: true, dealership };
}


/*
 * Every row in the bulk file against the one dealership's own RTO
 * set, reported as a single list of whatever did not match rather
 * than failing on the first bad row - someone fixing a typo'd RTO
 * code wants to see all of them at once, not one at a time.
 */
function checkBulkRowsAgainstDealership(rows, dealership) {

    const allowed = new Set(dealership.rto_codes.map(normalizeRtoCode));
    const unknown = new Set();

    rows.forEach(entry => {
        if (!allowed.has(normalizeRtoCode(entry.rtoCode))) {
            unknown.add(entry.rtoCode);
        }
    });

    if (unknown.size === 0) {
        return { ok: true };
    }

    return {
        ok: false,
        error: `"${dealership.name}" is not registered for RTO ${[...unknown].join(", ")} - ` +
            `it covers ${dealership.rto_codes.join(", ")}. Add the missing RTO(s) to this dealership ` +
            `in Profile, or fix the file, before importing.`
    };
}


/*
 * Looked up from whatever base data already exists for that RTO
 * (admin/Anuj's industry-wide import already carries real RTO names
 * for almost every code) - a bulk file only ever states a code, never
 * a name, and import_rto_month() requires a non-empty one. Falling
 * back to the code itself when nothing is found yet keeps this
 * working for a genuinely new RTO rather than blocking the import.
 */
async function resolveRtoName(scope, rtoCode) {

    const table = scope === "gujarat" ? "Gujarat_RTO_Class_Wise" : "Maharashtra_RTO_Class_Wise";

    const { rows } = await pool.query(
        `SELECT rto_name FROM "${table}" ` +
            `WHERE rto_code = $1 AND rto_name IS NOT NULL AND rto_name <> '' LIMIT 1`,
        [rtoCode]
    );

    return rows[0] ? rows[0].rto_name : rtoCode;
}


/*
 * One import_rto_month() call per (rtoCode, month, year) group in the
 * file - exactly what uploading that many separate single-RTO files
 * one at a time would have produced, just driven from one sheet
 * instead. Returns the array of each call's own write result, in the
 * same group order, rather than one combined object - the number of
 * groups is not fixed the way a single-RTO import's "one write" is.
 */
async function writeBulkImport(scope, groupedRows, ownerUsername, dealershipId) {

    const writes = [];

    for (const [key, group] of groupedRows) {

        const [rtoCode, month, yearText] = key.split("::");
        const year = Number(yearText);
        const rtoName = await resolveRtoName(scope, rtoCode);

        const { rows } = await pool.query(
            "SELECT import_rto_month($1, $2, $3, $4, $5, $6, $7, $8) AS result",
            [
                scope, rtoCode, rtoName, month, year,
                JSON.stringify(group.map(entry => entry.row)),
                ownerUsername, dealershipId
            ]
        );

        writes.push(rows[0].result);
    }

    return writes;
}


/*
 * 0 is "not tied to one of the account's named dealerships" - every
 * admin/Anuj import (ownerUsername is always '' for them), and any
 * dealer's import before they had created one yet. Only import_rto_
 * month() takes this - All India has no RTO, and a dealership is
 * always RTO-scoped (see dealerships.scope's CHECK).
 */
async function writeImport(stamp, result, ownerUsername, dealershipId = 0) {

    if (stamp.scope === "all_india") {

        const { rows } = await pool.query(
            "SELECT import_maker_month($1, $2, $3, $4) AS result",
            [stamp.month, stamp.year, JSON.stringify(result.rows), ownerUsername]
        );

        return rows[0].result;
    }

    const { rows } = await pool.query(
        "SELECT import_rto_month($1, $2, $3, $4, $5, $6, $7, $8) AS result",
        [
            stamp.scope,
            stamp.rtoCode,
            result.rtoName,
            stamp.month,
            stamp.year,
            JSON.stringify(result.rows),
            ownerUsername,
            dealershipId
        ]
    );

    return rows[0].result;
}


/* ============================================================
   REPORT SHAPE - matches buildReport() in index.ts exactly, so the
   dashboard's preview screen renders either backend's response the
   same way.
   ============================================================ */

function sample(list, limit = 20) {
    return {
        shown: list.slice(0, limit),
        omitted: Math.max(0, list.length - limit)
    };
}


function buildReport(fileName, stamp, result) {

    return {
        fileName,
        scope: stamp.scope,
        rtoCode: stamp.rtoCode,
        rtoName: result.rtoName,
        month: stamp.month,
        year: stamp.year,
        partialMonth: result.endDay !== null && result.endDay < 28,
        coverageEndDay: result.endDay,
        rowCount: result.rows.length,
        blankRowsSkipped: result.blanks,
        units: result.units,
        structuralProblems: result.structural,
        sumMismatches: sample(result.sumMismatches, 20)
    };
}


async function processFile(fileName, bytes, ownerUsername) {

    if (bytes.length === 0) {
        return { fileName, ok: false, error: "file is empty" };
    }

    if (bytes.length > MAX_FILE_BYTES) {
        return {
            fileName,
            ok: false,
            error: `file is ${(bytes.length / 1024 / 1024).toFixed(1)} MB, ` +
                `over the ${MAX_FILE_BYTES / 1024 / 1024} MB limit`
        };
    }

    const stamp = describeFile(fileName);

    if (stamp === null) {
        return { fileName, ok: false, error: "does not look like a Vahan monthly export" };
    }

    let sheet;

    try {
        sheet = await readSheet(bytes, fileName);
    } catch (error) {
        return { fileName, ok: false, error: `could not be read as an Excel workbook: ${error.message}` };
    }

    const result = validateWorkbook(fileName, stamp, sheet);

    if (result.fatal !== null) {
        return { fileName, ok: false, error: result.fatal };
    }

    if (result.structural.length > 0) {
        return {
            fileName,
            ok: false,
            error: `${result.structural.length} structural problem(s)`,
            structural: result.structural
        };
    }

    try {

        const write = await writeImport(stamp, result, ownerUsername);

        return { fileName, ok: true, write };

    } catch (error) {
        return { fileName, ok: false, error: `database rejected the import: ${error.message}` };
    }
}


function json(res, status, body) {

    const payload = JSON.stringify(body);

    res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    });

    res.end(payload);
}


async function handle(req, res) {

    if (req.method === "OPTIONS") {

        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers":
                req.headers["access-control-request-headers"] || "content-type, authorization"
        });

        res.end();
        return;
    }

    if (req.method !== "POST") {
        json(res, 405, { ok: false, error: "use POST" });
        return;
    }

    /*
     * Built from the raw request the same way index.ts's
     * req.formData() is - Node's own fetch implementation (undici)
     * parses multipart/form-data from a Request exactly like a
     * browser or Deno would, so this is not a second, hand-rolled
     * multipart parser to keep in sync with anything.
     */
    const chunks = [];

    for await (const chunk of req) {
        chunks.push(chunk);
    }

    const body = Buffer.concat(chunks);

    const webRequest = new Request("http://local/import-workbook", {
        method: "POST",
        headers: { "content-type": req.headers["content-type"] || "" },
        body
    });

    let form;

    try {
        form = await webRequest.formData();
    } catch (error) {
        json(res, 400, { ok: false, error: `could not read upload: ${error.message}` });
        return;
    }

    const mode = String(form.get("mode") || "preview");

    /*
     * The one mode with no account behind it yet - a dealer making
     * their own login, not an existing canManageUsers account adding
     * one for them. Handled before authenticate() runs at all, since
     * there is no credential to check; createAccountFromForm() always
     * sets canManageUsers = false regardless of who calls it, so this
     * can never be used to self-grant it.
     */
    if (mode === "signup") {

        const result = await createAccountFromForm(form);

        json(res, result.status, { mode: "signup", ...result.body });
        return;
    }

    const account = await authenticate(req.headers.authorization);

    if (!account) {
        json(res, 401, { ok: false, error: "not authorized" });
        return;
    }

    if (mode === "ping") {
        json(res, 200, { ok: true, mode: "ping", account });
        return;
    }

    /*
     * update-account is the one mode here any account can call, not
     * only ones with canManageUsers - editing your own name/username/
     * password/dealership needs no special permission, the same
     * reasoning as dealerships never needing one. It is still gated
     * for anyone ELSE's account: self-edit is allowed by original_
     * username matching the authenticated account, everything else
     * still requires canManageUsers, checked inside
     * updateAccountFromForm() itself (not here), so that check sees
     * the one field the request actually names.
     */
    if (mode === "update-account") {

        const result = await updateAccountFromForm(form, account);

        json(res, result.status, { mode: "update-account", ...result.body });
        return;
    }

    /*
     * Admin-only (checked inside deleteAccountFromForm() itself, same
     * reasoning as update-account's own comment above) - the one mode
     * that can never be a self-edit, so unlike update-account there is
     * no "self needs no special permission" branch here at all.
     */
    if (mode === "delete-account") {

        const result = await deleteAccountFromForm(form, account);

        json(res, result.status, { mode: "delete-account", ...result.body });
        return;
    }

    if (mode === "list-accounts" || mode === "create-account") {

        if (!account.canManageUsers) {
            json(res, 403, { ok: false, error: "this account cannot manage logins" });
            return;
        }

        if (mode === "list-accounts") {

            const { rows } = await pool.query(
                `SELECT username, name, dealership, can_manage_users
                 FROM accounts ORDER BY created_at`
            );

            json(res, 200, {
                ok: true,
                mode: "list-accounts",
                accounts: rows.map(row => ({
                    username: row.username,
                    name: row.name,
                    dealership: row.dealership,
                    canManageUsers: row.can_manage_users
                }))
            });

            return;
        }

        /* mode === "create-account" */

        const result = await createAccountFromForm(form);

        json(res, result.status, { mode: "create-account", ...result.body });
        return;
    }

    /*
     * Unlike accounts, these need no canManageUsers check - every
     * account manages its own dealerships, never anyone else's
     * (owner_username is always the authenticated account, taken from
     * the request, not a form field - see createDealershipFromForm()).
     */
    if (mode === "list-dealerships" || mode === "create-dealership") {

        if (mode === "list-dealerships") {

            const { rows } = await pool.query(
                `SELECT d.id, d.name, d.maker, d.scope, d.is_own,
                        array_remove(array_agg(dr.rto_code ORDER BY dr.rto_code), NULL) AS rto_codes
                 FROM dealerships d
                 LEFT JOIN dealership_rtos dr ON dr.dealership_id = d.id
                 WHERE d.owner_username = $1
                 GROUP BY d.id
                 ORDER BY d.created_at`,
                [account.username]
            );

            json(res, 200, {
                ok: true,
                mode: "list-dealerships",
                dealerships: rows.map(row => ({
                    id: row.id,
                    name: row.name,
                    maker: row.maker,
                    scope: row.scope,
                    rtoCodes: row.rto_codes,
                    isOwn: row.is_own
                }))
            });

            return;
        }

        /* mode === "create-dealership" */

        const result = await createDealershipFromForm(form, account);

        json(res, result.status, { mode: "create-dealership", ...result.body });
        return;
    }

    if (mode === "bulk") {

        const files = form.getAll("file").filter(entry => entry instanceof File);

        if (files.length === 0) {
            json(res, 400, { ok: false, error: "no files uploaded" });
            return;
        }

        const results = [];
        const ownerUsername = ownerUsernameFor(account);

        for (const file of files) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            results.push(await processFile(file.name, bytes, ownerUsername));
        }

        json(res, 200, { ok: true, mode: "bulk", results });
        return;
    }

    if (mode !== "preview" && mode !== "commit") {
        json(res, 400, {
            ok: false,
            error: `mode must be "preview", "commit", "bulk", "ping", "signup", "list-accounts", ` +
                `"create-account", "update-account", "list-dealerships", or "create-dealership"`
        });
        return;
    }

    const file = form.get("file");

    if (!(file instanceof File)) {
        json(res, 400, { ok: false, error: "no file uploaded" });
        return;
    }

    if (file.size === 0) {
        json(res, 400, { ok: false, error: "uploaded file is empty" });
        return;
    }

    if (file.size > MAX_FILE_BYTES) {
        json(res, 400, {
            ok: false,
            error: `file is ${(file.size / 1024 / 1024).toFixed(1)} MB, ` +
                `over the ${MAX_FILE_BYTES / 1024 / 1024} MB limit`
        });
        return;
    }

    const fileName = file.name;

    /*
     * Read the sheet before deciding anything from the filename - a
     * bulk file is recognised by its header, not a naming convention
     * (see looksLikeBulkWorkbook()'s own comment for why), so that has
     * to be checked before describeFile() gets a chance to reject it
     * for not looking like a real Vahan export.
     */
    let sheet;

    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        sheet = await readSheet(bytes, fileName);
    } catch (error) {
        json(res, 422, { ok: false, error: `"${fileName}" could not be read as an Excel workbook: ${error.message}` });
        return;
    }

    if (looksLikeBulkWorkbook(sheet)) {
        await handleBulkCommit(res, mode, fileName, sheet, form, account);
        return;
    }

    const stamp = describeFile(fileName);

    if (stamp === null) {
        json(res, 422, {
            ok: false,
            error: `"${fileName}" does not look like a Vahan monthly export. ` +
                `Expected a name like maker_vehicleClass_All RTO_Apr24.xlsx, ` +
                `maker_vehicleClass_GJ01_Apr24.xlsx, or maker_vehicleClass_MH01_Apr24.xlsx.`
        });
        return;
    }

    const result = validateWorkbook(fileName, stamp, sheet);

    if (result.fatal !== null) {
        json(res, 422, { ok: false, error: `"${fileName}": ${result.fatal}` });
        return;
    }

    const report = buildReport(fileName, stamp, result);

    if (result.structural.length > 0) {
        json(res, 422, {
            ok: false,
            error: `"${fileName}" has ${result.structural.length} problem(s) that block importing it`,
            report
        });
        return;
    }

    if (mode === "preview") {
        json(res, 200, { ok: true, mode: "preview", report });
        return;
    }

    /* mode === "commit" - only now does anything touch the database. */

    const dealershipResolution = await resolveDealershipId(form, account, stamp);

    if (!dealershipResolution.ok) {
        json(res, 400, { ok: false, error: dealershipResolution.error, report });
        return;
    }

    try {

        const write = await writeImport(
            stamp,
            result,
            ownerUsernameFor(account),
            dealershipResolution.dealershipId
        );

        json(res, 200, { ok: true, mode: "commit", report, write });

    } catch (error) {
        json(res, 502, { ok: false, error: `database rejected the import: ${error.message}`, report });
    }
}


/*
 * report.bulk = true is renderImportReport()'s/runImportCommit()'s
 * cue to use a plural summary (N RTOs x M months) instead of the
 * single-RTO report's one month/year/RTO. groupCount is deliberately
 * the number of distinct (rto, month, year) groups, not the row
 * count - "40 rows" and "4 RTOs x 10 months" describe the same file
 * very differently to someone reading the preview.
 */
function buildBulkReport(fileName, result, dealership) {

    const groupKeys = new Set(result.rows.map(entry => `${entry.rtoCode}::${entry.month}::${entry.year}`));

    return {
        fileName,
        bulk: true,
        dealershipName: dealership ? dealership.name : null,
        groupCount: groupKeys.size,
        rowCount: result.rows.length,
        blankRowsSkipped: result.blanks,
        units: result.units,
        structuralProblems: result.structural,
        sumMismatches: sample(result.sumMismatches, 20)
    };
}


/*
 * Shared between preview and commit: both need the file validated and
 * the dealership resolved + every row checked against its RTO set
 * before either can do anything useful - preview to report it
 * accurately, commit to actually write. Only commit goes on to touch
 * the database.
 */
async function handleBulkCommit(res, mode, fileName, sheet, form, account) {

    const result = validateBulkWorkbook(fileName, sheet);

    if (result.fatal !== null) {
        json(res, 422, { ok: false, error: `"${fileName}": ${result.fatal}` });
        return;
    }

    const dealershipResolution = await resolveBulkDealership(form, account);

    if (!dealershipResolution.ok) {
        json(res, 400, { ok: false, error: dealershipResolution.error });
        return;
    }

    const { dealership } = dealershipResolution;

    const report = buildBulkReport(fileName, result, dealership);

    if (result.structural.length > 0) {
        json(res, 422, {
            ok: false,
            error: `"${fileName}" has ${result.structural.length} problem(s) that block importing it`,
            report
        });
        return;
    }

    const membershipCheck = checkBulkRowsAgainstDealership(result.rows, dealership);

    if (!membershipCheck.ok) {
        json(res, 400, { ok: false, error: membershipCheck.error, report });
        return;
    }

    if (mode === "preview") {
        json(res, 200, { ok: true, mode: "preview", report });
        return;
    }

    /* mode === "commit" - only now does anything touch the database. */

    const grouped = new Map();

    result.rows.forEach(entry => {

        const key = `${entry.rtoCode}::${entry.month}::${entry.year}`;
        const list = grouped.get(key) || [];

        list.push(entry);
        grouped.set(key, list);
    });

    try {

        const write = await writeBulkImport(
            dealership.scope,
            grouped,
            ownerUsernameFor(account),
            dealership.id
        );

        json(res, 200, { ok: true, mode: "commit", report, write });

    } catch (error) {
        json(res, 502, { ok: false, error: `database rejected the import: ${error.message}`, report });
    }
}


const server = http.createServer((req, res) => {
    handle(req, res).catch(error => {
        console.error("Unexpected error:", error);
        json(res, 500, { ok: false, error: `unexpected error: ${error.message}` });
    });
});

try {

    await ensureSeedAccounts();

    server.listen(PORT, () => {
        console.log(`Local import-workbook stand-in listening on http://localhost:${PORT}`);
    });

} catch (error) {
    console.error("Could not start - is docker compose up -d running?", error.message);
    process.exitCode = 1;
}
