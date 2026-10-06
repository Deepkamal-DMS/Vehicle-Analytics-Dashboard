/*
 * Rebuilds the three live tables locally, straight from the raw
 * Vahan workbooks already on disk - no Supabase involved. Reuses the
 * exact same parsing/validation the Edge Function runs
 * (supabase/functions/import-workbook/{xlsx-reader,validate,class-columns}.js
 * are plain ESM with no Deno-specific API, so they import unchanged
 * here), so a file that would pass/fail the real Import dialog
 * passes/fails here the same way.
 *
 * describeFile() reads scope/rtoCode/month/year from the FILENAME
 * alone, not its folder - so rather than hand-mapping each source
 * folder's own layout, every .xlsx under the three real source roots
 * is walked and handed to describeFile(); anything that does not
 * match (the MH_20..26 statewide-aggregate files, Excel lock files,
 * stray non-Vahan files) naturally returns null and is skipped. This
 * is also why Vahan New/ - an older, smaller, superseded export of
 * the same data - is left out of SOURCE_ROOTS entirely rather than
 * filtered file-by-file: importing it too would just produce
 * duplicate (year, month, [rto_code,] Maker) keys fighting the newer
 * files for the same primary key.
 *
 * Usage:  node tools/local-rebuild.mjs
 * Writes: local/data/All_India_Class_Wise.csv
 *         local/data/Gujarat_RTO_Class_Wise.csv
 *         local/data/Maharashtra_RTO_Class_Wise.csv
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { readSheet } from "../supabase/functions/import-workbook/xlsx-reader.js";
import { describeFile, validateWorkbook } from "../supabase/functions/import-workbook/validate.js";
import { CLASS_COLUMNS, ENTITY_COLUMN, TOTAL_COLUMN } from "../supabase/functions/import-workbook/class-columns.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(REPO_ROOT, "local", "data");

const SOURCE_ROOTS = [
    path.join(REPO_ROOT, "RTO Vehicle Maker"),
    path.join(REPO_ROOT, "MH", "maker_vehicleClass_MH_All RTO"),
    path.join(REPO_ROOT, "maker_vehicleClass_All RTO")
];


function walkXlsxFiles(root) {

    if (!fs.existsSync(root)) {
        return [];
    }

    const out = [];

    for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {

        if (!entry.isFile()) {
            continue;
        }

        if (!entry.name.endsWith(".xlsx") || entry.name.startsWith("~$")) {
            continue;
        }

        out.push(path.join(entry.parentPath ?? entry.path, entry.name));
    }

    return out;
}


function csvCell(value) {

    if (value === null || value === undefined) {
        return "";
    }

    const text = String(value);

    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}


function csvLine(cells) {
    return cells.map(csvCell).join(",");
}


async function main() {

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const files = SOURCE_ROOTS.flatMap(walkXlsxFiles);

    console.log(`Found ${files.length} .xlsx files under the 3 source roots.`);

    const buckets = {
        all_india: [],
        gujarat: [],
        maharashtra: []
    };

    const failures = [];
    let processed = 0;
    let totalRows = 0;
    let totalUnits = 0;

    for (const filePath of files) {

        const fileName = path.basename(filePath);
        const stamp = describeFile(fileName);

        if (stamp === null) {
            continue;
        }

        let result;

        try {

            const bytes = new Uint8Array(fs.readFileSync(filePath));
            const sheet = await readSheet(bytes, fileName);

            result = validateWorkbook(fileName, stamp, sheet);

        } catch (error) {
            failures.push({ fileName, reason: error.message });
            continue;
        }

        if (result.fatal !== null) {
            failures.push({ fileName, reason: result.fatal });
            continue;
        }

        if (result.structural.length > 0) {
            failures.push({ fileName, reason: `${result.structural.length} structural problem(s): ${result.structural[0]}` });
            continue;
        }

        for (const row of result.rows) {

            buckets[stamp.scope].push({
                year: stamp.year,
                month: stamp.month,
                rtoCode: stamp.rtoCode,
                rtoName: result.rtoName,
                maker: row[ENTITY_COLUMN],
                classes: row,
                total: row[TOTAL_COLUMN]
            });
        }

        totalRows += result.rows.length;
        totalUnits += result.units;
        processed += 1;

        if (processed % 500 === 0) {
            console.log(`  ...${processed}/${files.length} files parsed`);
        }
    }

    console.log(`\nParsed ${processed} files, ${failures.length} failed.`);
    console.log(`${totalRows} rows total, ${totalUnits.toLocaleString("en-IN")} units.`);

    if (failures.length > 0) {

        const failOut = path.join(OUT_DIR, "rebuild-failures.json");

        fs.writeFileSync(failOut, JSON.stringify(failures, null, 2), "utf8");
        console.log(`Failures written to ${failOut} (first 10 below):`);

        for (const f of failures.slice(0, 10)) {
            console.log(`  ${f.fileName}: ${f.reason}`);
        }
    }

    const tables = [
        { key: "all_india", table: "All_India_Class_Wise", hasRto: false },
        { key: "gujarat", table: "Gujarat_RTO_Class_Wise", hasRto: true },
        { key: "maharashtra", table: "Maharashtra_RTO_Class_Wise", hasRto: true }
    ];

    for (const { key, table, hasRto } of tables) {

        const rows = buckets[key];

        const header = [
            "year", "month",
            ...(hasRto ? ["rto_code", "rto_name"] : []),
            ENTITY_COLUMN,
            ...CLASS_COLUMNS,
            TOTAL_COLUMN
        ];

        const lines = [csvLine(header)];

        for (const row of rows) {

            const cells = [
                row.year,
                row.month,
                ...(hasRto ? [row.rtoCode, row.rtoName] : []),
                row.maker,
                ...CLASS_COLUMNS.map(name => row.classes[name] ?? 0),
                row.total
            ];

            lines.push(csvLine(cells));
        }

        const outFile = path.join(OUT_DIR, `${table}.csv`);

        fs.writeFileSync(outFile, lines.join("\n") + "\n", "utf8");

        console.log(`${table}: ${rows.length} rows -> ${outFile}`);
    }
}

main().catch(error => {
    console.error("FATAL:", error);
    process.exitCode = 1;
});
