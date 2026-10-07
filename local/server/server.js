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
import { describeFile, validateWorkbook } from "../../supabase/functions/import-workbook/validate.js";

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
   ACCOUNTS - the admin and Anuj accounts are hard-coded here only
   as a one-time seed, run once against an empty table; every
   account after that, including these two from then on, lives
   only in Postgres. See local/init/25-accounts.sql.
   ============================================================ */

async function ensureSeedAccounts() {

    const { rows } = await pool.query("SELECT count(*)::int AS n FROM accounts");

    if (rows[0].n > 0) {
        return;
    }

    const seeds = [
        { username: "admin", password: "admin", name: "Admin", dealership: "", canManageUsers: true },
        { username: "Anuj", password: "Deepkamal@ADMIN123", name: "Anuj", dealership: "", canManageUsers: true }
    ];

    for (const seed of seeds) {

        const { hash, salt } = hashPassword(seed.password);

        await pool.query(
            `INSERT INTO accounts (username, password_hash, password_salt, name, dealership, can_manage_users)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [seed.username, hash, salt, seed.name, seed.dealership, seed.canManageUsers]
        );
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


/* ============================================================
   WRITES - the one place this file differs from index.ts beyond
   requireAuth(): calling the RPCs over a direct pg connection
   instead of supabase-js's .rpc(). Same functions, same SQL.
   ============================================================ */

async function writeImport(stamp, result) {

    if (stamp.scope === "all_india") {

        const { rows } = await pool.query(
            "SELECT import_maker_month($1, $2, $3) AS result",
            [stamp.month, stamp.year, JSON.stringify(result.rows)]
        );

        return rows[0].result;
    }

    const { rows } = await pool.query(
        "SELECT import_rto_month($1, $2, $3, $4, $5, $6) AS result",
        [
            stamp.scope,
            stamp.rtoCode,
            result.rtoName,
            stamp.month,
            stamp.year,
            JSON.stringify(result.rows)
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


async function processFile(fileName, bytes) {

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

        const write = await writeImport(stamp, result);

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

    const account = await authenticate(req.headers.authorization);

    if (!account) {
        json(res, 401, { ok: false, error: "not authorized" });
        return;
    }

    if (mode === "ping") {
        json(res, 200, { ok: true, mode: "ping", account });
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

        const name = String(form.get("name") || "").trim();
        const username = String(form.get("username") || "").trim();
        const password = String(form.get("password") || "");
        const dealership = String(form.get("dealership") || "").trim();

        if (!name || !username || !password) {
            json(res, 400, { ok: false, error: "name, username and password are all required" });
            return;
        }

        const { rows: existing } = await pool.query(
            "SELECT 1 FROM accounts WHERE username = $1",
            [username]
        );

        if (existing.length > 0) {
            json(res, 409, { ok: false, error: `"${username}" is already in use` });
            return;
        }

        const { hash, salt } = hashPassword(password);

        /*
         * New accounts cannot themselves create further ones - the
         * form this comes from (see script.js's profile modal) has
         * no field for it, so there is nothing to read here either;
         * granting that is a deliberate step taken directly in
         * Postgres, not something this endpoint exposes.
         */
        await pool.query(
            `INSERT INTO accounts (username, password_hash, password_salt, name, dealership, can_manage_users)
             VALUES ($1, $2, $3, $4, $5, false)`,
            [username, hash, salt, name, dealership]
        );

        json(res, 200, {
            ok: true,
            mode: "create-account",
            account: { username, name, dealership, canManageUsers: false }
        });

        return;
    }

    if (mode === "bulk") {

        const files = form.getAll("file").filter(entry => entry instanceof File);

        if (files.length === 0) {
            json(res, 400, { ok: false, error: "no files uploaded" });
            return;
        }

        const results = [];

        for (const file of files) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            results.push(await processFile(file.name, bytes));
        }

        json(res, 200, { ok: true, mode: "bulk", results });
        return;
    }

    if (mode !== "preview" && mode !== "commit") {
        json(res, 400, {
            ok: false,
            error: `mode must be "preview", "commit", "bulk", "ping", "list-accounts", or "create-account"`
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

    let sheet;

    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        sheet = await readSheet(bytes, fileName);
    } catch (error) {
        json(res, 422, { ok: false, error: `"${fileName}" could not be read as an Excel workbook: ${error.message}` });
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

    try {

        const write = await writeImport(stamp, result);

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
