/* ============================================================
   VEHICLE REGISTRATION ANALYTICS DASHBOARD
   File: /script.js

   Vanilla JavaScript + local PostgREST (no Supabase client)

   ------------------------------------------------------------
   SCHEMA (local vehicle_analytics database)

   Twelve tables, all WIDE and all Maker x Vehicle Class:
   Maker | <vehicle classes> | Total

       MAKER_WISE_2025              2,045 rows   72 classes
       MAKER_WISE_2026              1,949 rows   73 classes
       Gujarat_Class_Wise_2025        428 rows   59 classes
       Gujarat_Class_Wise_2026        434 rows   51 classes
       Maker_Class_Wise_GJ01_2025     147 rows   39 classes
       Maker_Class_Wise_GJ01_2026     131 rows   33 classes
       Maker_Class_Wise_GJ13_2025     110 rows   28 classes
       Maker_Class_Wise_GJ13_2026     119 rows   29 classes
       Maker_Class_Wise_GJ27_2025     148 rows   37 classes
       Maker_Class_Wise_GJ27_2026     127 rows   30 classes
       Maker_Class_Wise_GJ38_2025     151 rows   29 classes
       Maker_Class_Wise_GJ38_2026     141 rows   26 classes

   Scope (6) x Year (2) selects exactly one of them.

   ------------------------------------------------------------
   WHAT THE DATA CAN AND CANNOT DO

   maker x class   yes, per scope and year
   maker x month   NO TABLE EXISTS
   state x class   NO TABLE EXISTS
   maker x rto     NO TABLE EXISTS  (RTO here means scope, not
                                     a column dimension)

   Vahan drops classes with no entries, so the column set
   differs between tables - note the class counts above. The
   schema is therefore re-read from a sample row on every
   scope or year switch rather than assumed once.

   Reads page with .range() in 1,000-row chunks; the largest
   table is two round trips.
   ============================================================ */


/* ============================================================
   1. API CONFIGURATION
   ============================================================ */

/*
 * Local PostgREST in front of the vehicle_analytics Postgres.
 * No API key: the API exposes a read-only role and is bound to
 * localhost.
 */
const API_URL = "http://localhost:3003";


/* ============================================================
   2. TABLE CONFIGURATION
   ============================================================ */

/*
 * Every table is Maker x Vehicle Class. Scope and year together
 * pick one of them. Class columns differ per table - Vahan drops
 * classes with no entries - so the schema is re-read on each
 * switch rather than assumed.
 */
const SCOPE_TABLES = {
    all_india: { 2025: "MAKER_WISE_2025",            2026: "MAKER_WISE_2026" },
    gujarat:   { 2025: "Gujarat_Class_Wise_2025",    2026: "Gujarat_Class_Wise_2026" },
    gj01:      { 2025: "Maker_Class_Wise_GJ01_2025", 2026: "Maker_Class_Wise_GJ01_2026" },
    gj13:      { 2025: "Maker_Class_Wise_GJ13_2025", 2026: "Maker_Class_Wise_GJ13_2026" },
    gj27:      { 2025: "Maker_Class_Wise_GJ27_2025", 2026: "Maker_Class_Wise_GJ27_2026" },
    gj38:      { 2025: "Maker_Class_Wise_GJ38_2025", 2026: "Maker_Class_Wise_GJ38_2026" }
};


const AVAILABLE_YEARS = ["2026", "2025"];


function tableFor(scope, year) {

    const byYear = SCOPE_TABLES[scope] || SCOPE_TABLES[DEFAULT_VIEW];

    return byYear[year] || byYear[AVAILABLE_YEARS[0]];
}


/* ============================================================
   3. APPLICATION CONFIGURATION
   ============================================================ */

const CONFIG = {

    ALL: "all",

    PAGE_SIZE: 25,

    PAGE_SIZES: [25, 50, 100],

    SEARCH_DELAY: 150,

    MAX_SEARCH_ROWS: 5,

    /*
     * Reads page in these chunks. The largest table is ~2,000
     * rows, so this is two round trips at worst.
     */
    FETCH_PAGE_SIZE: 1000,

    MAX_FETCH_PAGES: 200
};


/*
 * Each view is one physical table, rendered with its own
 * columns. The default is MAKER_WISE.
 */
/*
 * One entry per scope. All are Maker x Class, so they differ
 * only in label - the shape of the view model is unchanged.
 */
function makeScope(id, label) {

    return {
        id,
        schemaKey: "makerClass",
        entityKind: "maker",
        entity: "Maker",
        entityPlural: "Makers",
        columnKind: "class",
        title: `${label} — Maker × Vehicle Class`,
        scopeLabel: label,
        searchPlaceholder: "Search maker..."
    };
}


const VIEWS = {
    all_india: makeScope("all_india", "All India"),
    gujarat:   makeScope("gujarat", "Gujarat"),
    gj01:      makeScope("gj01", "GJ01"),
    gj13:      makeScope("gj13", "GJ13"),
    gj27:      makeScope("gj27", "GJ27"),
    gj38:      makeScope("gj38", "GJ38")
};


const DEFAULT_VIEW = "all_india";


const METADATA_COLUMNS = [
    "id", "sr no", "sr_no", "srno",
    "maker", "maker name", "maker_name",
    "state", "state name", "state_name",
    "total", "grand total", "year"
];


const CLASS_GROUPS = [
    {
        id: "2W",
        label: "Two Wheeler (2W)",
        test: name => /m-?cycle|scooter|moped|motorised cycle/i.test(name)
    },
    {
        id: "3W",
        label: "Three Wheeler (3W)",
        test: name => /three wheeler|rickshaw/i.test(name)
    },
    {
        id: "CAR",
        label: "Car / Cab",
        test: name => /motor car|motor cab|maxi cab|luxury cab|quadricycle/i.test(name)
    },
    {
        id: "BUS",
        label: "Bus",
        test: name => /bus/i.test(name)
    },
    {
        id: "GOODS",
        label: "Goods & Commercial",
        test: name =>
            /goods|articulated|fork lift|crane|generator|fire|cash van|trailer|truck|dumper|tanker/i
                .test(name)
    },
    {
        id: "TRACTOR",
        label: "Tractor",
        test: name => /tractor|harvester|tiller/i.test(name)
    },
    {
        id: "CONSTRUCTION",
        label: "Construction & Equipment",
        test: name =>
            /construction|excavator|bulldozer|road roller|equipment|rig|compressor/i
                .test(name)
    },
    {
        id: "OTHER",
        label: "Other",
        test: () => true
    }
];


/* ============================================================
   4. REST CLIENT

   A small PostgREST client shaped like the query builder this
   file already used, so every call site stays as it was:
   client.from(t).select(cols).range(a, b).in(col, vals)
   ============================================================ */

let restClient = null;


class RestQuery {

    constructor(baseUrl, table) {

        this.baseUrl = baseUrl;
        this.table = table;
        this.params = new URLSearchParams();
        this.headers = {};
        this.signal = null;
        this.headOnly = false;
    }

    select(columns, options = {}) {

        this.params.set("select", columns || "*");

        if (options.count) {
            this.headers.Prefer = `count=${options.count}`;
        }

        if (options.head) {
            this.headOnly = true;
        }

        return this;
    }

    range(from, to) {

        this.headers["Range-Unit"] = "items";
        this.headers.Range = `${from}-${to}`;

        return this;
    }

    limit(count) {

        this.params.set("limit", String(count));

        return this;
    }

    /*
     * PostgREST wants in.("a","b") with inner quotes doubled.
     */
    in(column, values) {

        const list = values
            .map(value => `"${String(value).replace(/"/g, '""')}"`)
            .join(",");

        this.params.append(column, `in.(${list})`);

        return this;
    }

    abortSignal(signal) {

        this.signal = signal;

        return this;
    }

    async run() {

        const url =
            `${this.baseUrl}/${encodeURIComponent(this.table)}` +
            `?${this.params.toString()}`;

        let response;

        try {

            response = await fetch(url, {
                method: this.headOnly ? "HEAD" : "GET",
                headers: this.headers,
                signal: this.signal
            });

        } catch (error) {

            /*
             * Network-level failure - the API is down or
             * unreachable. Shaped like a PostgREST error so
             * callers need not care which it was.
             */
            return {
                data: null,
                count: null,
                error: { message: error.message, code: "FETCH_FAILED" }
            };
        }

        const range = response.headers.get("content-range");

        const count =
            range && range.includes("/")
                ? Number(range.split("/")[1])
                : null;

        if (!response.ok) {

            let message = `${response.status} ${response.statusText}`;

            try {
                const body = await response.json();
                if (body && body.message) {
                    message = body.message;
                }
            } catch (ignored) {
                /* non-JSON error body */
            }

            return {
                data: null,
                count,
                error: { message, code: String(response.status) }
            };
        }

        if (this.headOnly) {
            return { data: null, count, error: null };
        }

        return { data: await response.json(), count, error: null };
    }

    then(resolve, reject) {

        return this.run().then(resolve, reject);
    }
}


function createRestClient(baseUrl) {

    return {
        from: table => new RestQuery(baseUrl, table)
    };
}


/* ============================================================
   5. APPLICATION STATE
   ============================================================ */

const state = {

    initialized: false,
    wired: false,
    retryWired: false,

    loading: false,

    requestId: 0,

    activeController: null,

    view: DEFAULT_VIEW,

    year: AVAILABLE_YEARS[0],

    /*
     * Rendered column set: index, entity, one per value column,
     * then total. Rebuilt whenever the table or its column
     * filters change.
     */
    columns: [],

    filters: {
        fromYear: CONFIG.ALL,
        toYear: CONFIG.ALL,
        makers: [],
        state: CONFIG.ALL,
        region: CONFIG.ALL,
        month: CONFIG.ALL,
        category: CONFIG.ALL,
        subcategory: CONFIG.ALL
    },

    /*
     * Resolved at startup from one sample row per table.
     */
    schema: {
        makerMonth: null,
        makerRto: null,
        makerClass: null,
        stateMonth: null,
        stateClass: null
    },

    /*
     * Class taxonomy, rebuilt whenever the active class source
     * changes (33 EV classes vs 76 national ones).
     */
    classSource: null,
    classColumns: [],
    classToGroup: new Map(),
    groupToClasses: new Map(),

    availableYears: [],
    months: [],
    makers: [],
    states: [],

    /*
     * RTO list is ~95 paged requests, so it loads in the
     * background after first paint.
     */
    regions: [],
    regionsLoading: false,
    regionsLoaded: false,

    /*
     * Cached wide tables, keyed by table name.
     */
    tableCache: new Map(),

    rows: [],
    filteredRows: [],
    dimensionTotal: 0,

    searchTerms: [""],

    /*
     * Opens in source-row order so the table mirrors the
     * originating workbook. Any header re-sorts it.
     */
    sortKey: "__index",
    sortDirection: "asc",

    currentPage: 1,
    pageSize: CONFIG.PAGE_SIZE,

    searchTimer: null,

    kpis: emptyKPIs()
};


function emptyKPIs() {

    return {
        totalRegistrations: 0,
        totalEntities: 0,
        twoWRegistrations: null,
        threeWRegistrations: null,
        twoWPercentage: null,
        threeWPercentage: null,
        classNote: ""
    };
}


function currentView() {

    return VIEWS[state.view] || VIEWS[DEFAULT_VIEW];
}


function currentSchema() {

    return state.schema[currentView().schemaKey] || null;
}


function isStateView() {

    return currentView().entityKind === "state";
}


/*
 * Region overrides the table entirely - RTO data lives in a
 * long table, so it renders as a single value column.
 */
function regionIsActive() {

    return (
        !isStateView() &&
        Boolean(state.schema.makerRto) &&
        !isAll(state.filters.region)
    );
}


/* ============================================================
   6. DOM CACHE
   ============================================================ */

const dom = {};


function cacheDOM() {

    const ids = [

        /* Filters */
        "breakdownFilter",
        "yearFilter",
        "fromYearFilter",
        "toYearFilter",
        "yearRangeError",
        "makerFilter",
        "stateFilter",
        "monthFilter",
        "regionFilter",
        "categoryFilter",
        "subcategoryFilter",
        "clearFiltersButton",
        "stateFilterGroup",
        "monthFilterGroup",
        "regionFilterGroup",
        "categoryFilterGroup",
        "subcategoryFilterGroup",
        "filterNotice",

        /* Table */
        "makerSummaryTable",
        "makerSummaryTableHead",
        "makerSummaryTableBody",
        "makerSummaryTableFoot",
        "makerSearchList",
        "searchRowTemplate",
        "resultCount",
        "tableContent",
        "maker-summary-title",

        /* Pagination */
        "previousPageButton",
        "nextPageButton",
        "pageIndicator",
        "pageSizeSelect",

        /* KPIs */
        "totalRegistrations",
        "totalMakers",
        "entityCountLabel",
        "entityCountMeta",
        "twoWRegistrations",
        "threeWRegistrations",
        "twoWPercentage",
        "threeWPercentage",

        /* Header */
        "data-year-range",
        "activeFilters",
        "datasetNote",

        /* Loading */
        "globalLoading",
        "tableLoading",

        /* Error / empty */
        "errorMessage",
        "errorMessageText",
        "retryButton",
        "tableEmpty",
        "tableEmptyText",
        "tableError",
        "tableErrorText"
    ];

    ids.forEach(id => {
        dom[id] = document.getElementById(id);
    });
}


/* ============================================================
   7. GENERAL HELPERS
   ============================================================ */

function toNumber(value) {

    if (value === null || value === undefined || value === "") {
        return 0;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }

    const cleaned = String(value).replace(/,/g, "").trim();
    const number = Number(cleaned);

    return Number.isFinite(number) ? number : 0;
}


function formatIndianNumber(value) {

    return new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 0
    }).format(toNumber(value));
}


function formatPercentage(value) {

    if (value === null || value === undefined || value === "") {
        return "—";
    }

    return `${toNumber(value).toFixed(2)}%`;
}


/*
 * Market share is measured against the whole filtered set, not
 * the visible page - the denominator is the same figure the
 * totals row prints at the foot of the column.
 */
function formatShare(value, columnTotal) {

    const denominator = toNumber(columnTotal);

    if (denominator <= 0) {
        return "—";
    }

    return formatPercentage((toNumber(value) / denominator) * 100);
}


function normalizeString(value) {

    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}


function normalizeKey(value) {

    return normalizeString(value).toLowerCase().replace(/\s+/g, " ");
}


function isAll(value) {

    const normalized = normalizeString(value).toLowerCase();

    return normalized === "" || normalized === "all";
}


function normalizeFilter(value) {

    return isAll(value) ? CONFIG.ALL : normalizeString(value);
}


function isMetadataColumn(name) {

    const key = normalizeKey(name);

    return METADATA_COLUMNS.some(
        candidate => normalizeKey(candidate) === key
    );
}


function uniqueSorted(values) {

    return [
        ...new Set(values.map(normalizeString).filter(Boolean))
    ].sort((a, b) =>
        a.localeCompare(b, undefined, {
            numeric: true,
            sensitivity: "base"
        })
    );
}


function quoteColumn(name) {

    return `"${String(name).replace(/"/g, '""')}"`;
}


/*
 * RTO values are stored as slugs: abu_road_dto -> ABU ROAD DTO.
 */
function prettifyRegion(slug) {

    return normalizeString(slug).replace(/_/g, " ").toUpperCase();
}


function sumColumns(row, columns) {

    if (!Array.isArray(columns) || columns.length === 0) {
        return 0;
    }

    return columns.reduce(
        (total, column) => total + toNumber(row[column]),
        0
    );
}


/* ============================================================
   8. COLUMN RESOLUTION
   ============================================================ */

function findColumn(row, candidates) {

    if (!row || typeof row !== "object") {
        return null;
    }

    const keys = Object.keys(row);

    for (const candidate of candidates) {
        const exact = keys.find(key => key === candidate);
        if (exact) {
            return exact;
        }
    }

    for (const candidate of candidates) {
        const normalized = normalizeKey(candidate);
        const match = keys.find(key => normalizeKey(key) === normalized);
        if (match) {
            return match;
        }
    }

    return null;
}


function getEntityColumn(row, kind) {

    return kind === "state"
        ? findColumn(row, ["State", "STATE", "state", "State Name"])
        : findColumn(row, ["Maker", "MAKER", "maker", "Maker Name", "maker_name"]);
}


function getTotalColumn(row) {

    return findColumn(row, [
        "Total", "TOTAL", "total", "Grand Total", "GRAND TOTAL"
    ]);
}


/*
 * Month columns look like 2026-Jan.
 */
function isMonthColumn(name) {

    return /^\d{4}[-_ ](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i
        .test(normalizeString(name));
}


/* ============================================================
   9. API INITIALIZATION
   ============================================================ */

async function initializeApi() {

    restClient = createRestClient(API_URL);

    return restClient;
}


/* ============================================================
   10. FETCH HELPERS
   ============================================================ */

function buildSelect(columns) {

    return Array.isArray(columns) && columns.length > 0
        ? columns.map(quoteColumn).join(",")
        : "*";
}


/*
 * Wraps an API error, keeping the machine-readable code so the
 * UI can tell "the database is down" apart from "that one table
 * is missing". Without this the code is lost in the message.
 */
function apiError(table, error) {

    const wrapped = new Error(`${table}: ${error.message}`);

    wrapped.code = error.code;
    wrapped.table = table;

    return wrapped;
}


async function fetchPage(table, select, from, to, options = {}) {

    const { filters = [], signal = null } = options;

    let query = restClient.from(table).select(select).range(from, to);

    filters.forEach(filter => {
        query = query.in(filter.column, filter.values);
    });

    if (signal) {
        query = query.abortSignal(signal);
    }

    const { data, error } = await query;

    if (error) {
        throw apiError(table, error);
    }

    return Array.isArray(data) ? data : [];
}


/*
 * Sequential paging - right for tables of a few thousand rows.
 */
async function fetchAllRows(table, columns, options = {}) {

    const select = buildSelect(columns);
    const rows = [];

    for (let page = 0; page < CONFIG.MAX_FETCH_PAGES; page += 1) {

        const from = page * CONFIG.FETCH_PAGE_SIZE;

        const data = await fetchPage(
            table,
            select,
            from,
            from + CONFIG.FETCH_PAGE_SIZE - 1,
            options
        );

        rows.push(...data);

        if (data.length < CONFIG.FETCH_PAGE_SIZE) {
            break;
        }
    }

    return rows;
}


async function fetchSampleRow(table) {

    const { data, error } = await restClient
        .from(table)
        .select("*")
        .limit(1);

    if (error) {
        throw apiError(table, error);
    }

    return Array.isArray(data) && data.length > 0 ? data[0] : null;
}


async function fetchRowCount(table) {

    const { count, error } = await restClient
        .from(table)
        .select("*", { count: "exact", head: true });

    if (error) {
        throw apiError(table, error);
    }

    return count || 0;
}


/*
 * Whole small/medium tables are cached - the dashboard reads
 * the same ones repeatedly as filters change.
 */
async function getCachedTable(table, columns, signal) {

    if (state.tableCache.has(table)) {
        return state.tableCache.get(table);
    }

    const rows = await fetchAllRows(table, columns, { signal });

    state.tableCache.set(table, rows);

    return rows;
}


/* ============================================================
   11. SCHEMA DISCOVERY
   ============================================================ */

async function describeWideTable(table, entityKind) {

    const sample = await fetchSampleRow(table);

    if (!sample) {
        return null;
    }

    const entityColumn = getEntityColumn(sample, entityKind);

    if (!entityColumn) {
        return null;
    }

    const totalColumn = getTotalColumn(sample);

    /*
     * The source row number. Using it rather than a positional
     * counter keeps the on-screen Sr No. identical to the
     * originating workbook.
     */
    const srNoColumn = findColumn(sample, [
        "SR_NO", "Sr No", "sr_no", "SRNO", "srno", "Sr. No."
    ]);

    const valueColumns = Object.keys(sample).filter(
        column =>
            column !== entityColumn &&
            column !== totalColumn &&
            !isMetadataColumn(column)
    );

    return {
        table,
        entityColumn,
        totalColumn,
        srNoColumn,
        valueColumns,
        monthColumns: valueColumns.filter(isMonthColumn),
        classColumns: valueColumns.filter(column => !isMonthColumn(column))
    };
}


/*
 * Only the selected scope+year table is described. Class columns
 * vary between tables, so this re-runs on every switch rather
 * than caching one shape for the whole session.
 */
async function discoverSchema() {

    const table = tableFor(state.view, state.year);

    const makerClass = await describeWideTable(table, "maker");

    if (!makerClass) {
        throw new Error(
            `${table} is unavailable, so maker totals cannot be loaded.`
        );
    }

    state.schema.makerClass = makerClass;

    /* No month, state or RTO tables in this database. */
    state.schema.makerMonth = null;
    state.schema.stateMonth = null;
    state.schema.stateClass = null;
    state.schema.makerRto = null;

    state.availableYears = AVAILABLE_YEARS.slice();
}


/* ============================================================
   12. CLASS TAXONOMY
   ============================================================ */

/*
 * The class list depends on the view: 33 electric-only classes
 * from MAKER_WISE, or 76 national ones from the state table.
 */
function getClassSchema() {

    /*
     * When the displayed table already carries classes it IS the
     * class schema; otherwise pair the view with the class table
     * for the same entity kind.
     */
    if (currentView().columnKind === "class") {
        return currentSchema();
    }

    return isStateView() ? state.schema.stateClass : state.schema.makerClass;
}


function buildClassGroups() {

    const schema = getClassSchema();

    state.classSource = schema ? schema.table : null;
    state.classColumns = schema ? schema.classColumns : [];

    state.classToGroup = new Map();
    state.groupToClasses = new Map();

    state.classColumns.forEach(className => {

        const group =
            CLASS_GROUPS.find(candidate => candidate.test(className)) ||
            CLASS_GROUPS[CLASS_GROUPS.length - 1];

        state.classToGroup.set(className, group.id);

        if (!state.groupToClasses.has(group.id)) {
            state.groupToClasses.set(group.id, []);
        }

        state.groupToClasses.get(group.id).push(className);
    });
}


function getClassesForGroupLabel(label) {

    const group = CLASS_GROUPS.find(
        candidate => normalizeKey(candidate.label) === normalizeKey(label)
    );

    if (!group) {
        return [];
    }

    return state.groupToClasses.get(group.id) || [];
}


/*
 * True when the active class source is the electric-only table.
 */
function classSourceIsElectricOnly() {

    return false;
}


/*
 * Resolves a class group against a SPECIFIC schema's columns.
 *
 * The KPI cards and the table can legitimately read different
 * class tables - 33 electric classes vs 76 national ones - and
 * the two use different column names, so a group must always be
 * expanded against the schema whose rows are being summed.
 */
function groupColumnsFor(schema, groupId) {

    if (!schema) {
        return [];
    }

    const group = CLASS_GROUPS.find(candidate => candidate.id === groupId);

    if (!group) {
        return [];
    }

    return schema.classColumns.filter(column => {

        const matched =
            CLASS_GROUPS.find(candidate => candidate.test(column)) ||
            CLASS_GROUPS[CLASS_GROUPS.length - 1];

        return matched.id === groupId;
    });
}


/* ============================================================
   12b. SEARCHABLE FILTER DROPDOWNS

   A native <select> cannot filter as you type, so each of these
   filters gets a combobox layered over it. The <select> itself
   stays in the DOM as the single source of truth - it still
   holds the value and still emits "change" - so every existing
   filter path keeps working untouched.
   ============================================================ */

const SEARCHABLE_FILTERS = [
    "makerFilter",
    "stateFilter",
    "monthFilter",
    "regionFilter",
    "categoryFilter",
    "subcategoryFilter"
];

/*
 * Long lists are capped so opening a 1,900-entry dropdown does
 * not build 1,900 nodes.
 */
const COMBO_RENDER_LIMIT = 200;

const combos = new Map();


function enhanceFilterSelects() {

    SEARCHABLE_FILTERS.forEach(id => {

        const select = dom[id];

        if (!select || combos.has(select)) {
            return;
        }

        combos.set(select, createCombo(select));
    });
}


function createCombo(select) {

    const wrapper = document.createElement("div");
    wrapper.className = "combo";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "combo__input";
    input.id = `${select.id}Combo`;
    input.autocomplete = "off";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", `${select.id}List`);

    const list = document.createElement("ul");
    list.className = "combo__list";
    list.id = `${select.id}List`;
    list.setAttribute("role", "listbox");
    list.hidden = true;

    /*
     * The select stays put and keeps its id; it is simply taken
     * out of the tab order and hidden from assistive tech, with
     * the combobox standing in for it.
     */
    select.classList.add("combo__native");
    select.setAttribute("tabindex", "-1");
    select.setAttribute("aria-hidden", "true");

    const parent = select.parentNode;

    if (parent) {
        parent.insertBefore(wrapper, select);
        wrapper.appendChild(select);
    }

    wrapper.appendChild(input);
    wrapper.appendChild(list);

    /*
     * Point the existing label at the combobox so clicking it
     * still focuses the control the user actually types into.
     */
    const label = parent?.querySelector(`label[for="${select.id}"]`);

    if (label) {
        label.setAttribute("for", input.id);
    }

    const combo = {
        select,
        wrapper,
        input,
        list,
        options: [],
        matches: [],
        activeIndex: -1,
        open: false
    };

    wireCombo(combo);
    refreshCombo(select);

    return combo;
}


function comboLabelForValue(combo, value) {

    const match = combo.options.find(option => option.value === value);

    return match ? match.label : "";
}


/*
 * Mirrors the <select> into the combobox: option list, current
 * label and disabled state.
 */
function refreshCombo(select) {

    const combo = combos.get(select);

    if (!combo) {
        return;
    }

    combo.options = [...select.options].map(option => ({
        value: option.value,
        label: option.textContent.trim()
    }));

    combo.input.value = comboLabelForValue(combo, select.value);
    combo.input.placeholder = comboLabelForValue(combo, CONFIG.ALL) || "Search...";

    combo.input.disabled = select.disabled;
    combo.wrapper.classList.toggle("combo--disabled", select.disabled);

    if (select.disabled) {
        closeCombo(combo);
    }
}


function refreshAllCombos() {

    combos.forEach(combo => refreshCombo(combo.select));
}


function filterComboOptions(combo, query) {

    const term = normalizeKey(query);

    if (!term) {
        return combo.options;
    }

    const prefix = [];
    const contains = [];

    combo.options.forEach(option => {

        const label = normalizeKey(option.label);
        const index = label.indexOf(term);

        if (index === 0) {
            prefix.push(option);
        } else if (index > 0) {
            contains.push(option);
        }
    });

    /*
     * Prefix matches first, each group keeping the original
     * (alphabetical) order.
     */
    return [...prefix, ...contains];
}


function renderComboList(combo, query) {

    combo.matches = filterComboOptions(combo, query);
    combo.list.innerHTML = "";

    if (combo.matches.length === 0) {

        const empty = document.createElement("li");
        empty.className = "combo__empty";
        empty.textContent = "No matches";
        combo.list.appendChild(empty);

        combo.activeIndex = -1;
        combo.input.removeAttribute("aria-activedescendant");

        return;
    }

    const visible = combo.matches.slice(0, COMBO_RENDER_LIMIT);

    const fragment = document.createDocumentFragment();

    visible.forEach((option, index) => {

        const item = document.createElement("li");

        item.className = "combo__option";
        item.id = `${combo.select.id}Option${index}`;
        item.setAttribute("role", "option");
        item.setAttribute("data-value", option.value);
        item.textContent = option.label;

        if (option.value === combo.select.value) {
            item.classList.add("combo__option--selected");
            item.setAttribute("aria-selected", "true");
        } else {
            item.setAttribute("aria-selected", "false");
        }

        if (index === combo.activeIndex) {
            item.classList.add("combo__option--active");
        }

        fragment.appendChild(item);
    });

    combo.list.appendChild(fragment);

    if (combo.matches.length > visible.length) {

        const more = document.createElement("li");
        more.className = "combo__more";

        more.textContent =
            `Showing ${formatIndianNumber(visible.length)} of ` +
            `${formatIndianNumber(combo.matches.length)} — keep typing`;

        combo.list.appendChild(more);
    }
}


function openCombo(combo) {

    if (combo.select.disabled || combo.open) {
        return;
    }

    combo.open = true;
    combo.list.hidden = false;
    combo.input.setAttribute("aria-expanded", "true");

    /*
     * Start from the current selection so arrow keys continue
     * from where the user already is.
     */
    combo.activeIndex = combo.matches.findIndex(
        option => option.value === combo.select.value
    );

    renderComboList(combo, "");
}


function closeCombo(combo) {

    if (!combo.open) {
        return;
    }

    combo.open = false;
    combo.list.hidden = true;
    combo.activeIndex = -1;

    combo.input.setAttribute("aria-expanded", "false");
    combo.input.removeAttribute("aria-activedescendant");

    /*
     * Restore the label - a half-typed query should not look
     * like a selection.
     */
    combo.input.value = comboLabelForValue(combo, combo.select.value);
}


function setActiveComboOption(combo, index) {

    const rendered = [
        ...combo.list.querySelectorAll(".combo__option")
    ];

    if (rendered.length === 0) {
        return;
    }

    const clamped = Math.max(0, Math.min(index, rendered.length - 1));

    combo.activeIndex = clamped;

    rendered.forEach((item, position) => {
        item.classList.toggle("combo__option--active", position === clamped);
    });

    const active = rendered[clamped];

    combo.input.setAttribute("aria-activedescendant", active.id);

    if (typeof active.scrollIntoView === "function") {
        active.scrollIntoView({ block: "nearest" });
    }
}


function commitComboValue(combo, value) {

    if (combo.select.value === value) {
        closeCombo(combo);
        return;
    }

    combo.select.value = value;

    closeCombo(combo);

    combo.input.value = comboLabelForValue(combo, value);

    /*
     * Drives the existing change listeners, so the dashboard
     * reloads exactly as it does for a native select.
     */
    combo.select.dispatchEvent(new Event("change", { bubbles: true }));
}


function wireCombo(combo) {

    const { input, list } = combo;

    input.addEventListener("focus", () => {
        openCombo(combo);
        input.select();
    });

    input.addEventListener("click", () => {
        openCombo(combo);
    });

    input.addEventListener("input", () => {
        if (!combo.open) {
            combo.open = true;
            combo.list.hidden = false;
            combo.input.setAttribute("aria-expanded", "true");
        }
        combo.activeIndex = 0;
        renderComboList(combo, input.value);
        setActiveComboOption(combo, 0);
    });

    input.addEventListener("keydown", event => {

        if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!combo.open) {
                openCombo(combo);
            }
            setActiveComboOption(combo, combo.activeIndex + 1);
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveComboOption(combo, combo.activeIndex - 1);
            return;
        }

        if (event.key === "Home" && combo.open) {
            event.preventDefault();
            setActiveComboOption(combo, 0);
            return;
        }

        if (event.key === "End" && combo.open) {
            event.preventDefault();
            setActiveComboOption(combo, combo.matches.length - 1);
            return;
        }

        if (event.key === "Enter") {

            if (!combo.open) {
                return;
            }

            event.preventDefault();

            const active = combo.list.querySelector(".combo__option--active") ||
                combo.list.querySelector(".combo__option");

            if (active) {
                commitComboValue(combo, active.getAttribute("data-value"));
            }

            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            closeCombo(combo);
            return;
        }

        if (event.key === "Tab") {
            closeCombo(combo);
        }
    });

    list.addEventListener("mousedown", event => {

        /*
         * mousedown, not click - otherwise the input blurs and
         * closes the list before the click lands.
         */
        const option = event.target.closest(".combo__option");

        if (!option) {
            return;
        }

        event.preventDefault();

        commitComboValue(combo, option.getAttribute("data-value"));
    });

    input.addEventListener("blur", () => {
        window.setTimeout(() => closeCombo(combo), 0);
    });
}


function setupComboDismiss() {

    document.addEventListener("mousedown", event => {

        combos.forEach(combo => {

            if (combo.open && !combo.wrapper.contains(event.target)) {
                closeCombo(combo);
            }
        });
    });
}


/* ============================================================
   13. FILTER OPTIONS
   ============================================================ */

function populateSelect(select, values, allLabel, selectedValue = CONFIG.ALL) {

    if (!select) {
        return;
    }

    select.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = CONFIG.ALL;
    allOption.textContent = allLabel;
    select.appendChild(allOption);

    values.forEach(entry => {

        const value = typeof entry === "string" ? entry : entry.value;
        const label = typeof entry === "string" ? entry : entry.label;

        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    });

    const values2 = values.map(
        entry => (typeof entry === "string" ? entry : entry.value)
    );

    select.value =
        !isAll(selectedValue) && values2.includes(selectedValue)
            ? selectedValue
            : CONFIG.ALL;

    refreshCombo(select);
}


function setGroupVisible(group, visible) {

    if (group) {
        group.hidden = !visible;
    }
}


/*
 * The entity list is read from the table CURRENTLY on screen,
 * not from a fixed table. Offering makers that the displayed
 * table does not contain would silently return no rows - the
 * EV table has 904 makers where the month table has 1,931.
 */
async function loadEntityOptions(signal) {

    const schema = currentSchema();

    if (!schema) {
        return;
    }

    const columns = [schema.entityColumn, schema.totalColumn];

    if (schema.srNoColumn) {
        columns.unshift(schema.srNoColumn);
    }

    const rows = await getCachedTable(
        schema.table,
        [...columns, ...schema.valueColumns],
        signal
    );

    const names = uniqueSorted(rows.map(row => row[schema.entityColumn]));

    if (isStateView()) {

        state.states = names;

        populateSelect(
            dom.stateFilter,
            names,
            "All States",
            dom.stateFilter?.value
        );

    } else {

        state.makers = names;

        populateSelect(
            dom.makerFilter,
            names,
            "All Makers",
            dom.makerFilter?.value
        );
    }
}


function loadMonths() {

    const schema = currentSchema();

    state.months =
        schema && currentView().columnKind === "month"
            ? schema.monthColumns
            : [];

    populateSelect(dom.monthFilter, state.months, "All Months");

    setGroupVisible(dom.monthFilterGroup, state.months.length > 0);
}


function loadClassFilters() {

    buildClassGroups();

    const categories = CLASS_GROUPS
        .filter(group => (state.groupToClasses.get(group.id) || []).length > 0)
        .map(group => group.label);

    populateSelect(dom.categoryFilter, categories, "All Categories");
    setGroupVisible(dom.categoryFilterGroup, categories.length > 0);

    const classes = uniqueSorted(state.classColumns);

    populateSelect(dom.subcategoryFilter, classes, "All Subcategories");
    setGroupVisible(dom.subcategoryFilterGroup, classes.length > 0);
}


async function loadFilterOptions(signal) {

    await loadEntityOptions(signal);

    loadYears();
    loadMonths();
    loadClassFilters();

    applyViewVisibility();
    updateFilterNotice();
}


function loadYears() {

    updateYearRangeHeader();
}


/* ============================================================
   14. READ FILTERS
   ============================================================ */

function getSelectedMakersFromUI() {

    const values = [];

    if (dom.makerFilter) {

        const value = normalizeString(dom.makerFilter.value);

        if (value && !isAll(value)) {
            values.push(value);
        }
    }

    document.querySelectorAll("[data-maker-filter]").forEach(control => {

        const value = normalizeString(control.value);

        if (value && !isAll(value)) {
            values.push(value);
        }
    });

    return uniqueSorted(values);
}


function readFiltersFromUI() {

    state.view =
        dom.breakdownFilter && VIEWS[dom.breakdownFilter.value]
            ? dom.breakdownFilter.value
            : DEFAULT_VIEW;

    state.year =
        dom.yearFilter && AVAILABLE_YEARS.includes(dom.yearFilter.value)
            ? dom.yearFilter.value
            : AVAILABLE_YEARS[0];

    state.filters = {

        fromYear: CONFIG.ALL,
        toYear: CONFIG.ALL,

        makers: getSelectedMakersFromUI(),

        state: CONFIG.ALL,

        region: CONFIG.ALL,

        month: normalizeFilter(dom.monthFilter?.value),

        category: normalizeFilter(dom.categoryFilter?.value),

        subcategory: normalizeFilter(dom.subcategoryFilter?.value)
    };

    return state.filters;
}


function displayYearError(message) {

    if (!dom.yearRangeError) {
        displayError(message);
        return;
    }

    dom.yearRangeError.textContent = message;
    dom.yearRangeError.hidden = false;
}


function clearYearError() {

    if (dom.yearRangeError) {
        dom.yearRangeError.textContent = "";
        dom.yearRangeError.hidden = true;
    }
}


/* ============================================================
   15. VIEW + FILTER COMPATIBILITY
   ============================================================ */

/*
 * State, region and month have no backing table in this
 * database, so their controls stay hidden. The year-range pair
 * is replaced by the single Year select.
 */
function applyViewVisibility() {

    setGroupVisible(dom.stateFilterGroup, false);
    setGroupVisible(dom.regionFilterGroup, false);
    setGroupVisible(dom.monthFilterGroup, false);

    const yearRange = dom.fromYearFilter?.closest(".year-range-filters");

    if (yearRange) {
        yearRange.hidden = true;
    }

    const makerGroup = dom.makerFilter?.closest(".filter-group");

    if (makerGroup) {
        makerGroup.hidden = false;
    }
}


/*
 * Only one breakdown dimension can be active, because no table
 * crosses them: region comes from the RTO table, month from the
 * month tables, class from the class tables.
 */
function enforceFilterCompatibility() {

    const regionSelected =
        !isStateView() && !isAll(dom.regionFilter?.value);

    /*
     * Column filters belong to whichever table is on screen -
     * a month table has no classes and vice versa. Region
     * replaces the table outright, so it disables both.
     */
    if (dom.monthFilter) {
        dom.monthFilter.disabled = regionSelected;
    }

    if (dom.categoryFilter) {
        dom.categoryFilter.disabled = regionSelected;
    }

    if (dom.subcategoryFilter) {
        dom.subcategoryFilter.disabled = regionSelected;
    }

    if (dom.regionFilter) {
        dom.regionFilter.disabled = state.regionsLoading;
    }

    refreshAllCombos();

    updateFilterNotice();
}


function updateFilterNotice() {

    if (!dom.filterNotice) {
        return;
    }

    const messages = [];

    /*
     * Vahan drops classes with no entries, so each scope+year
     * table carries a different column set. Say so, since the
     * column count visibly changes when switching.
     */
    const schema = currentSchema();

    if (schema) {
        messages.push(
            `${currentView().scopeLabel} ${state.year}: ` +
            `${schema.classColumns.length} vehicle classes with ` +
            "registrations. Other scopes and years differ."
        );
    }

    if (messages.length === 0) {
        dom.filterNotice.hidden = true;
        dom.filterNotice.textContent = "";
        return;
    }

    dom.filterNotice.hidden = false;
    dom.filterNotice.textContent = messages.join(" ");
}


/* ============================================================
   16. VISIBLE COLUMNS

   The table shows the source table's own columns. The Month /
   Category / Subcategory controls narrow WHICH columns are
   shown rather than collapsing the table to a single number.
   ============================================================ */

function getVisibleValueColumns() {

    const schema = currentSchema();

    if (!schema) {
        return [];
    }

    const view = currentView();

    if (view.columnKind === "month") {

        const month = state.filters.month;

        return isAll(month)
            ? schema.monthColumns
            : schema.monthColumns.filter(column => column === month);
    }

    const { category, subcategory } = state.filters;

    if (!isAll(subcategory)) {
        return schema.classColumns.filter(column => column === subcategory);
    }

    if (!isAll(category)) {

        const allowed = getClassesForGroupLabel(category);

        return schema.classColumns.filter(column => allowed.includes(column));
    }

    return schema.classColumns;
}


/*
 * Column descriptors drive the header, the body and the totals
 * row, so all three stay in lockstep.
 */
function buildColumns(valueColumns, { regionLabel = null } = {}) {

    const view = currentView();

    const columns = [
        { key: "__index", label: "Sr No.", type: "index" },
        { key: "__entity", label: view.entity, type: "entity" }
    ];

    if (regionLabel) {

        columns.push({
            key: "__region",
            label: regionLabel,
            type: "value"
        });

    } else {

        valueColumns.forEach(column => {
            columns.push({ key: column, label: column, type: "value" });
        });
    }

    columns.push({ key: "__total", label: "Total", type: "total" });

    return columns;
}


/* ============================================================
   17. DATA FETCHING
   ============================================================ */

function matchesEntityFilter(entity) {

    if (isStateView()) {

        const selected = state.filters.state;

        return (
            isAll(selected) ||
            normalizeKey(selected) === normalizeKey(entity)
        );
    }

    const makers = state.filters.makers;

    if (makers.length === 0) {
        return true;
    }

    return makers.some(
        maker => normalizeKey(maker) === normalizeKey(entity)
    );
}


async function fetchDashboardData(filters, signal) {

    /* --- Region overrides the table: long RTO data ------- */

    if (regionIsActive()) {

        const schema = state.schema.makerRto;
        const region = filters.region;

        const serverFilters = [
            { column: schema.regionColumn, values: [region] }
        ];

        if (filters.makers.length > 0) {
            serverFilters.push({
                column: schema.makerColumn,
                values: filters.makers
            });
        }

        const raw = await fetchAllRows(
            schema.table,
            [schema.makerColumn, schema.valueColumn],
            { signal, filters: serverFilters }
        );

        const columns = buildColumns([], {
            regionLabel: prettifyRegion(region)
        });

        const rows = raw.map(row => ({
            entity: normalizeString(row[schema.makerColumn]),
            values: { __region: toNumber(row[schema.valueColumn]) }
        }));

        return {
            rows,
            columns,
            sourceTable: schema.table,
            classRows: null,
            classSchema: null
        };
    }

    /* --- Otherwise: the selected wide table -------------- */

    const schema = currentSchema();

    if (!schema) {
        return {
            rows: [],
            columns: buildColumns([]),
            sourceTable: null,
            classRows: null,
            classSchema: null
        };
    }

    const valueColumns = getVisibleValueColumns();

    const selectColumns = [
        schema.entityColumn,
        schema.totalColumn,
        ...schema.valueColumns
    ];

    if (schema.srNoColumn) {
        selectColumns.unshift(schema.srNoColumn);
    }

    const raw = await getCachedTable(schema.table, selectColumns, signal);

    const rows = raw.map(row => {

        const values = {};

        valueColumns.forEach(column => {
            values[column] = toNumber(row[column]);
        });

        return {
            entity: normalizeString(row[schema.entityColumn]),
            srNo: schema.srNoColumn ? toNumber(row[schema.srNoColumn]) : null,
            values
        };
    });

    /*
     * KPI class data. When the displayed table already carries
     * classes, reuse it; otherwise borrow the matching class
     * table for the same entity kind.
     */
    let classSchema = null;
    let classRows = null;

    if (currentView().columnKind === "class") {

        classSchema = schema;
        classRows = raw;

    } else {

        classSchema = isStateView()
            ? state.schema.stateClass
            : state.filters.makers.length === 0 && state.schema.stateClass
                ? state.schema.stateClass
                : state.schema.makerClass;

        if (classSchema) {

            try {

                classRows = await getCachedTable(
                    classSchema.table,
                    [
                        classSchema.entityColumn,
                        classSchema.totalColumn,
                        ...classSchema.classColumns
                    ],
                    signal
                );

            } catch (error) {

                console.warn("Class KPI data unavailable:", error.message);

                classRows = null;
                classSchema = null;
            }
        }
    }

    return {
        rows,
        columns: buildColumns(valueColumns),
        sourceTable: schema.table,
        classRows,
        classSchema
    };
}


/* ============================================================
   18. AGGREGATION
   ============================================================ */

/*
 * Collapses duplicate entities, applies the entity filter, and
 * computes each row's Total as the sum of its VISIBLE columns -
 * so narrowing to one category gives a Total for that category
 * rather than the table's own untouched grand total.
 */
function aggregateRows(rows, columns) {

    const valueKeys = columns
        .filter(column => column.type === "value")
        .map(column => column.key);

    const map = new Map();

    rows.forEach(row => {

        const entity = normalizeString(row.entity);

        if (!entity || !matchesEntityFilter(entity)) {
            return;
        }

        const key = normalizeKey(entity);

        if (!map.has(key)) {
            map.set(key, {
                entity,
                srNo: row.srNo ?? null,
                values: {},
                total: 0
            });
        }

        const target = map.get(key);

        /*
         * Duplicates keep the lowest source row number.
         */
        if (
            row.srNo !== null &&
            row.srNo !== undefined &&
            (target.srNo === null || row.srNo < target.srNo)
        ) {
            target.srNo = row.srNo;
        }

        valueKeys.forEach(valueKey => {

            target.values[valueKey] =
                toNumber(target.values[valueKey]) +
                toNumber(row.values[valueKey]);
        });
    });

    const result = [];

    map.forEach(row => {

        row.total = valueKeys.reduce(
            (sum, valueKey) => sum + toNumber(row.values[valueKey]),
            0
        );

        if (row.total > 0) {
            result.push(row);
        }
    });

    return result;
}


/*
 * Per-column totals for the footer, summed over every filtered
 * row rather than just the visible page.
 */
function calculateColumnTotals(rows, columns) {

    const totals = {};

    columns.forEach(column => {

        if (column.type === "index" || column.type === "entity") {
            return;
        }

        totals[column.key] =
            column.type === "total"
                ? rows.reduce((sum, row) => sum + toNumber(row.total), 0)
                : rows.reduce(
                    (sum, row) => sum + toNumber(row.values[column.key]),
                    0
                );
    });

    return totals;
}


/* ============================================================
   19. KPIs
   ============================================================ */

function calculateKPIs(rows, classRows, classSchema, visibleClassColumns) {

    const total = rows.reduce((sum, row) => sum + toNumber(row.total), 0);

    const kpis = {
        totalRegistrations: total,
        totalEntities: rows.length,
        twoWRegistrations: null,
        threeWRegistrations: null,
        twoWPercentage: null,
        threeWPercentage: null,
        classNote: ""
    };

    if (!classRows || !classSchema) {
        return kpis;
    }

    /*
     * Always expanded against the schema being summed - the KPI
     * source and the table source are not always the same table.
     */
    const schemaTwoW = groupColumnsFor(classSchema, "2W");
    const schemaThreeW = groupColumnsFor(classSchema, "3W");

    if (schemaTwoW.length === 0 && schemaThreeW.length === 0) {
        return kpis;
    }

    /*
     * When the displayed table IS the class table, restrict the
     * groups to the columns currently on screen so numerator and
     * denominator describe the same population.
     */
    const restrict = groupColumns =>
        Array.isArray(visibleClassColumns)
            ? groupColumns.filter(column =>
                visibleClassColumns.includes(column))
            : groupColumns;

    const relevant = classRows.filter(row =>
        matchesEntityFilter(normalizeString(row[classSchema.entityColumn]))
    );

    const twoW = relevant.reduce(
        (sum, row) => sum + sumColumns(row, restrict(schemaTwoW)),
        0
    );

    const threeW = relevant.reduce(
        (sum, row) => sum + sumColumns(row, restrict(schemaThreeW)),
        0
    );

    kpis.twoWRegistrations = schemaTwoW.length > 0 ? twoW : null;
    kpis.threeWRegistrations = schemaThreeW.length > 0 ? threeW : null;

    /*
     * When the class source is the electric-only table but the
     * total came from a national table, the two describe
     * different populations - percentage against the electric
     * total instead, and say so on the card.
     */
    const comparable =
        Array.isArray(visibleClassColumns) ||
        true;

    const classTotal = relevant.reduce(
        (sum, row) => sum + toNumber(row[classSchema.totalColumn]),
        0
    );

    const denominator = comparable ? total : classTotal;

    kpis.twoWPercentage =
        kpis.twoWRegistrations !== null && denominator > 0
            ? (twoW / denominator) * 100
            : null;

    kpis.threeWPercentage =
        kpis.threeWRegistrations !== null && denominator > 0
            ? (threeW / denominator) * 100
            : null;

    if (!comparable) {
        kpis.classNote = "of electric registrations";
    }

    return kpis;
}


function updateKPICards() {

    const kpis = state.kpis;
    const view = currentView();

    if (dom.totalRegistrations) {
        dom.totalRegistrations.textContent = formatIndianNumber(
            kpis.totalRegistrations
        );
    }

    if (dom.totalMakers) {
        dom.totalMakers.textContent = formatIndianNumber(kpis.totalEntities);
    }

    if (dom.entityCountLabel) {
        dom.entityCountLabel.textContent = `Total ${view.entityPlural}`;
    }

    if (dom.entityCountMeta) {
        dom.entityCountMeta.textContent =
            `${view.entityPlural} with registrations`;
    }

    const suffix = kpis.classNote || "of selection";

    if (dom.twoWRegistrations) {
        dom.twoWRegistrations.textContent =
            kpis.twoWRegistrations === null
                ? "—"
                : formatIndianNumber(kpis.twoWRegistrations);
    }

    if (dom.threeWRegistrations) {
        dom.threeWRegistrations.textContent =
            kpis.threeWRegistrations === null
                ? "—"
                : formatIndianNumber(kpis.threeWRegistrations);
    }

    if (dom.twoWPercentage) {
        dom.twoWPercentage.textContent =
            kpis.twoWPercentage === null
                ? "Not available for this selection"
                : `${formatPercentage(kpis.twoWPercentage)} ${suffix}`;
    }

    if (dom.threeWPercentage) {
        dom.threeWPercentage.textContent =
            kpis.threeWPercentage === null
                ? "Not available for this selection"
                : `${formatPercentage(kpis.threeWPercentage)} ${suffix}`;
    }
}


/* ============================================================
   20. SEARCH / SORT / PAGINATION
   ============================================================ */

function getActiveSearchTerms() {

    return state.searchTerms.map(normalizeKey).filter(Boolean);
}


function getSearchFilteredRows(rows) {

    const terms = getActiveSearchTerms();

    if (terms.length === 0) {
        return [...rows];
    }

    return rows.filter(row => {

        const entity = normalizeKey(row.entity);

        return terms.some(term => entity.includes(term));
    });
}


function sortRows(rows) {

    const sorted = [...rows];
    const key = state.sortKey;

    sorted.sort((a, b) => {

        let result = 0;

        if (key === "__index") {

            result = toNumber(a.srNo) - toNumber(b.srNo);

        } else if (key === "__entity") {

            result = String(a.entity).localeCompare(
                String(b.entity),
                undefined,
                { sensitivity: "base" }
            );

        } else if (key === "__total") {

            result = toNumber(a.total) - toNumber(b.total);

        } else {

            result =
                toNumber(a.values[key]) - toNumber(b.values[key]);
        }

        /*
         * Ties fall back to the entity name so paging is stable.
         */
        if (result === 0) {
            result = String(a.entity).localeCompare(String(b.entity));
        }

        return state.sortDirection === "asc" ? result : -result;
    });

    return sorted;
}


function getPaginatedRows(rows) {

    const start = (state.currentPage - 1) * state.pageSize;

    return rows.slice(start, start + state.pageSize);
}


function sortIconFor(key) {

    if (key !== state.sortKey) {
        return "↕";
    }

    return state.sortDirection === "asc" ? "↑" : "↓";
}


/* ============================================================
   21. TABLE STATES
   ============================================================ */

function setTableState(mode, message) {

    if (dom.tableContent) {
        dom.tableContent.hidden = mode !== "data";
    }

    if (dom.tableLoading) {
        dom.tableLoading.hidden = mode !== "loading";
    }

    if (dom.tableEmpty) {
        dom.tableEmpty.hidden = mode !== "empty";
    }

    if (dom.tableError) {
        dom.tableError.hidden = mode !== "error";
    }

    if (mode === "empty" && dom.tableEmptyText && message) {
        dom.tableEmptyText.textContent = message;
    }

    if (mode === "error" && dom.tableErrorText && message) {
        dom.tableErrorText.textContent = message;
    }
}


/* ============================================================
   22. RENDER
   ============================================================ */

/*
 * Sticky classes are applied per cell. The first two columns
 * pin to the left and Total pins to the right, so the row label
 * and its total stay on screen while the middle scrolls.
 */
function cellClassFor(column) {

    if (column.type === "index") {
        return "col-index sticky-left sticky-left--index";
    }

    if (column.type === "entity") {
        return "col-entity sticky-left sticky-left--entity";
    }

    if (column.type === "total") {
        return "col-total sticky-right numeric-column";
    }

    return "col-value numeric-column";
}


/*
 * A numeric cell carries two figures: the count on the left and
 * its share of the column on the right. They go in a flex span
 * rather than on the cell itself, so the td stays a table-cell
 * and keeps its sticky positioning and column width.
 */
function fillNumericCell(cell, value, columnTotal) {

    const split = document.createElement("span");
    split.className = "cell-split";

    const amount = document.createElement("span");
    amount.className = "cell-amount";
    amount.textContent = formatIndianNumber(value);

    const share = document.createElement("span");
    share.className = "cell-share";
    share.textContent = formatShare(value, columnTotal);

    split.appendChild(amount);
    split.appendChild(share);

    cell.appendChild(split);
}


function renderTableHead() {

    if (!dom.makerSummaryTableHead) {
        return;
    }

    dom.makerSummaryTableHead.innerHTML = "";

    const tr = document.createElement("tr");

    state.columns.forEach(column => {

        const th = document.createElement("th");

        th.scope = "col";
        th.className = cellClassFor(column);
        th.setAttribute("data-sort-key", column.key);

        th.setAttribute(
            "aria-sort",
            column.key === state.sortKey
                ? state.sortDirection === "asc"
                    ? "ascending"
                    : "descending"
                : "none"
        );

        const button = document.createElement("button");
        button.type = "button";
        button.className = "table-sort-button";
        button.setAttribute("data-sort", column.key);
        button.setAttribute("aria-label", `Sort by ${column.label}`);

        const label = document.createElement("span");
        label.textContent = column.label;

        const icon = document.createElement("span");
        icon.className = "sort-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = sortIconFor(column.key);

        button.appendChild(label);
        button.appendChild(icon);
        th.appendChild(button);

        tr.appendChild(th);
    });

    dom.makerSummaryTableHead.appendChild(tr);
}


function renderTableFoot(rows, shareTotals) {

    if (!dom.makerSummaryTableFoot) {
        return;
    }

    dom.makerSummaryTableFoot.innerHTML = "";

    const totals = calculateColumnTotals(rows, state.columns);
    const denominators = shareTotals || totals;

    const tr = document.createElement("tr");

    state.columns.forEach(column => {

        const cell = document.createElement(
            column.type === "entity" ? "th" : "td"
        );

        cell.className = cellClassFor(column);

        if (column.type === "index") {
            cell.textContent = "";
        } else if (column.type === "entity") {
            cell.scope = "row";
            cell.textContent = `Total (${formatIndianNumber(rows.length)})`;
        } else {

            /*
             * Against the unsearched denominator this reads 100%
             * on the full list, and on a search it reads how much
             * of the market the matches account for.
             */
            fillNumericCell(
                cell,
                totals[column.key],
                denominators[column.key]
            );
        }

        tr.appendChild(cell);
    });

    dom.makerSummaryTableFoot.appendChild(tr);
}


function renderTable() {

    if (!dom.makerSummaryTableBody) {
        return;
    }

    const searched = getSearchFilteredRows(state.rows);
    const rows = sortRows(searched);

    state.filteredRows = rows;

    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));

    if (state.currentPage > totalPages) {
        state.currentPage = totalPages;
    }

    const pageRows = getPaginatedRows(rows);

    /*
     * Two sets of totals, because they answer different
     * questions. The foot sums what is on screen, so it follows
     * the search. Market share must not - searching for one maker
     * would otherwise show it holding 100% of the market - so its
     * denominator stays the unsearched set, leaving a maker's
     * share identical whether or not it was searched for.
     * Filters still apply to both: they define which market is
     * being measured.
     */
    const shareTotals =
        state.searchTerms.length === 0
            ? calculateColumnTotals(rows, state.columns)
            : calculateColumnTotals(state.rows, state.columns);

    dom.makerSummaryTableBody.innerHTML = "";

    renderTableHead();
    renderTableFoot(rows, shareTotals);

    updateResultCount(rows.length, state.rows.length);
    updatePagination(totalPages);

    if (rows.length === 0) {

        const terms = state.searchTerms.map(normalizeString).filter(Boolean);
        const entity = currentView().entity.toLowerCase();

        let message = "No data found for the selected filters.";

        if (terms.length === 1) {
            message = `No ${entity} matches "${terms[0]}".`;
        } else if (terms.length > 1) {
            message =
                `No ${entity} matches ` +
                terms.map(term => `"${term}"`).join(" or ") + ".";
        }

        setTableState("empty", message);

        return;
    }

    setTableState("data");

    const startIndex = (state.currentPage - 1) * state.pageSize;

    const fragment = document.createDocumentFragment();

    pageRows.forEach((row, offset) => {

        const tr = document.createElement("tr");

        state.columns.forEach(column => {

            const td = document.createElement("td");

            td.className = cellClassFor(column);

            if (column.type === "index") {

                /*
                 * The source row number where the table has one,
                 * so the numbering matches the originating
                 * workbook regardless of sort order.
                 */
                td.textContent =
                    row.srNo === null || row.srNo === undefined
                        ? formatIndianNumber(startIndex + offset + 1)
                        : formatIndianNumber(row.srNo);

            } else if (column.type === "entity") {

                td.textContent = row.entity;
                td.title = row.entity;

            } else if (column.type === "total") {

                fillNumericCell(
                    td,
                    row.total,
                    shareTotals[column.key]
                );

            } else {

                fillNumericCell(
                    td,
                    row.values[column.key],
                    shareTotals[column.key]
                );
            }

            tr.appendChild(td);
        });

        fragment.appendChild(tr);
    });

    dom.makerSummaryTableBody.appendChild(fragment);
}


function updateResultCount(shown, total) {

    if (!dom.resultCount) {
        return;
    }

    const plural = currentView().entityPlural.toLowerCase();

    dom.resultCount.textContent =
        shown === total
            ? `${formatIndianNumber(total)} ${plural}`
            : `${formatIndianNumber(shown)} of ` +
              `${formatIndianNumber(total)} ${plural}`;
}


function updatePagination(totalPages) {

    if (dom.pageIndicator) {
        dom.pageIndicator.textContent =
            `Page ${state.currentPage} of ${totalPages}`;
    }

    if (dom.previousPageButton) {
        dom.previousPageButton.disabled = state.currentPage <= 1;
    }

    if (dom.nextPageButton) {
        dom.nextPageButton.disabled = state.currentPage >= totalPages;
    }
}


function updateViewLabels() {

    const view = currentView();

    if (dom["maker-summary-title"]) {

        dom["maker-summary-title"].textContent = regionIsActive()
            ? `Maker × ${prettifyRegion(state.filters.region)}`
            : view.title;
    }

    getSearchInputs().forEach(input => {

        if (input) {
            input.placeholder = view.searchPlaceholder;
        }
    });
}


function updateActiveFilters() {

    if (!dom.activeFilters) {
        return;
    }

    dom.activeFilters.innerHTML = "";

    const fragment = document.createDocumentFragment();

    const label = document.createElement("span");
    label.className = "active-filters__label";
    label.textContent = "Active Filters:";
    fragment.appendChild(label);

    let count = 0;

    function addFilter(name, value) {

        if (isAll(value) || value === "") {
            return;
        }

        count += 1;

        const element = document.createElement("span");
        element.className = "active-filter";

        const strong = document.createElement("strong");
        strong.textContent = `${name}:`;

        element.appendChild(strong);
        element.appendChild(document.createTextNode(` ${value}`));

        fragment.appendChild(element);
    }

    addFilter("Scope", currentView().scopeLabel);
    addFilter("Year", state.year);

    if (state.filters.makers.length > 0) {
        addFilter("Maker", state.filters.makers.join(", "));
    }

    addFilter("State", state.filters.state);

    if (!isAll(state.filters.region)) {
        addFilter("Region", prettifyRegion(state.filters.region));
    }

    addFilter("Month", state.filters.month);
    addFilter("Category", state.filters.category);
    addFilter("Subcategory", state.filters.subcategory);

    /*
     * Breakdown always shows, so "no filters" means only it.
     */
    if (count <= 2) {

        const empty = document.createElement("span");
        empty.className = "active-filter active-filter--empty";
        empty.textContent = "No other filters";

        fragment.appendChild(empty);
    }

    dom.activeFilters.appendChild(fragment);
}


function updateYearRangeHeader() {

    const element = dom["data-year-range"];

    if (!element) {
        return;
    }

    element.textContent = state.year || "—";
}


function updateDatasetNote() {

    if (!dom.datasetNote) {
        return;
    }

    const view = currentView();

    const source = state.sourceTable || currentSchema()?.table || "—";

    const valueColumnCount = state.columns.filter(
        column => column.type === "value"
    ).length;

    const text =
        `Source: ${source} · ${view.scopeLabel} · calendar year ` +
        `${state.year} · ` +
        `${formatIndianNumber(state.dimensionTotal)} registrations ` +
        `across ${formatIndianNumber(state.rows.length)} ` +
        `${view.entityPlural.toLowerCase()} and ` +
        `${formatIndianNumber(valueColumnCount)} columns.`;

    dom.datasetNote.hidden = false;
    dom.datasetNote.textContent = text;
}


/* ============================================================
   23. LOADING / ERROR
   ============================================================ */

function showLoading({ global = false } = {}) {

    state.loading = true;

    if (global && dom.globalLoading) {
        dom.globalLoading.hidden = false;
    }

    setTableState("loading");
}


function hideLoading() {

    state.loading = false;

    if (dom.globalLoading) {
        dom.globalLoading.hidden = true;
    }

    if (dom.tableLoading) {
        dom.tableLoading.hidden = true;
    }
}


/*
 * A dead API fails every table at once, so naming one of them
 * misleads: it reads like a missing table when nothing is wrong
 * with the schema.
 */
const DB_UNREACHABLE_MESSAGE =
    "Can't reach the database right now. Check that the local " +
    "API and Postgres containers are running, then press Retry.";


function isDatabaseUnreachable(error) {

    if (!error) {
        return false;
    }

    if (error.code === "PGRST002" || error.code === "FETCH_FAILED") {
        return true;
    }

    const text = String(error.message || error);

    return (
        /schema cache/i.test(text) ||
        /failed to fetch/i.test(text) ||
        /networkerror/i.test(text) ||
        /load failed/i.test(text)
    );
}


/*
 * Accepts an Error or a plain string. Errors are classified so a
 * dead API reads as a service problem rather than a data one.
 */
function toUserMessage(error, fallback) {

    if (typeof error === "string") {
        return error;
    }

    if (isDatabaseUnreachable(error)) {
        return DB_UNREACHABLE_MESSAGE;
    }

    return (error && error.message) || fallback;
}


function displayError(error, fallback = "Something went wrong.") {

    const message = toUserMessage(error, fallback);

    console.error(error);

    if (dom.errorMessage && dom.errorMessageText) {
        dom.errorMessageText.textContent = message;
        dom.errorMessage.hidden = false;
    }

    setTableState("error", message);
}


function clearError() {

    if (dom.errorMessage) {
        dom.errorMessage.hidden = true;
    }

    if (dom.errorMessageText) {
        dom.errorMessageText.textContent = "";
    }
}


function isAbortError(error) {

    return (
        error &&
        (error.name === "AbortError" || /abort/i.test(error.message || ""))
    );
}


/* ============================================================
   24. APPLY FILTERS
   ============================================================ */

async function applyFilters({ global = false } = {}) {

    const requestId = ++state.requestId;

    if (state.activeController) {
        state.activeController.abort();
    }

    const controller = new AbortController();
    state.activeController = controller;

    clearError();
    clearYearError();

    const previousView = state.view;
    const previousYear = state.year;

    readFiltersFromUI();

    /*
     * Scope and year each select a different physical table, and
     * class columns differ between them, so the schema and the
     * class taxonomy both have to be rebuilt on either change.
     */
    if (state.view !== previousView || state.year !== previousYear) {

        state.tableCache = new Map();

        await discoverSchema();

        applyViewVisibility();
        loadMonths();
        loadClassFilters();

        /*
         * Repopulated from the newly selected table, so the
         * entity list always matches what is on screen.
         */
        await loadEntityOptions(controller.signal);

        updateViewLabels();
        readFiltersFromUI();
    }

    enforceFilterCompatibility();
    readFiltersFromUI();

    state.currentPage = 1;

    updateActiveFilters();
    updateYearRangeHeader();
    updateViewLabels();

    showLoading({ global });

    try {

        const { rows, columns, sourceTable, classRows, classSchema } =
            await fetchDashboardData(state.filters, controller.signal);

        if (requestId !== state.requestId) {
            return false;
        }

        state.columns = columns;
        state.sourceTable = sourceTable;

        state.rows = aggregateRows(rows, columns);

        state.dimensionTotal = state.rows.reduce(
            (sum, row) => sum + toNumber(row.total),
            0
        );

        /*
         * Sorting by a column that no longer exists falls back
         * to Total - as does source-row order on a table that
         * has no row numbers of its own, such as the RTO data.
         */
        const missingColumn = !columns.some(
            column => column.key === state.sortKey
        );

        const noSourceOrder =
            state.sortKey === "__index" &&
            state.rows.length > 0 &&
            (state.rows[0].srNo === null || state.rows[0].srNo === undefined);

        if (missingColumn || noSourceOrder) {
            state.sortKey = "__total";
            state.sortDirection = "desc";
        }

        state.kpis = calculateKPIs(
            state.rows,
            classRows,
            classSchema,
            currentView().columnKind === "class" && !regionIsActive()
                ? getVisibleValueColumns()
                : null
        );

        updateKPICards();
        updateDatasetNote();
        renderTable();

        return true;

    } catch (error) {

        if (isAbortError(error) || requestId !== state.requestId) {
            return false;
        }

        console.error("Dashboard data error:", error);

        state.rows = [];
        state.filteredRows = [];
        state.dimensionTotal = 0;
        state.kpis = emptyKPIs();

        updateKPICards();

        if (dom.datasetNote) {
            dom.datasetNote.hidden = true;
        }

        displayError(error, "Unable to load dashboard data.");

        return false;

    } finally {

        if (requestId === state.requestId) {
            hideLoading();
            state.activeController = null;
        }
    }
}


/* ============================================================
   25. RESET
   ============================================================ */

async function resetFilters() {

    if (dom.breakdownFilter) {
        dom.breakdownFilter.value = DEFAULT_VIEW;
    }

    if (dom.yearFilter) {
        dom.yearFilter.value = AVAILABLE_YEARS[0];
    }

    [
        dom.makerFilter,
        dom.stateFilter,
        dom.monthFilter,
        dom.regionFilter,
        dom.categoryFilter,
        dom.subcategoryFilter
    ].forEach(select => {

        if (select) {
            select.value = CONFIG.ALL;
        }
    });

    refreshAllCombos();

    clearTableSearch();

    state.sortKey = "__index";
    state.sortDirection = "asc";
    state.currentPage = 1;

    state.view = DEFAULT_VIEW;
    state.year = AVAILABLE_YEARS[0];

    state.tableCache = new Map();

    await discoverSchema();

    applyViewVisibility();
    loadMonths();
    loadClassFilters();

    /*
     * Reset restores the default table, so the entity list has
     * to be rebuilt from it too.
     */
    await loadEntityOptions();

    updateViewLabels();
    enforceFilterCompatibility();

    clearError();
    clearYearError();

    await applyFilters();
}


/* ============================================================
   26. SEARCH ROWS
   ============================================================ */

function getSearchRows() {

    if (!dom.makerSearchList) {
        return [];
    }

    return [...dom.makerSearchList.querySelectorAll("[data-search-row]")];
}


function getSearchInputs() {

    return getSearchRows().map(row =>
        row.querySelector("[data-maker-search]")
    );
}


function syncSearchRows() {

    const rows = getSearchRows();
    const view = currentView();

    state.searchTerms = rows.map(row => {

        const input = row.querySelector("[data-maker-search]");

        return input ? normalizeString(input.value) : "";
    });

    rows.forEach((row, index) => {

        const input = row.querySelector("[data-maker-search]");
        const addButton = row.querySelector("[data-add-search]");
        const removeButton = row.querySelector("[data-remove-search]");
        const clearButton = row.querySelector("[data-clear-search]");

        const isFirst = index === 0;

        if (input) {

            input.placeholder = view.searchPlaceholder;

            input.setAttribute(
                "aria-label",
                rows.length > 1
                    ? `Search ${view.entityPlural.toLowerCase()}, ` +
                      `box ${index + 1} of ${rows.length}`
                    : `Search ${view.entityPlural.toLowerCase()}`
            );
        }

        if (addButton) {
            addButton.hidden = !isFirst;
            addButton.disabled = rows.length >= CONFIG.MAX_SEARCH_ROWS;

            addButton.title =
                rows.length >= CONFIG.MAX_SEARCH_ROWS
                    ? `Maximum of ${CONFIG.MAX_SEARCH_ROWS} searches`
                    : "Add another search";
        }

        if (removeButton) {
            removeButton.hidden = isFirst;
        }

        if (clearButton) {
            clearButton.hidden = !(input && input.value);
        }
    });
}


function addSearchRow({ focus = true } = {}) {

    if (
        !dom.makerSearchList ||
        !dom.searchRowTemplate ||
        getSearchRows().length >= CONFIG.MAX_SEARCH_ROWS
    ) {
        return null;
    }

    const fragment = dom.searchRowTemplate.content.cloneNode(true);
    const row = fragment.querySelector("[data-search-row]");

    dom.makerSearchList.appendChild(fragment);

    syncSearchRows();

    if (focus) {

        const input = row?.querySelector("[data-maker-search]");

        if (input) {
            input.focus();
        }
    }

    return row;
}


function removeSearchRow(row) {

    if (!row || getSearchRows().length <= 1) {
        return;
    }

    row.remove();

    syncSearchRows();

    state.currentPage = 1;

    renderTable();
}


function applySearchChange() {

    syncSearchRows();

    state.currentPage = 1;

    renderTable();
}


function setupSearch() {

    if (!dom.makerSearchList) {
        return;
    }

    if (getSearchRows().length === 0) {
        addSearchRow({ focus: false });
    }

    dom.makerSearchList.addEventListener("input", event => {

        if (!event.target.closest("[data-maker-search]")) {
            return;
        }

        clearTimeout(state.searchTimer);

        state.searchTimer = setTimeout(
            applySearchChange,
            CONFIG.SEARCH_DELAY
        );
    });

    dom.makerSearchList.addEventListener("click", event => {

        if (event.target.closest("[data-add-search]")) {
            addSearchRow();
            return;
        }

        const removeButton = event.target.closest("[data-remove-search]");

        if (removeButton) {
            removeSearchRow(removeButton.closest("[data-search-row]"));
            return;
        }

        const clearButton = event.target.closest("[data-clear-search]");

        if (clearButton) {

            const row = clearButton.closest("[data-search-row]");
            const input = row?.querySelector("[data-maker-search]");

            if (input) {
                input.value = "";
                input.focus();
            }

            applySearchChange();
        }
    });
}


function clearTableSearch() {

    clearTimeout(state.searchTimer);

    getSearchRows().forEach((row, index) => {

        if (index === 0) {

            const input = row.querySelector("[data-maker-search]");

            if (input) {
                input.value = "";
            }

        } else {
            row.remove();
        }
    });

    syncSearchRows();

    state.currentPage = 1;

    renderTable();
}


/* ============================================================
   27. EVENT WIRING
   ============================================================ */

function setupSorting() {

    document.addEventListener("click", event => {

        const button = event.target.closest("[data-sort]");

        if (!button) {
            return;
        }

        const key = button.dataset.sort;

        if (!state.columns.some(column => column.key === key)) {
            return;
        }

        if (state.sortKey === key) {
            state.sortDirection =
                state.sortDirection === "asc" ? "desc" : "asc";
        } else {
            state.sortKey = key;

            state.sortDirection =
                key === "__entity" || key === "__index" ? "asc" : "desc";
        }

        state.currentPage = 1;

        renderTable();
    });
}


function setupPagination() {

    if (dom.previousPageButton) {

        dom.previousPageButton.addEventListener("click", () => {

            if (state.currentPage > 1) {
                state.currentPage -= 1;
                renderTable();
            }
        });
    }

    if (dom.nextPageButton) {

        dom.nextPageButton.addEventListener("click", () => {

            const totalPages = Math.max(
                1,
                Math.ceil(state.filteredRows.length / state.pageSize)
            );

            if (state.currentPage < totalPages) {
                state.currentPage += 1;
                renderTable();
            }
        });
    }

    if (dom.pageSizeSelect) {

        dom.pageSizeSelect.addEventListener("change", event => {

            const size = Number(event.target.value);

            if (CONFIG.PAGE_SIZES.includes(size)) {
                state.pageSize = size;
                state.currentPage = 1;
                renderTable();
            }
        });
    }
}


function setupFilterListeners() {

    [
        dom.breakdownFilter,
        dom.yearFilter,
        dom.makerFilter,
        dom.stateFilter,
        dom.monthFilter,
        dom.regionFilter,
        dom.categoryFilter,
        dom.subcategoryFilter
    ].forEach(element => {

        if (!element) {
            return;
        }

        element.addEventListener("change", async () => {
            enforceFilterCompatibility();
            await applyFilters();
        });
    });

    if (dom.clearFiltersButton) {

        dom.clearFiltersButton.addEventListener("click", async event => {
            event.preventDefault();
            await resetFilters();
        });
    }
}


function setupRetry() {

    if (state.retryWired || !dom.retryButton) {
        return;
    }

    dom.retryButton.addEventListener("click", async () => {
        clearError();
        await initializeDashboard({ force: true });
    });

    state.retryWired = true;
}


/* ============================================================
   28. INITIALIZATION
   ============================================================ */

async function initializeDashboard({ force = false } = {}) {

    if (state.initialized && !force) {
        return;
    }

    cacheDOM();
    setupRetry();

    state.tableCache = new Map();
    state.regionsLoaded = false;

    if (dom.globalLoading) {
        dom.globalLoading.hidden = false;
    }

    setTableState("loading");

    try {

        await initializeApi();
        await discoverSchema();

        /*
         * Built before the options load, so populateSelect can
         * mirror straight into them.
         */
        enhanceFilterSelects();

        await loadFilterOptions();

        if (!state.wired) {
            setupSearch();
            setupSorting();
            setupPagination();
            setupFilterListeners();
            setupComboDismiss();
            state.wired = true;
        }

        updateViewLabels();
        enforceFilterCompatibility();
        updateActiveFilters();
        updateYearRangeHeader();

        await applyFilters({ global: true });

    } catch (error) {

        console.error("Dashboard initialization failed:", error);

        state.rows = [];
        state.filteredRows = [];
        state.dimensionTotal = 0;
        state.kpis = emptyKPIs();

        updateKPICards();

        if (dom.datasetNote) {
            dom.datasetNote.hidden = true;
        }

        displayError(error, "Dashboard initialization failed.");

    } finally {

        state.initialized = true;

        hideLoading();
    }
}


/* ============================================================
   29. GLOBAL API
   ============================================================ */

window.vehicleDashboard = {
    initializeDashboard,
    applyFilters,
    resetFilters,
    clearTableSearch,
    fetchDashboardData,
    loadFilterOptions,
    getSelectedMakersFromUI,
    state
};


/* ============================================================
   30. DOM READY
   ============================================================ */

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        initializeDashboard();
    });
} else {
    initializeDashboard();
}
