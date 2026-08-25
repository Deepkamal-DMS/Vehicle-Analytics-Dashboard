/*
 * Loads the generated month CSVs into Supabase.
 *
 * The REST API cannot run DDL with any key, so this drives the
 * Management API instead:
 *
 *     POST https://api.supabase.com/v1/projects/<ref>/database/query
 *
 * which executes arbitrary SQL as the project owner. That is enough
 * to create the twelve tables and load them in one pass.
 *
 * The token is read from SUPABASE_ACCESS_TOKEN and is never written
 * to disk, echoed, or included in any error message.
 *
 * Usage:
 *     export SUPABASE_ACCESS_TOKEN=sbp_...
 *     node tools/upload.js            load everything
 *     node tools/upload.js --dry-run  build the SQL, send nothing
 *     node tools/upload.js --verify   only re-check what is loaded
 */

const fs = require("fs");
const path = require("path");


const PROJECT_REF = "ytgoonducepylslknkag";
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

const CSV_DIR = path.resolve(__dirname, "..", "RTO", "month-tables");
const SCHEMA_FILE = path.resolve(__dirname, "schema.sql");

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/* Rows and units per (month, year), read off the source workbooks. */
const EXPECTED = {
    Jan: { 2024: [1017, 2247692], 2025: [1118, 2410330], 2026: [1337, 2845950] },
    Feb: { 2024: [1035, 2142722], 2025: [1135, 1997036], 2026: [1370, 2526676] },
    Mar: { 2024: [1070, 2235228], 2025: [1180, 2234620], 2026: [1323, 2820209] },
    Apr: { 2024: [1009, 2303066], 2025: [1141, 2396774], 2026: [1323, 2726020] },
    May: { 2024: [1011, 2191727], 2025: [1137, 2316025], 2026: [1334, 2577662] },
    Jun: { 2024: [984, 1995942], 2025: [1144, 2104460], 2026: [1300, 2603220] },
    Jul: { 2024: [1020, 2148701], 2025: [1181, 2063385], 2026: [1264, 2629503] },
    Aug: { 2024: [1042, 1990151], 2025: [1177, 2067230], 2026: [1178, 1716296] },
    Sep: { 2024: [1044, 1817241], 2025: [1208, 1931023] },
    Oct: { 2024: [1063, 2956390], 2025: [1234, 4170396] },
    Nov: { 2024: [1033, 3354829], 2025: [1277, 3451353] },
    Dec: { 2024: [1084, 1851900], 2025: [1301, 2146863] }
};

const ROWS_PER_BATCH = 400;


const token = process.env.SUPABASE_ACCESS_TOKEN;

const dryRun = process.argv.includes("--dry-run");
const verifyOnly = process.argv.includes("--verify");


/* ============================================================
   TRANSPORT
   ============================================================ */

async function runSql(sql, label) {

    if (dryRun) {
        return { skipped: true, bytes: Buffer.byteLength(sql, "utf8") };
    }

    let response;

    try {

        response = await fetch(API, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ query: sql })
        });

    } catch (error) {
        throw new Error(`${label}: network failure - ${error.message}`);
    }

    const body = await response.text();

    if (!response.ok) {

        let detail = body.slice(0, 400);

        try {
            const parsed = JSON.parse(body);
            detail = parsed.message || parsed.error || detail;
        } catch (ignored) {
            /* non-JSON error body */
        }

        const failure = new Error(`${label}: HTTP ${response.status} - ${detail}`);
        failure.status = response.status;
        failure.detail = detail;
        throw failure;
    }

    if (body.trim() === "") {
        return [];
    }

    try {
        return JSON.parse(body);
    } catch (ignored) {
        return [];
    }
}


/* ============================================================
   CSV
   ============================================================ */

function parseCsv(text) {

    const rows = [];

    let row = [];
    let field = "";
    let quoted = false;
    let at = 0;

    while (at < text.length) {

        const character = text[at];

        if (quoted) {

            if (character === '"') {

                if (text[at + 1] === '"') {
                    field += '"';
                    at += 2;
                    continue;
                }

                quoted = false;
                at += 1;
                continue;
            }

            field += character;
            at += 1;
            continue;
        }

        if (character === '"' && field === "") {
            quoted = true;
            at += 1;
            continue;
        }

        if (character === ",") {
            row.push(field);
            field = "";
            at += 1;
            continue;
        }

        if (character === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
            at += 1;
            continue;
        }

        field += character;
        at += 1;
    }

    if (field !== "" || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows;
}


/* ============================================================
   SQL BUILDING
   ============================================================ */

function quoteIdent(name) {
    return '"' + name.replace(/"/g, '""') + '"';
}


function quoteLiteral(value) {
    return "'" + String(value).replace(/'/g, "''") + "'";
}


function integerOrThrow(value, column, maker) {

    const number = Number(value);

    if (!Number.isInteger(number) || number < 0) {
        throw new Error(
            `${maker}: ${column} is ${JSON.stringify(value)}, ` +
            `expected a non-negative integer`
        );
    }

    return String(number);
}


function buildInsert(table, header, batch) {

    const columns = header.map(quoteIdent).join(", ");

    const tuples = batch.map(row => {

        const maker = row[1];

        const values = row.map((value, index) => {

            if (index === 1) {
                return quoteLiteral(value);
            }

            return integerOrThrow(value, header[index], maker);
        });

        return "(" + values.join(",") + ")";
    });

    return (
        `INSERT INTO ${quoteIdent(table)} (${columns}) VALUES\n` +
        tuples.join(",\n") + ";"
    );
}


/* ============================================================
   STEPS
   ============================================================ */

async function createTables() {

    const sql = fs.readFileSync(SCHEMA_FILE, "utf8");

    process.stdout.write("creating tables ... ");

    try {

        await runSql(sql, "schema.sql");
        console.log(dryRun ? "skipped (dry run)" : "done");
        return;

    } catch (error) {

        if (/already exists/i.test(error.detail || error.message)) {
            console.log("already present, reusing");
            return;
        }

        throw error;
    }
}


async function truncateAll() {

    const tables = MONTHS
        .map(month => quoteIdent(`Maker_Class_Wise_${month}`))
        .join(", ");

    process.stdout.write("clearing tables ... ");

    await runSql(`TRUNCATE TABLE ${tables};`, "truncate");

    console.log(dryRun ? "skipped (dry run)" : "done");
}


async function loadMonth(month) {

    const file = path.join(CSV_DIR, `${month}.csv`);
    const rows = parseCsv(fs.readFileSync(file, "utf8"));

    const header = rows[0];
    const body = rows.slice(1).filter(row => row.length === header.length);

    const table = `Maker_Class_Wise_${month}`;

    let sent = 0;
    let bytes = 0;

    for (let at = 0; at < body.length; at += ROWS_PER_BATCH) {

        const batch = body.slice(at, at + ROWS_PER_BATCH);
        const sql = buildInsert(table, header, batch);

        bytes += Buffer.byteLength(sql, "utf8");

        await runSql(sql, `${table} rows ${at + 1}-${at + batch.length}`);

        sent += batch.length;

        process.stdout.write(
            `\r  ${table.padEnd(24)} ${String(sent).padStart(5)}` +
            `/${body.length} rows`
        );
    }

    console.log("");

    return { rows: sent, bytes };
}


async function verify() {

    const branches = MONTHS.map(month =>
        `SELECT '${month}' AS month, "year", count(*)::int AS rows, ` +
        `sum("Total")::bigint AS units ` +
        `FROM ${quoteIdent(`Maker_Class_Wise_${month}`)} GROUP BY "year"`
    );

    const result = await runSql(
        branches.join("\nUNION ALL\n") + "\nORDER BY 1, 2;",
        "verify"
    );

    if (!Array.isArray(result)) {
        console.log("verification returned no rows");
        return false;
    }

    console.log("");
    console.log("table                    year    rows        units   status");

    let bad = 0;
    let totalRows = 0;
    let totalUnits = 0;
    const seen = new Set();

    for (const row of result) {

        const want = (EXPECTED[row.month] || {})[row.year];

        const rows = Number(row.rows);
        const units = Number(row.units);

        totalRows += rows;
        totalUnits += units;
        seen.add(`${row.month} ${row.year}`);

        const ok = want && want[0] === rows && want[1] === units;

        if (!ok) {
            bad += 1;
        }

        console.log(
            `Maker_Class_Wise_${row.month}`.padEnd(25) +
            String(row.year).padStart(4) +
            String(rows).padStart(8) +
            units.toLocaleString("en-IN").padStart(13) +
            "   " +
            (ok ? "ok" : `MISMATCH want ${want ? want.join(" / ") : "nothing"}`)
        );
    }

    for (const [month, years] of Object.entries(EXPECTED)) {
        for (const year of Object.keys(years)) {
            if (!seen.has(`${month} ${year}`)) {
                console.log(`Maker_Class_Wise_${month} ${year}: MISSING`);
                bad += 1;
            }
        }
    }

    console.log("");
    console.log(
        `${totalRows.toLocaleString("en-IN")} rows, ` +
        `${totalUnits.toLocaleString("en-IN")} units`
    );

    if (totalRows !== 37074) {
        console.log(`expected 37,074 rows`);
        bad += 1;
    }

    if (totalUnits !== 76970620) {
        console.log(`expected 7,69,70,620 units`);
        bad += 1;
    }

    return bad === 0;
}


/*
 * Proves the class columns landed in the right columns: a single
 * mis-mapped column leaves Total intact but changes the sum.
 */
async function reconcile() {

    const branches = MONTHS.map(month => {

        const table = quoteIdent(`Maker_Class_Wise_${month}`);

        return (
            `SELECT '${month}' AS month, count(*)::int AS bad FROM ${table} t ` +
            `WHERE t."Total" IS DISTINCT FROM (` +
            `SELECT coalesce(sum(value::bigint), 0) ` +
            `FROM jsonb_each_text(to_jsonb(t) - 'year' - 'Maker' - 'Total'))`
        );
    });

    const result = await runSql(
        branches.join("\nUNION ALL\n") + "\nORDER BY 1;",
        "reconcile"
    );

    if (!Array.isArray(result)) {
        return false;
    }

    const offenders = result.filter(row => Number(row.bad) > 0);

    if (offenders.length === 0) {
        console.log(
            "row reconciliation: every row's 75 class columns sum to its Total"
        );
        return true;
    }

    for (const row of offenders) {
        console.log(`Maker_Class_Wise_${row.month}: ${row.bad} rows do not sum`);
    }

    return false;
}


async function main() {

    if (!token && !dryRun) {
        console.error(
            "SUPABASE_ACCESS_TOKEN is not set.\n" +
            "Create one at https://supabase.com/dashboard/account/tokens\n" +
            "then:  export SUPABASE_ACCESS_TOKEN=sbp_..."
        );
        process.exitCode = 1;
        return;
    }

    if (verifyOnly) {

        const clean = (await verify()) && (await reconcile());

        if (!clean) {
            process.exitCode = 1;
        }

        return;
    }

    await createTables();
    await truncateAll();

    console.log("");

    let totalRows = 0;
    let totalBytes = 0;

    for (const month of MONTHS) {

        const result = await loadMonth(month);

        totalRows += result.rows;
        totalBytes += result.bytes;
    }

    console.log("");
    console.log(
        `sent ${totalRows.toLocaleString("en-IN")} rows, ` +
        `${(totalBytes / 1024 / 1024).toFixed(1)} MB of SQL`
    );

    if (dryRun) {
        console.log("dry run - nothing was sent");
        return;
    }

    const clean = (await verify()) && (await reconcile());

    if (!clean) {
        console.error("");
        console.error("verification failed");
        process.exitCode = 1;
    }
}


main().catch(error => {
    console.error("");
    console.error(error.message);
    process.exitCode = 1;
});
