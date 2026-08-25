/*
 * Collapses the twelve scope x year tables into six, moving the year
 * out of the table name and into a column.
 *
 *     MAKER_WISE_2025 + MAKER_WISE_2026 -> MAKER_WISE
 *     Gujarat_Class_Wise_*              -> Gujarat_Class_Wise
 *     Maker_Class_Wise_GJ01_*           -> Maker_Class_Wise_GJ01
 *     ... GJ13, GJ27, GJ38
 *
 * Vahan drops a class column entirely when it has no registrations,
 * so the two years of a scope rarely have the same columns. The
 * merged table takes the union and writes 0 wherever a year lacked
 * the column - the same rule the month tables use.
 *
 * Everything happens server-side via INSERT ... SELECT; no row data
 * is downloaded or re-uploaded. The originals are left untouched.
 *
 * Usage:
 *     export SUPABASE_ACCESS_TOKEN=sbp_...
 *     node tools/merge-scope-tables.js [--dry-run]
 */

const fs = require("fs");
const path = require("path");


const PROJECT_REF = "ytgoonducepylslknkag";
const MANAGEMENT = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

const REST = `https://${PROJECT_REF}.supabase.co/rest/v1/`;
const ANON = "sb_publishable_9IVGzYTxQDj2UoLOaBtkFw_7H5ILVGY";

const SQL_OUT = path.resolve(__dirname, "merge-scope-tables.sql");

const YEARS = [2025, 2026];

/* target table -> the per-year sources it is built from */
const SCOPES = [
    { target: "MAKER_WISE", prefix: "MAKER_WISE" },
    { target: "Gujarat_Class_Wise", prefix: "Gujarat_Class_Wise" },
    { target: "Maker_Class_Wise_GJ01", prefix: "Maker_Class_Wise_GJ01" },
    { target: "Maker_Class_Wise_GJ13", prefix: "Maker_Class_Wise_GJ13" },
    { target: "Maker_Class_Wise_GJ27", prefix: "Maker_Class_Wise_GJ27" },
    { target: "Maker_Class_Wise_GJ38", prefix: "Maker_Class_Wise_GJ38" }
];

const ENTITY_COLUMN = "Maker";
const TOTAL_COLUMN = "Total";


const token = process.env.SUPABASE_ACCESS_TOKEN;
const dryRun = process.argv.includes("--dry-run");


function quoteIdent(name) {
    return '"' + name.replace(/"/g, '""') + '"';
}


async function runSql(sql, label) {

    const response = await fetch(MANAGEMENT, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ query: sql })
    });

    const body = await response.text();

    if (!response.ok) {

        let detail = body.slice(0, 400);

        try {
            const parsed = JSON.parse(body);
            detail = parsed.message || parsed.error || detail;
        } catch (ignored) {
            /* non-JSON error body */
        }

        throw new Error(`${label}: HTTP ${response.status} - ${detail}`);
    }

    try {
        return JSON.parse(body);
    } catch (ignored) {
        return [];
    }
}


/* Column order comes off the live table, so it is authoritative. */
async function columnsOf(table) {

    const response = await fetch(`${REST}${table}?select=*&limit=1`, {
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }
    });

    if (!response.ok) {
        throw new Error(`${table}: HTTP ${response.status} reading columns`);
    }

    return Object.keys((await response.json())[0]);
}


/*
 * 2026's order first, then whatever only 2025 had, appended. Keeps
 * the merged table lined up with the newer source.
 */
function unionClasses(perYear) {

    const order = [];

    for (const year of [...YEARS].reverse()) {
        for (const column of perYear[year]) {
            if (!order.includes(column)) {
                order.push(column);
            }
        }
    }

    return order;
}


function buildSql(scope, classes, perYear) {

    const target = quoteIdent(scope.target);
    const all = ["year", ENTITY_COLUMN, ...classes, TOTAL_COLUMN];

    const width = Math.max(...all.map(name => quoteIdent(name).length));

    const definitions = all.map(name => {

        const padded = quoteIdent(name).padEnd(width);

        if (name === "year") {
            return `    ${padded} smallint NOT NULL`;
        }

        if (name === ENTITY_COLUMN) {
            return `    ${padded} text     NOT NULL`;
        }

        return `    ${padded} integer  NOT NULL DEFAULT 0`;
    });

    const statements = [
        `DROP TABLE IF EXISTS ${target};`,
        ``,
        `CREATE TABLE ${target} (`,
        definitions.join(",\n") + ",",
        `    PRIMARY KEY (${quoteIdent("year")}, ${quoteIdent(ENTITY_COLUMN)}),`,
        `    CHECK (${quoteIdent("year")} BETWEEN 2000 AND 2100)`,
        `);`,
        ``
    ];

    const columnList = all.map(quoteIdent).join(", ");

    for (const year of YEARS) {

        const source = `${scope.prefix}_${year}`;
        const present = new Set(perYear[year]);

        /*
         * A class the source year never had becomes a literal 0, so
         * every merged row still sums to its Total.
         */
        const projection = [
            String(year),
            quoteIdent(ENTITY_COLUMN),
            ...classes.map(column =>
                present.has(column) ? quoteIdent(column) : "0"),
            quoteIdent(TOTAL_COLUMN)
        ];

        statements.push(
            `INSERT INTO ${target} (${columnList})`,
            `SELECT ${projection.join(", ")}`,
            `FROM ${quoteIdent(source)};`,
            ``
        );
    }

    const policy = quoteIdent(`anon read ${scope.target}`);

    statements.push(
        `ALTER TABLE ${target} ENABLE ROW LEVEL SECURITY;`,
        ``,
        `GRANT SELECT ON TABLE ${target} TO anon, authenticated;`,
        ``,
        `DROP POLICY IF EXISTS ${policy} ON ${target};`,
        ``,
        `CREATE POLICY ${policy} ON ${target}`,
        `    FOR SELECT TO anon, authenticated USING (true);`,
        ``
    );

    return statements.join("\n");
}


async function main() {

    if (!token && !dryRun) {
        console.error("SUPABASE_ACCESS_TOKEN is not set.");
        process.exitCode = 1;
        return;
    }

    console.log("reading column sets from the live tables ...");

    const plans = [];

    for (const scope of SCOPES) {

        const perYear = {};
        const counts = {};

        for (const year of YEARS) {

            const columns = await columnsOf(`${scope.prefix}_${year}`);

            perYear[year] = columns.filter(
                name => name !== ENTITY_COLUMN && name !== TOTAL_COLUMN
            );

            counts[year] = perYear[year].length;
        }

        const classes = unionClasses(perYear);

        plans.push({ scope, classes, perYear });

        console.log(
            `  ${scope.target.padEnd(22)} ` +
            `${counts[2025]} + ${counts[2026]} -> ${classes.length} classes`
        );
    }

    const sql = plans
        .map(plan => buildSql(plan.scope, plan.classes, plan.perYear))
        .join("\n");

    fs.writeFileSync(SQL_OUT, sql, "utf8");

    console.log("");
    console.log(`sql -> ${SQL_OUT} (${Math.round(sql.length / 1024)} KB)`);

    if (dryRun) {
        console.log("dry run - nothing was sent");
        return;
    }

    console.log("");

    for (const plan of plans) {

        process.stdout.write(`  ${plan.scope.target.padEnd(22)} `);

        await runSql(
            buildSql(plan.scope, plan.classes, plan.perYear),
            plan.scope.target
        );

        console.log("built");
    }

    /* ---- verify against the sources ---- */

    const branches = [];

    for (const plan of plans) {

        const target = quoteIdent(plan.scope.target);

        for (const year of YEARS) {

            const source = quoteIdent(`${plan.scope.prefix}_${year}`);

            branches.push(
                `SELECT '${plan.scope.target}' AS tbl, ${year} AS yr, ` +
                `(SELECT count(*) FROM ${target} WHERE "year"=${year})::int AS got_rows, ` +
                `(SELECT count(*) FROM ${source})::int AS want_rows, ` +
                `(SELECT coalesce(sum("Total"),0) FROM ${target} WHERE "year"=${year})::bigint AS got_units, ` +
                `(SELECT coalesce(sum("Total"),0) FROM ${source})::bigint AS want_units`
            );
        }
    }

    const result = await runSql(
        branches.join("\nUNION ALL\n") + "\nORDER BY 1, 2;",
        "verify"
    );

    console.log("");
    console.log("table                   year   rows          units   status");

    let bad = 0;

    for (const row of result) {

        const rowsOk = Number(row.got_rows) === Number(row.want_rows);
        const unitsOk = Number(row.got_units) === Number(row.want_units);

        if (!rowsOk || !unitsOk) {
            bad += 1;
        }

        console.log(
            row.tbl.padEnd(24) +
            String(row.yr).padStart(4) +
            String(row.got_rows).padStart(7) +
            Number(row.got_units).toLocaleString("en-IN").padStart(15) +
            "   " +
            (rowsOk && unitsOk
                ? "ok"
                : `MISMATCH want ${row.want_rows} / ${row.want_units}`)
        );
    }

    /* Every merged row must still sum across its class columns. */
    const reconcile = plans.map(plan =>
        `SELECT '${plan.scope.target}' AS tbl, count(*)::int AS bad ` +
        `FROM ${quoteIdent(plan.scope.target)} t ` +
        `WHERE t."Total" IS DISTINCT FROM (` +
        `SELECT coalesce(sum(value::bigint),0) ` +
        `FROM jsonb_each_text(to_jsonb(t) - 'year' - 'Maker' - 'Total'))`
    );

    const sums = await runSql(
        reconcile.join("\nUNION ALL\n") + "\nORDER BY 1;",
        "reconcile"
    );

    const offenders = sums.filter(row => Number(row.bad) > 0);

    console.log("");

    if (offenders.length === 0) {
        console.log("row reconciliation: every row's class columns sum to its Total");
    } else {
        for (const row of offenders) {
            console.log(`${row.tbl}: ${row.bad} rows do not sum`);
        }
        bad += offenders.length;
    }

    if (bad > 0) {
        console.error("");
        console.error("verification failed - originals are untouched");
        process.exitCode = 1;
    }
}


main().catch(error => {
    console.error("");
    console.error(error.message);
    process.exitCode = 1;
});
