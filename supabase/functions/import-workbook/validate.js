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
 */

import { ENTITY_COLUMN, TOTAL_COLUMN, KNOWN_CLASSES, CLASS_COLUMNS, MONTHS } from "./class-columns.js";

const FILE_PATTERN = /^maker_vehicleClass_\d{4}_([A-Z][a-z]{2})(\d{2})\.xlsx$/;
const TITLE_PATTERN = /\((\d{2}) ([A-Z][a-z]{2}) (\d{4}) to (\d{2}) ([A-Z][a-z]{2}) (\d{4})\)/;


/* Filename -> { month, year } | null. Mirrors describeFile() exactly. */
export function describeFile(fileName) {

    const match = FILE_PATTERN.exec(fileName);

    if (match === null) {
        return null;
    }

    const month = match[1];

    if (!MONTHS.includes(month)) {
        return null;
    }

    return { month, year: 2000 + Number(match[2]) };
}


function verifyTitle(title, expected) {

    const match = TITLE_PATTERN.exec(String(title || ""));

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

    return { ok: true, endDay };
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
 * stamp: { month, year } from describeFile(fileName).
 *
 * Returns:
 *   fatal            string | null - unrecoverable, no rows produced
 *   structural        string[]     - blocks commit (see file header)
 *   sumMismatches      {maker,total,summed}[] - reported, never blocks
 *   blanks            number
 *   endDay            number | null
 *   rows              {Maker, Total, ...classCounts}[] - ready for the
 *                     import_maker_month RPC's p_rows
 *   units             sum of Total across all rows
 */
export function validateWorkbook(fileName, stamp, sheet) {

    const structural = [];
    const sumMismatches = [];

    if (sheet.length < 3) {
        return {
            fatal: "fewer than three rows",
            structural, sumMismatches, blanks: 0, endDay: null, rows: [], units: 0
        };
    }

    const title = verifyTitle(sheet[0][0], stamp);

    if (!title.ok) {
        return {
            fatal: title.reason,
            structural, sumMismatches, blanks: 0, endDay: null, rows: [], units: 0
        };
    }

    const header = sheet[1];

    if (header[0] !== ENTITY_COLUMN) {
        return {
            fatal: `header starts with ${JSON.stringify(header[0])}, ` +
                `expected ${JSON.stringify(ENTITY_COLUMN)}`,
            structural, sumMismatches, blanks: 0, endDay: title.endDay, rows: [], units: 0
        };
    }

    if (header[header.length - 1] !== TOTAL_COLUMN) {
        return {
            fatal: `header does not end with ${TOTAL_COLUMN}`,
            structural, sumMismatches, blanks: 0, endDay: title.endDay, rows: [], units: 0
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
        rows,
        units
    };
}
