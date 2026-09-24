/*
 * Regenerates class-columns.js in this same directory from
 * tools/class-columns.js. Run this - never hand-edit that file - if
 * the class list ever changes, and also re-run
 * tools/generate-import-migration.js, so the CLI path, the online
 * upload path, and the database function all stay in lockstep.
 *
 * Usage (from the repo root):
 *   node supabase/functions/import-workbook/generate-class-columns.js
 */

const fs = require("fs");
const path = require("path");
const { CLASS_COLUMNS, ENTITY_COLUMN, TOTAL_COLUMN, MONTHS } = require(
    path.resolve("tools", "class-columns.js")
);

const jsonLiteral = value => JSON.stringify(value, null, 4)
    .split("\n")
    .map((line, i) => i === 0 ? line : "    " + line)
    .join("\n");

const js = `/*
 * Generated from tools/class-columns.js by
 * supabase/functions/import-workbook/generate-class-columns.js - do not hand-edit.
 *
 * The Node CLI path (tools/build-month-tables.js) and this Deno Edge
 * Function both validate an uploaded workbook against the exact same
 * 76 class names and order, read from that one file, so an upload
 * and an offline import can never quietly diverge on what a class is
 * called or where it belongs.
 *
 * Plain ESM (no TypeScript syntax) on purpose: Deno imports it as-is,
 * and it is also run directly under Node for testing before anything
 * ships to Supabase.
 */

export const ENTITY_COLUMN = ${JSON.stringify(ENTITY_COLUMN)};
export const TOTAL_COLUMN = ${JSON.stringify(TOTAL_COLUMN)};

export const CLASS_COLUMNS = ${jsonLiteral(CLASS_COLUMNS)};

export const KNOWN_CLASSES = new Set(CLASS_COLUMNS);

export const MONTHS = ${jsonLiteral(MONTHS)};
`;

fs.writeFileSync(
    path.resolve("supabase", "functions", "import-workbook", "class-columns.js"),
    js,
    "utf8"
);
console.log("written");
