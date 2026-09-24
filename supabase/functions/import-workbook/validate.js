/*
 * Every check here is ported from tools/build-month-tables.js's
 * readWorkbook() - filename pattern, the sheet's own title-row cross
 * check, header shape, known-class columns, duplicate makers, a
 * newline inside a maker name, and the class-columns-sum-to-Total
 * reconciliation. See that file for why each one exists.
 *
 * One deliberate difference from the CLI path: there, an unknown
 * class column, a duplicate maker, or a newline in a maker name is
 * logged as a problem but the file is still loaded around it (the
 * bad column is skipped, the bad row is skipped) - a human watching
 * the console output decides whether that is acceptable before ever
 * running tools/upload.js separately. This upload path has no such
 * second human step between "parsed" and "written to the live
 * database" - so here those three are STRUCTURAL problems that block
 * the import outright, rather than a skip-and-continue. A Total that
 * does not equal the sum of its own class columns keeps the CLI's
 * original behaviour: reported, not blocking, because the row is
 * still real registration data with an arithmetic discrepancy worth
 * a human's eyes, not a parsing failure.
 *
 * Covers all three sources the dashboard reads, not All India alone:
 * describeFile() reads which one a filename names, and an RTO-wise
 * file also gets its RTO cross-checked against the sheet's own title
 * row (verifyTitle()'s rtoName), the same way month/year already
 * were. index.ts picks import_maker_month() or import_rto_month()
 * from stamp.scope at commit time.
 */

import { ENTITY_COLUMN, TOTAL_COLUMN, KNOWN_CLASSES, CLASS_COLUMNS, MONTHS } from "./class-columns.js";

/*
 * The real Vahan export names, across all three sources this
 * dashboard reads: maker_vehicleClass_<scope>_<Mon><YY>.xlsx, where
 * <scope> is "All RTO" (nationwide), "GJ01".."GJ39" (Gujarat), or
 * "MH01".."MH58" (Maharashtra) - never a year, despite the name this
 * pattern used to require (maker_vehicleClass_<year>_<Mon><YY>.xlsx),
 * which no real file was ever named.
 */
const FILE_PATTERN = /^maker_vehicleClass_(All RTO|GJ\d{2}|MH\d{2})_([A-Z][a-z]{2})(\d{2})\.xlsx$/;
const TITLE_PATTERN = /\((\d{2}) ([A-Z][a-z]{2}) (\d{4}) to (\d{2}) ([A-Z][a-z]{2}) (\d{4})\)/;

/*
 * The sheet's own title row for an RTO-wise file, e.g.
 * "RTO (AHMEDABAD - GJ1) Wise Maker and Vehicle Class Data for
 * Gujarat (...)" or "RTO (MUMBAI (CENTRAL) - MH1) Wise ...". The
 * nested parentheses in a name like "MUMBAI (CENTRAL)" are why this
 * anchors on " - <code>) Wise" rather than trying to balance parens -
 * greedy .+ still finds the right split because that suffix occurs
 * exactly once.
 */
const RTO_TITLE_PATTERN = /^RTO \((.+) - ([A-Z]{2}\d+)\)\s+Wise/;


/*
 * The title spells a code with no leading zero ("GJ1"), the filename
 * always has one ("GJ01") - both names for the same RTO, normalized
 * here so the cross-check compares like with like.
 */
function normalizeRtoCode(code) {

    const match = /^([A-Z]{2})0*(\d+)$/.exec(code);

    return match ? `${match[1]}${match[2]}` : code;
}


/* Filename -> { scope, rtoCode, month, year } | null. */
export function describeFile(fileName) {

    const match = FILE_PATTERN.exec(fileName);

    if (match === null) {
        return null;
    }

    const scopeToken = match[1];
    const month = match[2];

    if (!MONTHS.includes(month)) {
        return null;
    }

    const year = 2000 + Number(match[3]);

    if (scopeToken === "All RTO") {
        return { scope: "all_india", rtoCode: null, month, year };
    }

    const scope = scopeToken.startsWith("GJ") ? "gujarat" : "maharashtra";

    return { scope, rtoCode: scopeToken, month, year };
}


function verifyTitle(title, expected) {

    const text = String(title || "");
    const match = TITLE_PATTERN.exec(text);

    if (match === null) {
        return { ok: false, reason: "no date range found in the title row" };
    }

    const startMonth = match[2];
    const startYear = Number(match[3]);
    const endDay = Number(match[4]);

    if (startMonth !== expected.month || startYear !== expected.year) {
        return {
            ok: false,
            reason: `filename says ${expected.month} ${expected.year} but the ` +
                `sheet says ${startMonth} ${startYear}`
        };
    }

    if (expected.rtoCode === null) {
        return { ok: true, endDay, rtoName: null };
    }

    const rtoMatch = RTO_TITLE_PATTERN.exec(text.trim());

    if (rtoMatch === null) {
        return {
            ok: false,
            reason: `filename names an RTO (${expected.rtoCode}) but the sheet's ` +
                `title row does not look like an RTO-wise export`
        };
    }

    const [, rtoName, titleCode] = rtoMatch;

    if (normalizeRtoCode(titleCode) !== normalizeRtoCode(expected.rtoCode)) {
        return {
            ok: false,
            reason: `filename says RTO ${expected.rtoCode} but the sheet says ${titleCode}`
        };
    }

    return { ok: true, endDay, rtoName: rtoName.trim() };
}


function cleanMaker(value) {

    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/[​-‍﻿]/g, "")
        .trim();
}


function toCount(value) {

    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.round(value);
    }

    if (typeof value === "string" && value.trim() !== "") {

        const parsed = Number(value.replace(/,/g, ""));

        if (Number.isFinite(parsed)) {
            return Math.round(parsed);
        }
    }

    return 0;
}


/*
 * sheet: rows as returned by xlsx-reader.js's readSheet().
 * stamp: { scope, rtoCode, month, year } from describeFile(fileName).
 *
 * Returns:
 *   fatal            string | null - unrecoverable, no rows produced
 *   structural        string[]     - blocks commit (see file header)
 *   sumMismatches      {maker,total,summed}[] - reported, never blocks
 *   blanks            number
 *   endDay            number | null
 *   rtoName           string | null - from the title row, only when
 *                     stamp.rtoCode is set; what import_rto_month()'s
 *                     p_rto_name gets
 *   rows              {Maker, Total, ...classCounts}[] - ready for
 *                     import_maker_month/import_rto_month's p_rows
 *   units             sum of Total across all rows
 */
export function validateWorkbook(fileName, stamp, sheet) {

    const structural = [];
    const sumMismatches = [];

    if (sheet.length < 3) {
        return {
            fatal: "fewer than three rows",
            structural, sumMismatches, blanks: 0, endDay: null, rtoName: null, rows: [], units: 0
        };
    }

    const title = verifyTitle(sheet[0][0], stamp);

    if (!title.ok) {
        return {
            fatal: title.reason,
            structural, sumMismatches, blanks: 0, endDay: null, rtoName: null, rows: [], units: 0
        };
    }

    const header = sheet[1];

    if (header[0] !== ENTITY_COLUMN) {
        return {
            fatal: `header starts with ${JSON.stringify(header[0])}, ` +
                `expected ${JSON.stringify(ENTITY_COLUMN)}`,
            structural, sumMismatches, blanks: 0, endDay: title.endDay, rtoName: title.rtoName, rows: [], units: 0
        };
    }

    if (header[header.length - 1] !== TOTAL_COLUMN) {
        return {
            fatal: `header does not end with ${TOTAL_COLUMN}`,
            structural, sumMismatches, blanks: 0, endDay: title.endDay, rtoName: title.rtoName, rows: [], units: 0
        };
    }

    const positionOf = new Map();

    for (let index = 1; index < header.length - 1; index += 1) {

        const name = header[index];

        if (!KNOWN_CLASSES.has(name)) {
            structural.push(
                `unknown vehicle class ${JSON.stringify(name)} - this workbook ` +
                `cannot be imported until it is added to tools/class-columns.js`
            );
            continue;
        }

        if (positionOf.has(name)) {
            structural.push(`duplicate column ${JSON.stringify(name)}`);
            continue;
        }

        positionOf.set(name, index);
    }

    const rows = [];
    const seen = new Set();
    let blanks = 0;
    let units = 0;

    for (let index = 2; index < sheet.length; index += 1) {

        const source = sheet[index];
        const maker = cleanMaker(source[0]);

        if (maker === "") {
            blanks += 1;
            continue;
        }

        if (seen.has(maker)) {
            structural.push(`${maker} appears more than once`);
            continue;
        }

        if (/[\r\n]/.test(maker)) {
            structural.push(`${JSON.stringify(maker)} contains a newline`);
            continue;
        }

        seen.add(maker);

        const row = { [ENTITY_COLUMN]: maker };
        let summed = 0;

        for (const name of CLASS_COLUMNS) {

            const at = positionOf.get(name);
            const value = at === undefined ? 0 : toCount(source[at]);

            row[name] = value;
            summed += value;
        }

        const total = toCount(source[header.length - 1]);

        row[TOTAL_COLUMN] = total;

        if (summed !== total) {
            sumMismatches.push({ maker, total, summed });
        }

        rows.push(row);
        units += total;
    }

    return {
        fatal: null,
        structural,
        sumMismatches,
        blanks,
        endDay: title.endDay,
        rtoName: title.rtoName,
        rows,
        units
    };
}
