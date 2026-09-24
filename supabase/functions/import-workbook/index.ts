/*
 * POST /functions/v1/import-workbook
 *
 * The only way a Maker x Vehicle Class workbook gets from a browser
 * upload into the live database. Two-step by design:
 *
 *   mode=preview  parses and validates the file, writes nothing,
 *                 returns a report for a person to read.
 *   mode=commit   parses and validates the SAME uploaded file again
 *                 from scratch, and only if it still passes, calls
 *                 import_maker_month() to write it.
 *   mode=ping     checks requireAuth() and nothing else - no file
 *                 required. This is what the dashboard's login
 *                 screen calls to confirm a username/password before
 *                 letting the rest of the page load at all; see
 *                 script.js's verifyCredentials().
 *
 * "Again from scratch" matters: commit never trusts a client-supplied
 * summary of what preview found. The browser re-sends the actual
 * file bytes for both calls, so there is nothing to tamper with in
 * between - what gets written is always exactly what this function
 * itself just parsed, not what a client claims it parsed.
 *
 * Every parsing and validation rule is in validate.js and
 * xlsx-reader.js, ported from tools/build-month-tables.js and
 * tools/xlsx-read.js. This file is orchestration only: read the
 * upload, run those checks, and - on commit, once they pass - call
 * the one narrow RPC that is allowed to write.
 *
 * ---------------------------------------------------------------
 * Access control: a single shared username/password, checked by
 * requireAuth() below against IMPORT_ADMIN_USER / IMPORT_ADMIN_PASSWORD
 * (Supabase secrets, set once via `supabase secrets set` - see the
 * README - and never present in this repo). The dashboard's login
 * screen calls this function itself (mode=ping) to check a
 * username/password before letting the page load at all, then sends
 * the same one as an HTTP Basic Authorization header on every
 * preview/commit call - this function is the only place, in either
 * case, that knows whether it was right. Every other card on the
 * dashboard reads straight from Supabase with the publishable key
 * and never reaches this function - the login screen gates seeing
 * the dashboard, not just Import, but it does so by asking this
 * function, since there is nowhere else the real credential lives.
 *
 * This is deliberately not real user auth - there is one shared
 * credential, not individual accounts - which is fine for a single
 * admin and is why the blast radius of getting it wrong stays
 * bounded on top of it:
 *
 *   - This function only ever calls import_maker_month(), never
 *     arbitrary SQL.
 *   - import_maker_month() only accepts one of the 12 literal month
 *     names and only ever touches that one (month, year) pair.
 *   - The publishable key already shipped in script.js cannot call
 *     import_maker_month() itself even by hand-crafting a REST
 *     request - it is granted to service_role only (see the
 *     migration). This function's service-role key is the only key
 *     that can, and it lives in this function's Supabase secrets,
 *     never in any client-visible code.
 *
 * Upgrading to real per-person accounts later (Supabase Auth JWT +
 * an allow-list of emails) means replacing requireAuth()'s body
 * alone - nothing else in this file changes.
 * ---------------------------------------------------------------
 */

import { readSheet } from "./xlsx-reader.js";
import { describeFile, validateWorkbook } from "./validate.js";

const MAX_FILE_BYTES = 15 * 1024 * 1024;

/*
 * Deno.env only exists under Deno. Reading through this indirection
 * (rather than Deno.env.get(...) inline) is what lets handle() below
 * also run under Node in this repo's tests, with no behaviour
 * difference once deployed - Deno is always present there. The
 * process.env fallback is what lets a Node test set IMPORT_ADMIN_USER/
 * IMPORT_ADMIN_PASSWORD and actually exercise requireAuth(), rather
 * than it being unconditionally unreachable outside Deno.
 */
function env(name) {

    if (typeof Deno !== "undefined") {
        return Deno.env.get(name);
    }

    return typeof process !== "undefined" ? process.env[name] : undefined;
}

const ALLOWED_ORIGIN = env("IMPORT_ALLOWED_ORIGIN") || "*";

const ADMIN_USER = env("IMPORT_ADMIN_USER");
const ADMIN_PASSWORD = env("IMPORT_ADMIN_PASSWORD");

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
    };
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });
}


/*
 * `Authorization: Basic base64(user:password)`, checked against the
 * two secrets set on this function. Both secrets missing/unset fails
 * closed (nobody gets in) rather than falling back to the old
 * allow-everyone behaviour - a half-configured deployment should
 * refuse imports, not silently skip the check it was just given.
 */
function requireAuth(req) {

    if (!ADMIN_USER || !ADMIN_PASSWORD) {
        return false;
    }

    const header = req.headers.get("authorization") || "";
    const match = header.match(/^Basic\s+(.+)$/i);

    if (!match) {
        return false;
    }

    let decoded;

    try {
        decoded = atob(match[1]);
    } catch {
        return false;
    }

    const sep = decoded.indexOf(":");

    if (sep === -1) {
        return false;
    }

    const user = decoded.slice(0, sep);
    const password = decoded.slice(sep + 1);

    return user === ADMIN_USER && password === ADMIN_PASSWORD;
}


/* A handful of rows shown in full is a preview; a thousand is a wall
   of text nobody reads before clicking confirm. */
function sample(list, limit = 20) {
    return {
        shown: list.slice(0, limit),
        omitted: Math.max(0, list.length - limit)
    };
}


function buildReport(fileName, stamp, result) {

    return {
        fileName,
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


async function handle(req) {

    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
    }

    if (req.method !== "POST") {
        return json({ ok: false, error: "use POST" }, 405);
    }

    if (!requireAuth(req)) {
        return json({ ok: false, error: "not authorized" }, 401);
    }

    let form;

    try {
        form = await req.formData();
    } catch (error) {
        return json({ ok: false, error: `could not read upload: ${error.message}` }, 400);
    }

    const mode = String(form.get("mode") || "preview");

    /* requireAuth() already ran above - reaching here at all means
       the credential was accepted, so there is nothing left to do. */
    if (mode === "ping") {
        return json({ ok: true, mode: "ping" });
    }

    if (mode !== "preview" && mode !== "commit") {
        return json({ ok: false, error: `mode must be "preview", "commit", or "ping"` }, 400);
    }

    const file = form.get("file");

    if (!(file instanceof File)) {
        return json({ ok: false, error: "no file uploaded" }, 400);
    }

    if (file.size === 0) {
        return json({ ok: false, error: "uploaded file is empty" }, 400);
    }

    if (file.size > MAX_FILE_BYTES) {
        return json({
            ok: false,
            error: `file is ${(file.size / 1024 / 1024).toFixed(1)} MB, ` +
                `over the ${MAX_FILE_BYTES / 1024 / 1024} MB limit`
        }, 400);
    }

    const fileName = file.name;
    const stamp = describeFile(fileName);

    if (stamp === null) {
        return json({
            ok: false,
            error: `"${fileName}" does not look like a Vahan monthly export. ` +
                `Expected a name like maker_vehicleClass_2025_Apr24.xlsx.`
        }, 422);
    }

    let sheet;

    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        sheet = await readSheet(bytes, fileName);
    } catch (error) {
        return json({
            ok: false,
            error: `"${fileName}" could not be read as an Excel workbook: ${error.message}`
        }, 422);
    }

    const result = validateWorkbook(fileName, stamp, sheet);

    if (result.fatal !== null) {
        return json({ ok: false, error: `"${fileName}": ${result.fatal}` }, 422);
    }

    const report = buildReport(fileName, stamp, result);

    if (result.structural.length > 0) {
        return json({
            ok: false,
            error: `"${fileName}" has ${result.structural.length} problem(s) ` +
                `that block importing it`,
            report
        }, 422);
    }

    if (mode === "preview") {
        return json({ ok: true, mode: "preview", report });
    }

    /* mode === "commit" - only now does anything touch the database. */

    const supabaseUrl = env("SUPABASE_URL");
    const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
        return json({
            ok: false,
            error: "server is missing its Supabase service credentials"
        }, 500);
    }

    /*
     * Dynamic and deferred on purpose: "npm:" is a Deno-only import
     * scheme, so a static top-level import of it fails to even load
     * this module under Node - which is how handle() above gets
     * exercised in this repo's tests, all of which stop at mode
     * "preview" and never reach this line.
     */
    const { createClient } = await import("npm:@supabase/supabase-js@2");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false }
    });

    const { data, error } = await supabase.rpc("import_maker_month", {
        p_month: stamp.month,
        p_year: stamp.year,
        p_rows: result.rows
    });

    if (error) {
        return json({
            ok: false,
            error: `database rejected the import: ${error.message}`,
            report
        }, 502);
    }

    return json({
        ok: true,
        mode: "commit",
        report,
        write: data
    });
}


async function serveRequest(req) {

    try {
        return await handle(req);
    } catch (error) {
        return json({ ok: false, error: `unexpected error: ${error.message}` }, 500);
    }
}

/* Only Deno actually serves; Node test scripts import handle/serveRequest directly. */
if (typeof Deno !== "undefined" && typeof Deno.serve === "function") {
    Deno.serve(serveRequest);
}

export { handle, serveRequest };
