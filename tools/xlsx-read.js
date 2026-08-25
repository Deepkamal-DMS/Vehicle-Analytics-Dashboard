/*
 * Dependency-free XLSX reader.
 *
 * The repo has no package.json and should keep it that way, so this
 * unzips with node's own zlib rather than an npm library. An earlier
 * draft shelled out to unzip(1); that only works from Git Bash - the
 * binary is not on the Windows PATH - so a PowerShell or cmd run, or
 * a double-clicked .bat, would have failed.
 *
 * The Vahan exports come in two flavours and both must work:
 *
 *   31 of the 32 workbooks have NO xl/sharedStrings.xml and write
 *   every string inline as t="str" with the text in <v>.
 *
 *   maker_vehicleClass_2026_Jan26.xlsx alone uses t="s" with a
 *   sharedStrings table.
 *
 * Row numbers are also non-contiguous - Apr24 jumps from <row r="1">
 * straight to <row r="3"> - so rows are returned in document order
 * and never indexed by their r attribute.
 */

const fs = require("fs");
const zlib = require("zlib");


/* ============================================================
   ZIP
   ============================================================ */

const SIGNATURE_END_OF_DIRECTORY = 0x06054b50;
const SIGNATURE_DIRECTORY_ENTRY = 0x02014b50;
const SIGNATURE_LOCAL_HEADER = 0x04034b50;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

const ZIP64_SENTINEL = 0xffffffff;


function findEndOfDirectory(buffer) {

    /* The trailing comment may be up to 64 KB, so scan back that far. */
    const floor = Math.max(0, buffer.length - 22 - 0xffff);

    for (let at = buffer.length - 22; at >= floor; at -= 1) {

        if (buffer.readUInt32LE(at) === SIGNATURE_END_OF_DIRECTORY) {
            return at;
        }
    }

    return -1;
}


/*
 * Returns a Map of entry name -> { offset, method, compressedSize }
 * built from the central directory.
 */
function readDirectory(buffer, file) {

    const end = findEndOfDirectory(buffer);

    if (end < 0) {
        throw new Error(`${file}: no zip end-of-directory record`);
    }

    const count = buffer.readUInt16LE(end + 10);
    let at = buffer.readUInt32LE(end + 16);

    const entries = new Map();

    for (let index = 0; index < count; index += 1) {

        if (buffer.readUInt32LE(at) !== SIGNATURE_DIRECTORY_ENTRY) {
            throw new Error(`${file}: corrupt central directory`);
        }

        const method = buffer.readUInt16LE(at + 10);
        const compressedSize = buffer.readUInt32LE(at + 20);
        const nameLength = buffer.readUInt16LE(at + 28);
        const extraLength = buffer.readUInt16LE(at + 30);
        const commentLength = buffer.readUInt16LE(at + 32);
        const offset = buffer.readUInt32LE(at + 42);

        if (offset === ZIP64_SENTINEL || compressedSize === ZIP64_SENTINEL) {
            throw new Error(`${file}: zip64 archives are not supported`);
        }

        const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);

        entries.set(name, { offset, method, compressedSize });

        at += 46 + nameLength + extraLength + commentLength;
    }

    return entries;
}


function inflateEntry(buffer, entry, name, file) {

    if (buffer.readUInt32LE(entry.offset) !== SIGNATURE_LOCAL_HEADER) {
        throw new Error(`${file}: corrupt local header for ${name}`);
    }

    /*
     * The local header carries its own name and extra lengths, which
     * routinely differ from the central directory's.
     */
    const nameLength = buffer.readUInt16LE(entry.offset + 26);
    const extraLength = buffer.readUInt16LE(entry.offset + 28);

    const start = entry.offset + 30 + nameLength + extraLength;
    const payload = buffer.subarray(start, start + entry.compressedSize);

    if (entry.method === METHOD_STORED) {
        return payload;
    }

    if (entry.method === METHOD_DEFLATE) {
        return zlib.inflateRawSync(payload);
    }

    throw new Error(
        `${file}: ${name} uses compression method ${entry.method}`
    );
}


function openWorkbook(file) {

    const buffer = fs.readFileSync(file);

    /*
     * Catches Excel's ~$ lock files and any other non-archive that
     * slips past the caller's filename filter.
     */
    if (buffer.length < 22 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        throw new Error(`${file}: not a zip archive`);
    }

    const entries = readDirectory(buffer, file);

    return {
        /* Returns null when the part is absent, which is normal. */
        read(name) {

            const entry = entries.get(name);

            if (entry === undefined) {
                return null;
            }

            return inflateEntry(buffer, entry, name, file).toString("utf8");
        }
    };
}


/* ============================================================
   XML
   ============================================================ */

/*
 * Named entities first, &amp; last, so "&amp;lt;" does not decode
 * twice into "<".
 */
function decodeXml(text) {

    return text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) =>
            String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (match, decimal) =>
            String.fromCodePoint(Number(decimal)))
        .replace(/&amp;/g, "&");
}


function collectText(fragment) {

    /* Phonetic runs are pronunciation hints, not part of the value. */
    const stripped = fragment.replace(/<rPh[\s\S]*?<\/rPh>/g, "");

    let text = "";

    const matcher = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let match;

    while ((match = matcher.exec(stripped)) !== null) {
        text += match[1];
    }

    return decodeXml(text);
}


function readSharedStrings(workbook) {

    const xml = workbook.read("xl/sharedStrings.xml");

    if (xml === null) {
        return null;
    }

    const strings = [];

    const matcher = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
    let match;

    while ((match = matcher.exec(xml)) !== null) {
        strings.push(collectText(match[1]));
    }

    return strings;
}


/* "BI" -> 60. Stops at the first digit of the row number. */
function columnIndex(reference) {

    let index = 0;

    for (const character of reference) {

        const code = character.charCodeAt(0);

        if (code < 65 || code > 90) {
            break;
        }

        index = index * 26 + (code - 64);
    }

    return index - 1;
}


function cellValue(attributes, body, sharedStrings) {

    const typeMatch = /t="([^"]+)"/.exec(attributes);
    const type = typeMatch ? typeMatch[1] : "n";

    if (type === "inlineStr") {
        return collectText(body);
    }

    if (type === "e") {
        return null;
    }

    const valueMatch = /<v>([\s\S]*?)<\/v>/.exec(body);

    if (valueMatch === null) {
        return null;
    }

    if (type === "s") {

        const index = Number(valueMatch[1]);

        if (sharedStrings === null || sharedStrings[index] === undefined) {
            throw new Error(
                `shared string ${index} referenced but unavailable`
            );
        }

        return sharedStrings[index];
    }

    if (type === "str" || type === "d") {
        return decodeXml(valueMatch[1]);
    }

    if (type === "b") {
        return valueMatch[1] === "1";
    }

    return Number.parseFloat(valueMatch[1]);
}


/*
 * Returns an array of rows in document order. Each row is a sparse
 * array positioned by the cell's r attribute, so cells written out
 * of order or omitted entirely still land in the right column.
 */
function readSheet(file, sheet = "xl/worksheets/sheet1.xml") {

    const workbook = openWorkbook(file);
    const sharedStrings = readSharedStrings(workbook);

    const xml = workbook.read(sheet);

    if (xml === null) {
        throw new Error(`${file}: ${sheet} is missing`);
    }

    const rows = [];

    const rowMatcher = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
    let rowMatch;

    while ((rowMatch = rowMatcher.exec(xml)) !== null) {

        const cells = [];
        const body = rowMatch[1] || "";

        const cellMatcher =
            /<c(?:\s([^>]*?))?(?:\/>|>([\s\S]*?)<\/c>)/g;
        let cellMatch;
        let fallbackIndex = 0;

        while ((cellMatch = cellMatcher.exec(body)) !== null) {

            const attributes = cellMatch[1] || "";
            const reference = /r="([A-Z]+)\d+"/.exec(attributes);

            const index = reference
                ? columnIndex(reference[1])
                : fallbackIndex;

            cells[index] = cellValue(
                attributes,
                cellMatch[2] || "",
                sharedStrings
            );

            fallbackIndex = index + 1;
        }

        rows.push(cells);
    }

    return rows;
}


module.exports = { readSheet };
