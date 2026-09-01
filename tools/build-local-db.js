/*
 * Turns the Vahan New workbooks into the three monthly tables and
 * the SQL that holds them.
 *
 * This supersedes build-month-tables.js, which produced twelve
 * tables split by calendar month with no scope dimension - the
 * reason the sidebar's scope filter could never reach the trend.
 *
 * Reads   Vahan New/<folder>/*.xlsx
 * Writes  local/data/<table>.csv        one per table
 *         local/init/10-schema.sql      CREATE TABLE + RLS + policy
 *
 * Three tables, because the class column set differs per scope and
 * Vahan drops classes with no entries:
 *
 *     Monthly_MAKER_WISE           All India     75 classes
 *     Monthly_Gujarat_Class_Wise   Gujarat       64 classes
 *     Monthly_RTO_Class_Wise       GJ01/27/38    53 classes
 *
 * Only the last carries an "rto" column; the other two have no RTO
 * dimension to record. Ahmedabad is that table with no rto filter,
 * rolled up per maker - see 20-derived.sql.
 *
 * Class columns are NULLABLE, not NOT NULL DEFAULT 0. The data is
 * 97.5% zeros - 89,498 non-zero cells out of 3.57 million - and a
 * stored zero costs four bytes where a NULL costs nothing beyond
 * the row's null bitmap. toNumber() in script.js already maps null
 * to 0, and SQL sum() ignores NULLs, so nothing downstream changes.
 *
 * Usage:  node tools/build-local-db.js
 */

const fs = require("fs");
const path = require("path");

const { readSheet } = require("./xlsx-read.js");


const REPO_ROOT = path.resolve(__dirname, "..");

const SOURCE_DIR = path.join(REPO_ROOT, "Vahan New");
const CSV_OUT_DIR = path.join(REPO_ROOT, "local", "data");
const SCHEMA_OUT = path.join(REPO_ROOT, "local", "init", "10-schema.sql");

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const ENTITY_COLUMN = "Maker";
const TOTAL_COLUMN = "Total";


/*
 * Three families of twelve tables - one table per calendar month,
 * exactly the shape the dropped Maker_Class_Wise_<Mon> set had, so
 * the year stays a column and a new year adds rows rather than
 * tables.
 *
 * The All India family reuses the old names outright: those tables
 * are being dropped and rebuilt from wider sources, so there is no
 * reason to churn the names too.
 *
 * Only the Ahmedabad family carries an "rto" column. Without it the
 * three RTO folders would have to be summed at load time, and the
 * GJ01 / GJ27 / GJ38 scopes in the sidebar would lose their trend
 * data the way GJ13 already has. One extra column keeps all four
 * readings - the three RTOs and their Ahmedabad rollup - available
 * from the same twelve tables.
 */
const TARGETS = [
    {
        prefix: "Maker_Class_Wise_",
        folders: [{ dir: "All State", rto: null }],
        hasRto: false
    },
    {
        prefix: "Gujarat_Class_Wise_",
        folders: [{ dir: "Gujrat", rto: null }],
        hasRto: false
    },
    {
        prefix: "Ahmedabad_Class_Wise_",
        folders: [
            { dir: "GJ01", rto: "GJ01" },
            { dir: "GJ27", rto: "GJ27" },
            { dir: "GJ38", rto: "GJ38" }
        ],
        hasRto: true
    }
];


/*
 * Canonical class order, copied verbatim from build-month-tables.js
 * so the two generators cannot drift. Each table emits the subset
 * of these its own workbooks actually use, in this order. The names
 * are the raw Vahan headers - the CLASS_GROUPS regexes in script.js
 * match on the spacing, so it must not be normalised.
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

const KNOWN_CLASSES = new Set(CLASS_COLUMNS);


const problems = [];

function complain(message) {
    problems.push(message);
}


/* ============================================================
   PARSING
   ============================================================ */

/*
 * The scope token is optional: All State files are
 * maker_vehicleClass_2025_Jan24.xlsx while the rest carry the RTO
 * between the year and the month, maker_vehicleClass_2024_GJ01_Jan24.
 * The leading year is NOT the data year - every All State file in
 * 2025-24 says 2025 and half of them hold 2024 - so it is ignored
 * and the <Mon><YY> suffix is used instead, cross-checked against
 * the date range the sheet prints in A1.
 */
const FILE_PATTERN =
    /^maker_vehicleClass_\d{4}_(?:[A-Za-z0-9]+_)?([A-Z][a-z]{2})(\d{2})\.xlsx$/;

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

    return {
        month,
        monthNumber: MONTHS.indexOf(month) + 1,
        year: 2000 + Number(match[2])
    };
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
        return false;
    }

    if (match[2] !== expected.month || Number(match[3]) !== expected.year) {
        complain(
            `${fileName}: filename says ${expected.month} ${expected.year} ` +
            `but the sheet says ${match[2]} ${match[3]}`
        );
        return false;
    }

    return true;
}


function cleanMaker(value) {

    if (value === null || value === undefined) {
        return "";
    }

    /* One maker carries a trailing zero-width space. */
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


/* ============================================================
   READING
   ============================================================ */

function readWorkbook(filePath, rto) {

    const fileName = path.basename(filePath);
    const stamp = describeFile(fileName);

    if (stamp === null) {
        complain(`${fileName}: filename does not parse`);
        return [];
    }

    const sheet = readSheet(filePath);

    if (sheet.length < 3) {
        complain(`${fileName}: fewer than three rows`);
        return [];
    }

    if (!verifyTitle(sheet[0][0], stamp, fileName)) {
        return [];
    }

    const header = sheet[1];

    if (header[0] !== ENTITY_COLUMN) {
        complain(
            `${fileName}: header starts with ${JSON.stringify(header[0])}, ` +
            `expected ${JSON.stringify(ENTITY_COLUMN)}`
        );
        return [];
    }

    if (header[header.length - 1] !== TOTAL_COLUMN) {
        complain(`${fileName}: header does not end with ${TOTAL_COLUMN}`);
        return [];
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
                "- add it to CLASS_COLUMNS"
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

    for (let index = 2; index < sheet.length; index += 1) {

        const cells = sheet[index];
        const maker = cleanMaker(cells[0]);

        if (maker === "" || /^total$/i.test(maker)) {
            continue;
        }

        if (seen.has(maker)) {
            complain(
                `${fileName}: duplicate maker ${JSON.stringify(maker)}`
            );
            continue;
        }

        seen.add(maker);

        const counts = new Map();
        let sum = 0;

        for (const [name, at] of positionOf) {

            const count = toCount(cells[at]);

            if (count !== 0) {
                counts.set(name, count);
                sum += count;
            }
        }

        const total = toCount(cells[header.length - 1]);

        /*
         * The sheet's own Total must equal the classes beside it.
         * A mismatch means a column was missed or misread, and the
         * whole point of mapping by name is to catch that.
         */
        if (total !== sum) {
            complain(
                `${fileName}: ${maker} totals ${total} but its classes ` +
                `sum to ${sum}`
            );
        }

        rows.push({
            rto,
            year: stamp.year,
            month: stamp.monthNumber,
            maker,
            counts,
            total
        });
    }

    return rows;
}


/* ============================================================
   CSV
   ============================================================ */

function csvCell(value) {

    if (value === null || value === undefined) {
        return "";
    }

    const text = String(value);

    return /[",\r\n]/.test(text)
        ? `"${text.replace(/"/g, '""')}"`
        : text;
}


function writeCsv(target, table, rows, classColumns) {

    /*
     * No "month" column: the table name carries it, the same way it
     * did in the set this replaces.
     */
    const header = [
        ...(target.hasRto ? ["rto"] : []),
        "year",
        ENTITY_COLUMN,
        ...classColumns,
        TOTAL_COLUMN
    ];

    const lines = [header.map(csvCell).join(",")];

    for (const row of rows) {

        const cells = [
            ...(target.hasRto ? [row.rto] : []),
            row.year,
            row.maker,
            /* Absent class -> empty field -> NULL, not a stored zero. */
            ...classColumns.map(name =>
                row.counts.has(name) ? row.counts.get(name) : null
            ),
            row.total
        ];

        lines.push(cells.map(csvCell).join(","));
    }

    const file = path.join(CSV_OUT_DIR, `${table}.csv`);

    fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");

    return file;
}


/* ============================================================
   SCHEMA
   ============================================================ */

function quote(name) {
    return `"${name.replace(/"/g, '""')}"`;
}


function schemaFor(target, table, classColumns) {

    const width = Math.max(
        ...classColumns.map(name => quote(name).length),
        12
    );

    const pad = name => quote(name).padEnd(width);

    const lines = [];

    if (target.hasRto) {
        lines.push(`    ${pad("rto")} text     NOT NULL`);
    }

    lines.push(`    ${pad("year")} smallint NOT NULL`);
    lines.push(`    ${pad(ENTITY_COLUMN)} text     NOT NULL`);

    for (const name of classColumns) {
        lines.push(`    ${pad(name)} integer`);
    }

    lines.push(`    ${pad(TOTAL_COLUMN)} integer  NOT NULL`);

    const key = [
        ...(target.hasRto ? ["rto"] : []),
        "year",
        ENTITY_COLUMN
    ].map(quote).join(", ");

    lines.push(`    PRIMARY KEY (${key})`);
    lines.push('    CHECK ("year" BETWEEN 2000 AND 2100)');

    const body = lines.join(",\n");

    const name = quote(table);

    return [
        `CREATE TABLE ${name} (`,
        body,
        ");",
        "",
        `ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY;`,
        "",
        `GRANT SELECT ON TABLE ${name} TO anon, authenticated;`,
        "",
        `CREATE POLICY "anon read ${table}" ON ${name}`,
        "    FOR SELECT TO anon, authenticated USING (true);",
        ""
    ].join("\n");
}


/* ============================================================
   MAIN
   ============================================================ */

function main() {

    fs.mkdirSync(CSV_OUT_DIR, { recursive: true });

    const schema = [
        "-- Generated by tools/build-local-db.js - do not edit by hand.",
        "--",
        "-- Three monthly Maker x Vehicle Class tables, one per scope.",
        "-- Class columns are nullable on purpose: the data is 97.5%",
        "-- zeros, and a NULL costs nothing where a stored 0 costs four",
        "-- bytes. toNumber() in script.js maps null to 0 already.",
        ""
    ];

    const summary = [];

    for (const target of TARGETS) {

        const rows = [];

        for (const folder of target.folders) {

            const dir = path.join(SOURCE_DIR, folder.dir);

            if (!fs.existsSync(dir)) {
                complain(`${folder.dir}: folder is missing`);
                continue;
            }

            for (const fileName of fs.readdirSync(dir).sort()) {

                if (!fileName.endsWith(".xlsx") || fileName.startsWith("~$")) {
                    continue;
                }

                rows.push(
                    ...readWorkbook(path.join(dir, fileName), folder.rto)
                );
            }
        }

        /*
         * The class set is decided per family, not per month, so all
         * twelve tables in a family share one column list - the way
         * the twelve they replace did. A month that happens to carry
         * no Bulldozers still has the column, holding NULL.
         */
        const used = new Set();

        for (const row of rows) {
            for (const name of row.counts.keys()) {
                used.add(name);
            }
        }

        const classColumns = CLASS_COLUMNS.filter(name => used.has(name));

        for (let index = 0; index < MONTHS.length; index += 1) {

            const month = MONTHS[index];
            const table = `${target.prefix}${month}`;
            const monthRows = rows.filter(row => row.month === index + 1);

            if (monthRows.length === 0) {
                complain(`${table}: no rows for ${month}`);
            }

            writeCsv(target, table, monthRows, classColumns);

            schema.push(schemaFor(target, table, classColumns));

            summary.push({
                table,
                rows: monthRows.length,
                classes: classColumns.length,
                nonZero: monthRows.reduce(
                    (sum, row) => sum + row.counts.size, 0
                ),
                units: monthRows.reduce((sum, row) => sum + row.total, 0)
            });
        }
    }

    fs.writeFileSync(SCHEMA_OUT, schema.join("\n"), "utf8");

    for (const target of TARGETS) {

        const family = summary.filter(
            entry => entry.table.startsWith(target.prefix)
        );

        const rows = family.reduce((sum, entry) => sum + entry.rows, 0);
        const units = family.reduce((sum, entry) => sum + entry.units, 0);

        console.log(
            `${target.prefix}Jan .. Dec`.padEnd(34) +
            String(family.length).padStart(2) + " tables  " +
            String(rows).padStart(6) + " rows  " +
            String(family[0].classes).padStart(3) + " classes  " +
            units.toLocaleString("en-IN").padStart(14) + " units"
        );

        console.log(
            "".padEnd(34) +
            family
                .map(entry => `${entry.table.slice(-3)} ${entry.rows}`)
                .join("  ")
        );
    }

    console.log(
        "\n" + String(summary.length).padStart(2) + " tables, " +
        summary.reduce((sum, entry) => sum + entry.rows, 0) + " rows total"
    );

    console.log(`\nCSVs  -> ${CSV_OUT_DIR}`);
    console.log(`SQL   -> ${SCHEMA_OUT}`);

    if (problems.length > 0) {
        console.error(`\n${problems.length} problem(s):`);
        for (const problem of problems.slice(0, 40)) {
            console.error(`  ${problem}`);
        }
        process.exitCode = 1;
    } else {
        console.log("\nNo problems.");
    }
}


main();
