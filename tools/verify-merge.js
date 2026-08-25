/*
 * Proves the six merged scope tables carry exactly the data the
 * twelve originals did, before anyone drops the originals.
 *
 * Totals matching is not enough - two columns swapped would leave
 * every total intact. So the main check is a two-way EXCEPT over
 * every column the original had: if both directions return zero
 * rows, the merged table is bit-identical to its source for those
 * columns, row by row and cell by cell.
 *
 * Then, separately, every column the merged table gained from the
 * OTHER year must be 0 for this year - that is the "missing class
 * becomes 0" rule, and it is what keeps Total reconciling.
 *
 * Usage:
 *     export SUPABASE_ACCESS_TOKEN=sbp_...
 *     node tools/verify-merge.js
 *
 * Exit code 0 means it is safe to run drop-old-scope-tables.sql.
 */

const PROJECT_REF = "ytgoonducepylslknkag";
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

const YEARS = [2025, 2026];

const SCOPES = [
    { merged: "MAKER_WISE", prefix: "MAKER_WISE" },
    { merged: "Gujarat_Class_Wise", prefix: "Gujarat_Class_Wise" },
    { merged: "Maker_Class_Wise_GJ01", prefix: "Maker_Class_Wise_GJ01" },
    { merged: "Maker_Class_Wise_GJ13", prefix: "Maker_Class_Wise_GJ13" },
    { merged: "Maker_Class_Wise_GJ27", prefix: "Maker_Class_Wise_GJ27" },
    { merged: "Maker_Class_Wise_GJ38", prefix: "Maker_Class_Wise_GJ38" }
];


const token = process.env.SUPABASE_ACCESS_TOKEN;

const failures = [];
const notes = [];


function quoteIdent(name) {
    return '"' + name.replace(/"/g, '""') + '"';
}


async function runSql(sql, label) {

    const response = await fetch(API, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ query: sql })
    });

    const body = await response.text();

    if (!response.ok) {

        let detail = body.slice(0, 300);

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


async function columnsOf(table) {

    const rows = await runSql(
        `SELECT column_name FROM information_schema.columns ` +
        `WHERE table_schema='public' AND table_name=${"'" + table + "'"} ` +
        `ORDER BY ordinal_position;`,
        `columns of ${table}`
    );

    return rows.map(row => row.column_name);
}


async function main() {

    if (!token) {
        console.error("SUPABASE_ACCESS_TOKEN is not set.");
        process.exitCode = 1;
        return;
    }

    console.log("checking every merged table against its two originals\n");

    for (const scope of SCOPES) {

        const mergedColumns = await columnsOf(scope.merged);

        if (mergedColumns.length === 0) {
            failures.push(`${scope.merged}: does not exist`);
            continue;
        }

        console.log(`${scope.merged}  (${mergedColumns.length} columns)`);

        for (const year of YEARS) {

            const source = `${scope.prefix}_${year}`;
            const sourceColumns = await columnsOf(source);

            if (sourceColumns.length === 0) {
                failures.push(`${source}: does not exist`);
                continue;
            }

            /* Columns the merged table gained from the other year. */
            const gained = mergedColumns.filter(
                column => column !== "year" && !sourceColumns.includes(column)
            );

            const shared = sourceColumns.map(quoteIdent).join(", ");

            const mergedSide =
                `SELECT ${shared} FROM ${quoteIdent(scope.merged)} ` +
                `WHERE "year" = ${year}`;

            const sourceSide = `SELECT ${shared} FROM ${quoteIdent(source)}`;

            const zeroCheck = gained.length === 0
                ? "0"
                : `(SELECT count(*) FROM ${quoteIdent(scope.merged)} ` +
                  `WHERE "year" = ${year} AND (` +
                  gained.map(c => `${quoteIdent(c)} <> 0`).join(" OR ") +
                  `))::int`;

            const [result] = await runSql(
                `SELECT ` +
                `(SELECT count(*) FROM (${sourceSide} EXCEPT ${mergedSide}) a)::int ` +
                `  AS missing_from_merged, ` +
                `(SELECT count(*) FROM (${mergedSide} EXCEPT ${sourceSide}) b)::int ` +
                `  AS extra_in_merged, ` +
                `(SELECT count(*) FROM ${quoteIdent(source)})::int AS source_rows, ` +
                `(SELECT count(*) FROM ${quoteIdent(scope.merged)} ` +
                `   WHERE "year" = ${year})::int AS merged_rows, ` +
                `${zeroCheck} AS gained_nonzero;`,
                `${scope.merged} ${year}`
            );

            const identical =
                Number(result.missing_from_merged) === 0 &&
                Number(result.extra_in_merged) === 0 &&
                Number(result.source_rows) === Number(result.merged_rows);

            const zerosOk = Number(result.gained_nonzero) === 0;

            if (!identical) {
                failures.push(
                    `${scope.merged} ${year}: not identical to ${source} ` +
                    `(missing ${result.missing_from_merged}, ` +
                    `extra ${result.extra_in_merged}, ` +
                    `rows ${result.merged_rows} vs ${result.source_rows})`
                );
            }

            if (!zerosOk) {
                failures.push(
                    `${scope.merged} ${year}: ${result.gained_nonzero} rows have ` +
                    `a non-zero value in a column ${source} never had`
                );
            }

            console.log(
                `  ${year}  vs ${source.padEnd(28)} ` +
                `${String(result.source_rows).padStart(5)} rows, ` +
                `${String(sourceColumns.length - 2).padStart(2)} classes` +
                (gained.length
                    ? `, +${gained.length} filled with 0`
                    : "") +
                `  ${identical && zerosOk ? "IDENTICAL" : "FAILED"}`
            );
        }

        console.log("");
    }

    /* Row-level arithmetic across all six merged tables. */
    const reconcile = SCOPES.map(scope =>
        `SELECT '${scope.merged}' AS tbl, count(*)::int AS bad ` +
        `FROM ${quoteIdent(scope.merged)} t ` +
        `WHERE t."Total" IS DISTINCT FROM (` +
        `SELECT coalesce(sum(value::bigint),0) ` +
        `FROM jsonb_each_text(to_jsonb(t) - 'year' - 'Maker' - 'Total'))`
    );

    const sums = await runSql(
        reconcile.join(" UNION ALL ") + " ORDER BY 1;",
        "reconcile"
    );

    for (const row of sums) {
        if (Number(row.bad) > 0) {
            failures.push(`${row.tbl}: ${row.bad} rows where Total <> sum of classes`);
        }
    }

    console.log(
        failures.length === 0 && sums.every(r => Number(r.bad) === 0)
            ? "row arithmetic: every row in all six tables sums to its Total"
            : "row arithmetic: FAILED"
    );

    /* The dashboard's own read path must still work under the anon key. */
    const anon = "sb_publishable_9IVGzYTxQDj2UoLOaBtkFw_7H5ILVGY";

    for (const scope of SCOPES) {

        const response = await fetch(
            `https://${PROJECT_REF}.supabase.co/rest/v1/${scope.merged}` +
            `?select=year&limit=1`,
            { headers: { apikey: anon, Authorization: `Bearer ${anon}` } }
        );

        if (!response.ok) {
            failures.push(
                `${scope.merged}: anon key cannot read it (HTTP ${response.status})`
            );
        }
    }

    console.log(
        failures.some(f => f.includes("anon key"))
            ? "anon read: FAILED"
            : "anon read: all six readable with the dashboard's key"
    );

    console.log("");

    if (failures.length > 0) {
        console.error(`${failures.length} problem(s) - DO NOT DROP:`);
        for (const failure of failures) {
            console.error(`  ${failure}`);
        }
        process.exitCode = 1;
        return;
    }

    for (const note of notes) {
        console.log(note);
    }

    console.log("VERIFIED - the originals are safe to drop");
}


main().catch(error => {
    console.error("");
    console.error(error.message);
    process.exitCode = 1;
});
