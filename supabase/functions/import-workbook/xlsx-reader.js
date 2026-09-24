/*
 * Dependency-free XLSX reader, ported from tools/xlsx-read.js for an
 * uploaded file's bytes rather than a path on disk.
 *
 * Every zip/XML parsing rule here is copied from that file on
 * purpose - same central-directory walk, same local-header handling,
 * same sharedStrings fallback, same non-contiguous row numbering,
 * same cell-type switch - so a workbook parses identically whether
 * it goes through the CLI (tools/build-month-tables.js) or through
 * this upload path. See that file's header comment for why each of
 * those rules exists; it is not repeated here.
 *
 * Plain ESM, Web-standard APIs only (DataView, TextDecoder,
 * DecompressionStream) - no Node builtins, no Deno-specific APIs -
 * so it is the same file Deno runs in the deployed Edge Function and
 * Node runs in this repo's tests.
 */

const SIGNATURE_END_OF_DIRECTORY = 0x06054b50;
const SIGNATURE_DIRECTORY_ENTRY = 0x02014b50;
const SIGNATURE_LOCAL_HEADER = 0x04034b50;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

const ZIP64_SENTINEL = 0xffffffff;

const utf8 = new TextDecoder("utf-8");


/* ============================================================
   ZIP
   ============================================================ */

function findEndOfDirectory(bytes, view) {

    const floor = Math.max(0, bytes.length - 22 - 0xffff);

    for (let at = bytes.length - 22; at >= floor; at -= 1) {

        if (view.getUint32(at, true) === SIGNATURE_END_OF_DIRECTORY) {
            return at;
        }
    }

    return -1;
}


function readDirectory(bytes, view, label) {

    const end = findEndOfDirectory(bytes, view);

    if (end < 0) {
        throw new Error(`${label}: no zip end-of-directory record`);
    }

    const count = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true);

    const entries = new Map();

    for (let index = 0; index < count; index += 1) {

        if (view.getUint32(at, true) !== SIGNATURE_DIRECTORY_ENTRY) {
            throw new Error(`${label}: corrupt central directory`);
        }

        const method = view.getUint16(at + 10, true);
        const compressedSize = view.getUint32(at + 20, true);
        const nameLength = view.getUint16(at + 28, true);
        const extraLength = view.getUint16(at + 30, true);
        const commentLength = view.getUint16(at + 32, true);
        const offset = view.getUint32(at + 42, true);

        if (offset === ZIP64_SENTINEL || compressedSize === ZIP64_SENTINEL) {
            throw new Error(`${label}: zip64 archives are not supported`);
        }

        const name = utf8.decode(bytes.subarray(at + 46, at + 46 + nameLength));

        entries.set(name, { offset, method, compressedSize });

        at += 46 + nameLength + extraLength + commentLength;
    }

    return entries;
}


async function inflateRaw(bytes) {

    const stream = new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));

    const chunks = [];
    let total = 0;

    for await (const chunk of stream) {
        chunks.push(chunk);
        total += chunk.length;
    }

    const out = new Uint8Array(total);
    let at = 0;

    for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.length;
    }

    return out;
}


async function inflateEntry(bytes, view, entry, name, label) {

    if (view.getUint32(entry.offset, true) !== SIGNATURE_LOCAL_HEADER) {
        throw new Error(`${label}: corrupt local header for ${name}`);
    }

    const nameLength = view.getUint16(entry.offset + 26, true);
    const extraLength = view.getUint16(entry.offset + 28, true);

    const start = entry.offset + 30 + nameLength + extraLength;
    const payload = bytes.subarray(start, start + entry.compressedSize);

    if (entry.method === METHOD_STORED) {
        return payload;
    }

    if (entry.method === METHOD_DEFLATE) {
        return await inflateRaw(payload);
    }

    throw new Error(`${label}: ${name} uses compression method ${entry.method}`);
}


function openWorkbook(bytes, label) {

    if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        throw new Error(`${label}: not a zip archive`);
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const entries = readDirectory(bytes, view, label);

    return {
        async read(name) {

            const entry = entries.get(name);

            if (entry === undefined) {
                return null;
            }

            const inflated = await inflateEntry(bytes, view, entry, name, label);
            return utf8.decode(inflated);
        }
    };
}


/* ============================================================
   XML
   ============================================================ */

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

    const stripped = fragment.replace(/<rPh[\s\S]*?<\/rPh>/g, "");

    let text = "";

    const matcher = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let match;

    while ((match = matcher.exec(stripped)) !== null) {
        text += match[1];
    }

    return decodeXml(text);
}


function readSharedStrings(xml) {

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
            throw new Error(`shared string ${index} referenced but unavailable`);
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
 * Returns an array of rows in document order, each a sparse array
 * positioned by the cell's own column reference - see xlsx-read.js
 * for why this matters (non-contiguous row numbers, out-of-order or
 * omitted cells all land correctly).
 */
export async function readSheet(bytes, label, sheet = "xl/worksheets/sheet1.xml") {

    const workbook = openWorkbook(bytes, label);
    const sharedStrings = readSharedStrings(await workbook.read("xl/sharedStrings.xml"));

    const xml = await workbook.read(sheet);

    if (xml === null) {
        throw new Error(`${label}: ${sheet} is missing`);
    }

    const rows = [];

    const rowMatcher = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
    let rowMatch;

    while ((rowMatch = rowMatcher.exec(xml)) !== null) {

        const cells = [];
        const body = rowMatch[1] || "";

        const cellMatcher = /<c(?:\s([^>]*?))?(?:\/>|>([\s\S]*?)<\/c>)/g;
        let cellMatch;
        let fallbackIndex = 0;

        while ((cellMatch = cellMatcher.exec(body)) !== null) {

            const attributes = cellMatch[1] || "";
            const reference = /r="([A-Z]+)\d+"/.exec(attributes);

            const index = reference ? columnIndex(reference[1]) : fallbackIndex;

            cells[index] = cellValue(attributes, cellMatch[2] || "", sharedStrings);

            fallbackIndex = index + 1;
        }

        rows.push(cells);
    }

    return rows;
}
