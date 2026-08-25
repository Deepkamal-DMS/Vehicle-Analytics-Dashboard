/*
 * Turns the monthly Vahan Maker x Vehicle Class workbooks into
 * twelve month tables - one per calendar month, with the year as a
 * column rather than baked into the table name.
 *
 * Reads   RTO/2025-24/*.xlsx and RTO/2026/*.xlsx  (override via argv)
 * Writes  RTO/month-tables/<Mon>.csv              (one per month)
 *         tools/schema.sql                        (12 CREATE TABLE)
 *
 * The month and year both come from the <Mon><YY> filename suffix.
 * The middle token of the filename is NOT the data year - every file
 * in RTO/2025-24 says 2025, but half of them hold 2024 data - so it
 * is ignored, and the suffix is cross-checked against the date range
 * the sheet prints in A1.
 *
 * Usage:  node tools/build-month-tables.js [sourceDir ...]
 */

const fs = require("fs");
const path = require("path");

const { readSheet } = require("./xlsx-read.js");


const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_SOURCES = [
    path.join(REPO_ROOT, "RTO", "2025-24"),
    path.join(REPO_ROOT, "RTO", "2026")
];

const CSV_OUT_DIR = path.join(REPO_ROOT, "RTO", "month-tables");
const SCHEMA_OUT = path.join(__dirname, "schema.sql");

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const ENTITY_COLUMN = "Maker";
const TOTAL_COLUMN = "Total";


/*
 * Canonical class order: the 73 columns of the live MAKER_WISE_2026
 * table in its own order, then Bulldozer (which only MAKER_WISE_2025
 * has), then the one class the workbooks carry that neither live
 * table does. Names are the raw Vahan headers, verbatim - the
 * dashboard's CLASS_GROUPS regexes in script.js match on the spaces.
 */
const CLASS_COLUMNS = [
    "Three Wheeler (Goods)",
    "Three Wheeler (Passenger)",
    "e-Rickshaw with Cart (G)",
    "e-Rickshaw(P)",
    "Tractor-Trolley(Commercial)",
    "Trailer (Agricultural)",
    "Harvester",
    "Goods Carrier",
    "M-Cycle/Scooter",
    "Trailer (Commercial)",
    "Construction Equipment Vehicle",
    "Crane Mounted Vehicle",
    "Agricultural Tractor",
    "Construction Equipment Vehicle (Commercial)",
    "Earth Moving Equipment",
    "Excavator (Commercial)",
    "Excavator (NT)",
    "Fork Lift",
    "Road Roller",
    "Tractor (Commercial)",
    "Motorised Cycle (CC  25cc)",
    "Bus",
    "Semi-Trailer (Commercial)",
    "Motor Car",
    "Vehicle Fitted With Rig",
    "Moped",
    "Armoured/Specialised Vehicle",
    "Ambulance",
    "Animal Ambulance",
    "Articulated Vehicle",
    "Auxiliary Trailer",
    "Camper Van / Trailer",
    "Camper Van / Trailer (Private Use)",
    "Dumper",
    "Educational Institution Bus",
    "Fire Fighting Vehicle",
    "Fire Tenders",
    "Hearses",
    "Maxi Cab",
    "Mobile Canteen",
    "Mobile Clinic",
    "Mobile Workshop",
    "Omni Bus",
    "Private Service Vehicle",
    "Private Service Vehicle (Individual Use)",
    "Puller Tractor",
    "Recovery Vehicle",
    "School Bus",
    "Snorked Ladders",
    "Tow Truck",
    "Tower Wagon",
    "Tree Trimming Vehicle",
    "Vehicle Fitted With Compressor",
    "Vehicle Fitted With Generator",
    "X-Ray Van",
    "Adapted Vehicle",
    "M-Cycle/Scooter-With Side Car",
    "Motor Cycle/Scooter-Used For Hire",
    "Three Wheeler (Personal)",
    "Motor Cab",
    "Motor Cycle/Scooter-SideCar(T)",
    "Quadricycle (Commercial)",
    "Quadricycle (Private)",
    "Luxury Cab",
    "Breakdown Van",
    "Cash Van",
    "Library Van",
    "Omni Bus (Private Use)",
    "Vintage Motor Vehicle",
    "Trailer For Personal Use",
    "Motor Caravan",
    "Power Tiller",
    "Modular Hydraulic Trailer",
    "Bulldozer",
    "Motor Cycle/Scooter-With Trailer"
];

const TABLE_COLUMNS = ["year", ENTITY_COLUMN, ...CLASS_COLUMNS, TOTAL_COLUMN];

const KNOWN_CLASSES = new Set(CLASS_COLUMNS);


const problems = [];

function complain(message) {
    problems.push(message);
}


/* ============================================================
   PARSING
   ============================================================ */

const FILE_PATTERN =
    /^maker_vehicleClass_\d{4}_([A-Z][a-z]{2})(\d{2})\.xlsx$/;

const TITLE_PATTERN =
    /\((\d{2}) ([A-Z][a-z]{2}) (\d{4}) to (\d{2}) ([A-Z][a-z]{2}) (\d{4})\)/;


function describeFile(fileName) {

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


/*
 * The sheet prints its own coverage in A1. Trusting the filename
 * without checking it here is exactly how the 2024 files would end
 * up filed as 2025.
 */
function verifyTitle(title, expected, fileName) {

    const match = TITLE_PATTERN.exec(String(title || ""));

    if (match === null) {
        complain(`${fileName}: no date range found in the title row`);
        return null;
    }

    const startMonth = match[2];
    const startYear = Number(match[3]);
    const endDay = Number(match[4]);

    if (startMonth !== expected.month || startYear !== expected.year) {
        complain(
            `${fileName}: filename says ${expected.month} ${expected.year} ` +
            `but the sheet says ${startMonth} ${startYear}`
        );
        return null;
    }

    return { endDay };
}


function cleanMaker(value) {

    if (value === null || value === undefined) {
        return "";
    }

    /* One maker carries a trailing zero-width space. */
    return String(value)
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
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


function readWorkbook(filePath) {

    const fileName = path.basename(filePath);
    const stamp = describeFile(fileName);

    if (stamp === null) {
        return null;
    }

    const sheet = readSheet(filePath);

    if (sheet.length < 3) {
        complain(`${fileName}: fewer than three rows`);
        return null;
    }

    const coverage = verifyTitle(sheet[0][0], stamp, fileName);

    if (coverage === null) {
        return null;
    }

    const header = sheet[1];

    if (header[0] !== ENTITY_COLUMN) {
        complain(
            `${fileName}: header starts with ${JSON.stringify(header[0])}, ` +
            `expected ${JSON.stringify(ENTITY_COLUMN)}`
        );
        return null;
    }

    if (header[header.length - 1] !== TOTAL_COLUMN) {
        complain(`${fileName}: header does not end with ${TOTAL_COLUMN}`);
        return null;
    }

    /*
     * Column order shuffles between files, so the header is mapped by
     * name. Anything unrecognised is a hard error - silently dropping
     * a new Vahan class is how totals quietly stop reconciling.
     */
    const positionOf = new Map();

    for (let index = 1; index < header.length - 1; index += 1) {

        const name = header[index];

        if (!KNOWN_CLASSES.has(name)) {
            complain(
                `${fileName}: unknown vehicle class ${JSON.stringify(name)} ` +
                `- add it to CLASS_COLUMNS`
            );
            continue;
        }

        if (positionOf.has(name)) {
            complain(`${fileName}: duplicate column ${JSON.stringify(name)}`);
            continue;
        }

        positionOf.set(name, index);
    }

    const rows = [];
    const seen = new Set();
    let blanks = 0;

    for (let index = 2; index < sheet.length; index += 1) {

        const source = sheet[index];
        const maker = cleanMaker(source[0]);

        if (maker === "") {
            blanks += 1;
            continue;
        }

        if (seen.has(maker)) {
            complain(`${fileName}: ${maker} appears more than once`);
            continue;
        }

        /*
         * One maker in Jan26 arrives with a trailing CRLF. trim()
         * removes it, but a stray newline that survived into a field
         * would split the CSV row in half, so refuse outright.
         */
        if (/[\r\n]/.test(maker)) {
            complain(
                `${fileName}: ${JSON.stringify(maker)} contains a newline`
            );
            continue;
        }

        seen.add(maker);

        const counts = CLASS_COLUMNS.map(name => {

            const at = positionOf.get(name);

            return at === undefined ? 0 : toCount(source[at]);
        });

        const total = toCount(source[header.length - 1]);
        const summed = counts.reduce((carry, value) => carry + value, 0);

        if (summed !== total) {
            complain(
                `${fileName}: ${maker} sums to ${summed} but Total is ${total}`
            );
        }

        rows.push([stamp.year, maker, ...counts, total]);
    }

    return {
        fileName,
        month: stamp.month,
        year: stamp.year,
        endDay: coverage.endDay,
        classCount: positionOf.size,
        blanks,
        rows
    };
}


/* ============================================================
   CSV
   ============================================================ */

function csvField(value) {

    const text = String(value);

    if (/[",\r\n]/.test(text)) {
        return '"' + text.replace(/"/g, '""') + '"';
    }

    return text;
}


function csvLine(values) {
    return values.map(csvField).join(",");
}


/* ============================================================
   SCHEMA
   ============================================================ */

function quoted(name) {
    return '"' + name.replace(/"/g, '""') + '"';
}


function buildSchema() {

    const width = Math.max(
        ...TABLE_COLUMNS.map(name => quoted(name).length)
    );

    const reconcile = CLASS_COLUMNS
        .map(name => `--         ${quoted(name)}`)
        .join(" +\n");

    const blocks = MONTHS.map(month => {

        const table = quoted(`Maker_Class_Wise_${month}`);

        const columns = TABLE_COLUMNS.map(name => {

            const padded = quoted(name).padEnd(width);

            if (name === "year") {
                return `    ${padded} smallint NOT NULL`;
            }

            if (name === ENTITY_COLUMN) {
                return `    ${padded} text     NOT NULL`;
            }

            return `    ${padded} integer  NOT NULL DEFAULT 0`;
        });

        const policy = quoted(`anon read ${month}`);

        return [
            `CREATE TABLE ${table} (`,
            columns.join(",\n") + ",",
            `    PRIMARY KEY (${quoted("year")}, ${quoted(ENTITY_COLUMN)}),`,
            `    CHECK (${quoted("year")} BETWEEN 2000 AND 2100)`,
            `);`,
            ``,
            `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`,
            ``,
            `GRANT SELECT ON TABLE ${table} TO anon, authenticated;`,
            ``,
            `DROP POLICY IF EXISTS ${policy} ON ${table};`,
            ``,
            `CREATE POLICY ${policy} ON ${table}`,
            `    FOR SELECT TO anon, authenticated USING (true);`,
            ``
        ].join("\n");
    });

    return [
        `-- Generated by tools/build-month-tables.js - do not edit by hand.`,
        `--`,
        `-- Twelve month tables for Maker x Vehicle Class. The year is a`,
        `-- column, not part of the table name, so a new year is a new set`,
        `-- of rows rather than a new set of tables.`,
        `--`,
        `-- ${TABLE_COLUMNS.length} columns: year, ${ENTITY_COLUMN}, ` +
            `${CLASS_COLUMNS.length} vehicle classes, ${TOTAL_COLUMN}.`,
        `-- Class names are the raw Vahan headers, matching the existing`,
        `-- MAKER_WISE_* tables, so the CLASS_GROUPS regexes in script.js`,
        `-- keep classifying them correctly.`,
        `--`,
        `-- The SELECT-only policy mirrors the existing tables: the`,
        `-- publishable key in script.js stays read-only. The GRANT is`,
        `-- explicit rather than left to the project's default privileges,`,
        `-- which have been hand-edited before and cannot be assumed.`,
        ``,
        `GRANT USAGE ON SCHEMA public TO anon, authenticated;`,
        ``,
        blocks.join("\n"),
        `/*`,
        ` * PostgREST caches the schema, so a brand new table can 404 over`,
        ` * REST for a few seconds. This forces the reload.`,
        ` */`,
        `NOTIFY pgrst, 'reload schema';`,
        ``,
        `-- ------------------------------------------------------------`,
        `-- Loading`,
        `-- ------------------------------------------------------------`,
        `--`,
        `-- Import RTO/month-tables/<Mon>.csv into the matching table via`,
        `-- Table Editor -> Import data from CSV.`,
        `--`,
        `-- Vahan restates past months as late registrations arrive. Each`,
        `-- CSV holds every year for its month, so a reload is a truncate`,
        `-- and a re-import, not an append:`,
        `--`,
        `--     TRUNCATE TABLE "Maker_Class_Wise_Jan";`,
        `--`,
        `-- Re-running tools/build-month-tables.js first picks up the new`,
        `-- workbook. Replacing the whole table is what makes a maker that`,
        `-- vanished from the new export actually vanish.`,
        `--`,
        `-- Do NOT delete a single year and then re-import the merged CSV -`,
        `-- the rows for the other years are still present and the import`,
        `-- fails on the (year, Maker) primary key. Deleting one year is`,
        `-- only useful if you are importing a single-year file:`,
        `--`,
        `--     DELETE FROM "Maker_Class_Wise_Jan" WHERE "year" = 2026;`,
        `--`,
        `-- ------------------------------------------------------------`,
        `-- Verification`,
        `-- ------------------------------------------------------------`,
        `--`,
        `-- Row count and unit total per year:`,
        `--`,
        `--     SELECT "year", count(*), sum("Total")`,
        `--     FROM "Maker_Class_Wise_Jan"`,
        `--     GROUP BY "year" ORDER BY "year";`,
        `--`,
        `-- Total must equal the sum of the ${CLASS_COLUMNS.length} class ` +
            `columns. Expect zero rows:`,
        `--`,
        `--     SELECT "year", "Maker" FROM "Maker_Class_Wise_Jan"`,
        `--     WHERE "Total" <> (`,
        reconcile,
        `--     );`,
        ``
    ].join("\n");
}


/* ============================================================
   MAIN
   ============================================================ */

function main() {

    const sources = process.argv.length > 2
        ? process.argv.slice(2).map(entry => path.resolve(entry))
        : DEFAULT_SOURCES;

    const workbooks = [];
    const skipped = [];

    for (const directory of sources) {

        if (!fs.existsSync(directory)) {
            complain(`source directory not found: ${directory}`);
            continue;
        }

        const entries = fs.readdirSync(directory)
            .filter(name => name.endsWith(".xlsx"))
            .filter(name => !name.startsWith("~$"))
            .sort();

        for (const name of entries) {

            const parsed = readWorkbook(path.join(directory, name));

            if (parsed === null) {
                skipped.push(name);
                continue;
            }

            workbooks.push(parsed);
        }
    }

    if (workbooks.length === 0) {
        complain("no workbooks matched maker_vehicleClass_YYYY_MonYY.xlsx");
    }

    /* Group by month, years ascending within each file. */
    const byMonth = new Map(MONTHS.map(month => [month, []]));

    for (const book of workbooks.sort((a, b) => a.year - b.year)) {
        byMonth.get(book.month).push(book);
    }

    fs.mkdirSync(CSV_OUT_DIR, { recursive: true });

    const header = csvLine(TABLE_COLUMNS);
    const summary = [];

    for (const month of MONTHS) {

        const books = byMonth.get(month);

        if (books.length === 0) {
            continue;
        }

        const lines = [header];
        let units = 0;

        for (const book of books) {
            for (const row of book.rows) {
                lines.push(csvLine(row));
                units += row[row.length - 1];
            }
        }

        fs.writeFileSync(
            path.join(CSV_OUT_DIR, `${month}.csv`),
            lines.join("\n") + "\n",
            "utf8"
        );

        summary.push({
            month,
            files: books.length,
            rows: lines.length - 1,
            units,
            years: books.map(book => book.year).join(" ")
        });
    }

    fs.writeFileSync(SCHEMA_OUT, buildSchema(), "utf8");

    /* ---- report ---- */

    console.log(`read ${workbooks.length} workbooks`);

    if (skipped.length > 0) {
        console.log(`skipped ${skipped.length}: ${skipped.join(", ")}`);
    }

    console.log("");
    console.log("table                    files   rows        units   years");

    let totalRows = 0;
    let totalUnits = 0;

    for (const entry of summary) {

        totalRows += entry.rows;
        totalUnits += entry.units;

        console.log(
            `Maker_Class_Wise_${entry.month}`.padEnd(25) +
            String(entry.files).padStart(5) +
            String(entry.rows).padStart(7) +
            entry.units.toLocaleString("en-IN").padStart(13) +
            "   " + entry.years
        );
    }

    console.log("");
    console.log(
        `${summary.length} csv files, ` +
        `${totalRows.toLocaleString("en-IN")} rows, ` +
        `${totalUnits.toLocaleString("en-IN")} units`
    );
    console.log(`csv    -> ${CSV_OUT_DIR}`);
    console.log(`schema -> ${SCHEMA_OUT}`);

    const partial = workbooks.filter(book => book.endDay < 28);

    if (partial.length > 0) {
        console.log("");
        for (const book of partial) {
            console.log(
                `note: ${book.fileName} covers only 01-${book.endDay} ` +
                `${book.month} ${book.year} - a partial month`
            );
        }
    }

    if (problems.length > 0) {
        console.log("");
        console.error(`${problems.length} problem(s):`);
        for (const problem of problems) {
            console.error(`  ${problem}`);
        }
        process.exitCode = 1;
    }
}


main();
