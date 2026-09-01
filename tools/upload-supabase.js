/*
 * Applies the locally-verified build to the live Supabase project.
 *
 * ADDITIVE ONLY. It creates the twenty-four new month tables and the
 * views over them, and refuses to emit any statement that would drop
 * or alter an object the live dashboard is currently reading. The
 * twelve Maker_Class_Wise_<Mon> tables and the three monthly_* views
 * are left exactly as they are - the trend views read the former for
 * the All India scope, and the latter keep the deployed script.js
 * working until a new one ships.
 *
 * The REST API cannot run DDL with any key, so this drives the
 * Management API:
 *
 *     POST https://api.supabase.com/v1/projects/<ref>/database/query
 *
 * The token is read from local/.env and is never written to disk,
 * echoed, or included in an error message.
 *
 * Usage:
 *     node tools/upload-supabase.js --dry-run   build it, send nothing
 *     node tools/upload-supabase.js             apply it
 *     node tools/upload-supabase.js --verify    only re-check
 */

const fs = require("fs");
const path = require("path");


const REPO_ROOT = path.resolve(__dirname, "..");

const PROJECT_REF = "ytgoonducepylslknkag";
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

const CSV_DIR = path.join(REPO_ROOT, "local", "data");
const SCHEMA_FILE = path.join(REPO_ROOT, "local", "init", "10-schema.sql");
const DERIVED_FILE = path.join(REPO_ROOT, "local", "init", "20-derived.sql");

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/*
 * The two families that do not exist on the project yet. The All
 * India family is deliberately absent: those tables are already
 * there, already hold these exact rows, and dropping them to swap
 * in nullable copies would take the live trend down with them.
 */
const NEW_PREFIXES = ["Gujarat_Class_Wise_", "Ahmedabad_Class_Wise_"];

/* Anything the live dashboard reads. Touching these is a bug. */
const PROTECTED = new Set([
    ...MONTHS.map(month => `Maker_Class_Wise_${month}`),
    "MAKER_WISE",
    "Gujarat_Class_Wise",
    "Maker_Class_Wise_GJ01",
    "Maker_Class_Wise_GJ13",
    "Maker_Class_Wise_GJ27",
    "Maker_Class_Wise_GJ38",
    "monthly_by_maker",
    "monthly_totals",
    "monthly_makers"
]);

const NEW_VIEWS = [
    "_month_all_india",
    "_month_gujarat",
    "_month_ahmedabad",
    "Ahmedabad_Class_Wise",
    "trend_by_maker",
    "trend_totals",
    "trend_makers"
];

const ROWS_PER_BATCH = 300;


const dryRun = process.argv.includes("--dry-run");
const verifyOnly = process.argv.includes("--verify");


function readToken() {

    const file = path.join(REPO_ROOT, "local", ".env");

    if (!fs.existsSync(file)) {
        throw new Error("local/.env is missing");
    }

    const match = /^SUPABASE_ACCESS_TOKEN=(.+)$/m.exec(
        fs.readFileSync(file, "utf8")
    );

    if (match === null || match[1].trim() === "") {
        throw new Error("local/.env has no SUPABASE_ACCESS_TOKEN");
    }

    return match[1].trim();
}


const token = verifyOnly || !dryRun ? readToken() : null;


async function run(sql, label) {

    if (dryRun) {
        console.log(`    [dry run] ${label} (${sql.length} bytes)`);
        return null;
    }

    const response = await fetch(API, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ query: sql })
    });

    const text = await response.text();

    if (!response.ok) {
        /* The token must never reach a log, so only the body is shown. */
        throw new Error(`${label}: HTTP ${response.status} ${text}`);
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        return text;
    }
}


/*
 * A generated schema file is one block per table: CREATE TABLE,
 * ALTER .. ENABLE ROW LEVEL SECURITY, GRANT, CREATE POLICY. Split on
 * the CREATE TABLE marker and keep the blocks we asked for.
 */
function tableBlocks(file, prefixes) {

    const text = fs.readFileSync(file, "utf8");
    const chunks = text.split(/(?=CREATE TABLE ")/g).slice(1);

    const blocks = [];

    for (const chunk of chunks) {

        const name = /^CREATE TABLE "([^"]+)"/.exec(chunk)[1];

        if (PROTECTED.has(name)) {
            continue;
        }

        if (!prefixes.some(prefix => name.startsWith(prefix))) {
            continue;
        }

        blocks.push({ name, sql: chunk.trim() });
    }

    return blocks;
}


function splitCsvLine(line) {

    const cells = [];
    let cell = "";
    let quoted = false;

    for (let at = 0; at < line.length; at += 1) {

        const character = line[at];

        if (quoted) {

            if (character === '"' && line[at + 1] === '"') {
                cell += '"';
                at += 1;
            } else if (character === '"') {
                quoted = false;
            } else {
                cell += character;
            }

        } else if (character === '"') {
            quoted = true;
        } else if (character === ",") {
            cells.push(cell);
            cell = "";
        } else {
            cell += character;
        }
    }

    cells.push(cell);

    return cells;
}


function literal(value) {

    /* An empty CSV field is an absent class, which is NULL. */
    if (value === "") {
        return "NULL";
    }

    if (/^-?\d+$/.test(value)) {
        return value;
    }

    return `'${value.replace(/'/g, "''")}'`;
}


function insertBatches(table) {

    const lines = fs
        .readFileSync(path.join(CSV_DIR, `${table}.csv`), "utf8")
        .split("\n")
        .filter(line => line.trim() !== "");

    const columns = splitCsvLine(lines[0])
        .map(name => `"${name.replace(/"/g, '""')}"`)
        .join(", ");

    const batches = [];

    for (let at = 1; at < lines.length; at += ROWS_PER_BATCH) {

        const values = lines
            .slice(at, at + ROWS_PER_BATCH)
            .map(line => `(${splitCsvLine(line).map(literal).join(",")})`);

        batches.push(
            `INSERT INTO "${table}" (${columns}) VALUES\n` +
            values.join(",\n") + ";"
        );
    }

    return { batches, rows: lines.length - 1 };
}


async function verify() {

    const rows = await run(
        `SELECT c.relname AS name, c.relkind AS kind,
                coalesce(pg_size_pretty(pg_total_relation_size(c.oid)),'-') AS size
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
         WHERE c.relkind IN ('r','v')
         ORDER BY c.relkind, c.relname`,
        "list objects"
    );

    const tables = rows.filter(row => row.kind === "r");
    const views = rows.filter(row => row.kind === "v");

    console.log(`\n  ${tables.length} tables, ${views.length} views`);

    const totals = await run(
        `SELECT scope, sum("Total")::bigint AS units, count(*) AS rows
         FROM trend_totals GROUP BY scope ORDER BY scope`,
        "trend_totals"
    );

    console.log("\n  trend_totals:");

    for (const row of totals) {
        console.log(
            `    ${row.scope.padEnd(11)}${String(row.rows).padStart(4)} rows  ` +
            Number(row.units).toLocaleString("en-IN").padStart(14) + " units"
        );
    }

    const size = await run(
        "SELECT pg_size_pretty(pg_database_size(current_database())) AS db",
        "db size"
    );

    console.log(`\n  database: ${size[0].db}`);
}


async function main() {

    if (verifyOnly) {
        await verify();
        return;
    }

    const blocks = tableBlocks(SCHEMA_FILE, NEW_PREFIXES);

    if (blocks.length !== 24) {
        throw new Error(
            `expected 24 new tables, found ${blocks.length} - refusing to run`
        );
    }

    console.log(`==> creating ${blocks.length} tables`);

    for (const block of blocks) {
        await run(block.sql, block.name);
        console.log(`    ${block.name}`);
    }

    console.log("\n==> loading rows");

    let loaded = 0;

    for (const block of blocks) {

        const { batches, rows } = insertBatches(block.name);

        for (let at = 0; at < batches.length; at += 1) {
            await run(batches[at], `${block.name} batch ${at + 1}`);
        }

        loaded += rows;

        console.log(
            `    ${block.name.padEnd(28)}${String(rows).padStart(5)} rows ` +
            `in ${batches.length} batch(es)`
        );
    }

    console.log(`\n    ${loaded} rows loaded`);

    console.log("\n==> creating views");

    const derived = fs.readFileSync(DERIVED_FILE, "utf8");

    for (const name of NEW_VIEWS) {
        if (PROTECTED.has(name)) {
            throw new Error(`${name} is protected - refusing to run`);
        }
    }

    /* Idempotent: only our own new views are dropped, never the live ones. */
    const drops = NEW_VIEWS.slice().reverse()
        .map(name => `DROP VIEW IF EXISTS "${name}" CASCADE;`)
        .join("\n");

    await run(drops + "\n" + derived, "views");

    console.log(`    ${NEW_VIEWS.join(", ")}`);

    console.log("\n==> reloading the PostgREST schema cache");

    await run("NOTIFY pgrst, 'reload schema';", "reload");

    await verify();
}


main().catch(error => {
    console.error(`\nFAILED: ${error.message}`);
    process.exit(1);
});
