/* ============================================================
   VEHICLE REGISTRATION ANALYTICS DASHBOARD
   File: /script.js

   Vanilla JavaScript + Supabase PostgREST (no Supabase client)

   ------------------------------------------------------------
   SCHEMA (Supabase project ytgoonducepylslknkag)

   YEAR GRAIN - the Details card. All WIDE, Maker x Vehicle Class:
   year | Maker | <vehicle classes> | Total

       MAKER_WISE                 3,994 rows   74 classes
       Gujarat_Class_Wise           862 rows   61 classes
       Ahmedabad_Class_Wise         414 rows   49 classes  (view)
       Maker_Class_Wise_GJ01        278 rows   43 classes
       Maker_Class_Wise_GJ13        229 rows   32 classes
       Maker_Class_Wise_GJ27        275 rows   38 classes
       Maker_Class_Wise_GJ38        292 rows   31 classes

   Scope picks the table; year is a column within it. Each holds
   2025 and 2026, and a new year adds rows rather than tables.
   Ahmedabad is a view: GJ01 + GJ27 + GJ38 summed PER MAKER, since
   the three share most of their makers.

   MONTH GRAIN - the trend. Three families of twelve tables, one
   per calendar month, same wide shape with the month in the name:

       Maker_Class_Wise_<Mon>      37,074 rows   75 classes
       Gujarat_Class_Wise_<Mon>     6,334 rows   64 classes
       Ahmedabad_Class_Wise_<Mon>   7,152 rows   53 classes + rto

   Only the Ahmedabad family carries an "rto" column, which is what
   lets one set of twelve serve GJ01, GJ27, GJ38 and their rollup.

   The trend reads three views over all of it, each carrying a
   "scope" column that MUST be filtered on - they hold every scope
   at once, so an unfiltered read sums six scopes together:

       trend_totals      192 rows, classes summed across makers
       trend_by_maker    54,019 rows
       trend_makers      distinct makers per scope

   The older monthly_* views are still on the project. They are
   All-India-only and have no scope column, and exist purely so a
   cached copy of an earlier script.js keeps working. Nothing here
   reads them.

   ------------------------------------------------------------
   WHAT THE DATA CAN AND CANNOT DO

   maker x class   yes, per scope, filtered by year
   maker x month   yes, per scope - except GJ13, which has no
                   month tables (SCOPES_WITHOUT_TREND)
   state x class   NO TABLE EXISTS
   maker x rto     only within Ahmedabad's three RTOs

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
 * Supabase's PostgREST, same wire protocol the local one spoke,
 * so the client below is unchanged apart from the two headers
 * every request now has to carry.
 *
 * The publishable key is safe in client-side source: it grants
 * the anon role, and each table has row level security on with
 * a SELECT-only policy. Writes are refused by the database.
 */
const API_URL = "https://ytgoonducepylslknkag.supabase.co/rest/v1";

const API_KEY = "sb_publishable_9IVGzYTxQDj2UoLOaBtkFw_7H5ILVGY";

const API_HEADERS = {
    apikey: API_KEY,
    Authorization: `Bearer ${API_KEY}`
};


/* ============================================================
   2. TABLE CONFIGURATION
   ============================================================ */

/*
 * Every table is Maker x Vehicle Class, one per scope. The year
 * used to be part of the table name - MAKER_WISE_2025 next to
 * MAKER_WISE_2026 - which meant a new year needed six new tables
 * and nothing could span years. It is now a column, so a scope is
 * one table and the year is an ordinary filter.
 *
 * Class columns still differ per scope - Vahan drops classes with
 * no entries - so the schema is read from the table rather than
 * assumed.
 */
const SCOPE_TABLES = {
    all_india: "MAKER_WISE",
    gujarat:   "Gujarat_Class_Wise",
    ahmedabad: "Ahmedabad_Class_Wise",
    gj01:      "Maker_Class_Wise_GJ01",
    gj13:      "Maker_Class_Wise_GJ13",
    gj27:      "Maker_Class_Wise_GJ27",
    gj38:      "Maker_Class_Wise_GJ38"
};


const AVAILABLE_YEARS = ["2026", "2025"];


/*
 * When the six scope tables were last pulled from Vahan. Only the
 * part-year matters: 2025 and earlier are closed and reconcile with
 * the month tables to within single digits, but 2026 is a snapshot
 * taken part-way through August and runs about 5 lakh units behind
 * the trend at All India. Update both fields on a re-pull.
 */
const DATA_AS_OF = { year: "2026", label: "20 August 2026" };


function tableFor(scope) {

    return SCOPE_TABLES[scope] || SCOPE_TABLES[DEFAULT_VIEW];
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
    ahmedabad: makeScope("ahmedabad", "Ahmedabad"),
    gj01:      makeScope("gj01", "GJ01"),
    gj13:      makeScope("gj13", "GJ13"),
    gj27:      makeScope("gj27", "GJ27"),
    gj38:      makeScope("gj38", "GJ38")
};


/*
 * GJ13 is the one scope with no month tables behind it, so its trend
 * has nothing to draw. Everything else about the scope works.
 */
const SCOPES_WITHOUT_TREND = new Set(["gj13"]);


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

    constructor(baseUrl, table, authHeaders = {}) {

        this.baseUrl = baseUrl;
        this.table = table;
        this.params = new URLSearchParams();

        /*
         * Seeded rather than merged at send time so range() and
         * select() keep appending to one object as before.
         */
        this.headers = { ...authHeaders };
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
            let code = String(response.status);

            try {

                const body = await response.json();

                if (body && body.message) {
                    message = body.message;
                }

                /*
                 * PostgREST's own code is far more specific than the
                 * HTTP status - PGRST205 (no such table) and PGRST002
                 * (cannot reach the database) both arrive as errors
                 * mentioning the schema cache, and only one of them
                 * means the database is down.
                 */
                if (body && body.code) {
                    code = String(body.code);
                }

            } catch (ignored) {
                /* non-JSON error body */
            }

            return {
                data: null,
                count,
                error: { message, code, status: response.status }
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


function createRestClient(baseUrl, authHeaders) {

    return {
        from: table => new RestQuery(baseUrl, table, authHeaders)
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

    /*
     * Month tables are read independently of the scope tables:
     * one cached read per column set, reused as filters change.
     */
    monthly: {
        schema: null,
        describing: null,
        makers: null,
        /* Which scope `makers` was built for; see resetTrendForScope. */
        scope: null,
        cache: new Map(),
        makerCache: new Map()
    },

    /*
     * The trend carries its own maker choice, independent of the
     * sidebar's, so the two tables can be read against different
     * makers at the same time.
     */
    trendMaker: CONFIG.ALL,
    trendClass: CONFIG.ALL,
    trendOptionsLoaded: false,

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

        /* Monthly trend */
        "monthlyTrendHead",
        "monthlyTrendBody",
        "monthlyTrendFoot",
        "monthlyTrendMeta",
        "trendMakerFilter",
        "trendClassFilter",
        "monthlyTrendHint",
        "monthlyTrendLoading",
        "monthlyTrendError",
        "monthlyTrendErrorText",
        "monthlyTrendContent",

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
 * The scope tables carry every year, so this is what the year
 * selector filters on. It is already in METADATA_COLUMNS, so it
 * never reaches the class columns.
 */
function getYearColumn(row) {

    return findColumn(row, ["year", "Year", "YEAR"]);
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

    restClient = createRestClient(API_URL, API_HEADERS);

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
    const yearColumn = getYearColumn(sample);

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
        yearColumn,
        srNoColumn,
        valueColumns,
        monthColumns: valueColumns.filter(isMonthColumn),
        classColumns: valueColumns.filter(column => !isMonthColumn(column))
    };
}


/*
 * One cached fetch per table now covers every year, so the year
 * selector narrows the cached rows instead of triggering a reload.
 */
function rowsForSelectedYear(schema, rows) {

    if (!schema || !schema.yearColumn) {
        return rows;
    }

    const wanted = String(state.year);

    return rows.filter(
        row => String(row[schema.yearColumn]) === wanted
    );
}


/*
 * Only the selected scope+year table is described. Class columns
 * vary between tables, so this re-runs on every switch rather
 * than caching one shape for the whole session.
 */
async function discoverSchema() {

    const table = tableFor(state.view);

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
    "trendMakerFilter",
    "trendClassFilter",
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

    if (schema.yearColumn) {
        columns.unshift(schema.yearColumn);
    }

    const cached = await getCachedTable(
        schema.table,
        [...columns, ...schema.valueColumns],
        signal
    );

    /* Makers come and go between years, so list only this year's. */
    const rows = rowsForSelectedYear(schema, cached);

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

    /*
     * The scope tables were pulled from Vahan in mid-August 2026; the
     * month tables behind the trend close on 31 August. So the two
     * cards disagree on 2026 by a few per cent - about 5 lakh units
     * at All India - and will keep disagreeing until the scope
     * tables are re-pulled. Better said out loud than discovered.
     */
    if (String(state.year) === DATA_AS_OF.year) {
        messages.push(
            `2026 figures here are as of ${DATA_AS_OF.label}. The ` +
            "monthly trend runs to the end of August, so its 2026 " +
            "totals are slightly higher."
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

    if (schema.yearColumn) {
        selectColumns.unshift(schema.yearColumn);
    }

    const cached = await getCachedTable(schema.table, selectColumns, signal);

    const raw = rowsForSelectedYear(schema, cached);

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


function updateYearRangeHeader() {

    const element = dom["data-year-range"];

    if (!element) {
        return;
    }

    element.textContent = state.year || "—";
}


/* ============================================================
   22b. MONTHLY TREND

   Fiscal years down the side, months across the top. Each month
   carries three figures:

       IND  every maker's registrations that month
       VOL  what the Maker and Category filters select
       MS   VOL as a share of IND

   The twelve month tables are All-India only, so this section
   deliberately ignores the Scope filter and says so on screen.
   ============================================================ */

const MONTH_TABLES = [
    { number: 1, key: "Jan", label: "January" },
    { number: 2, key: "Feb", label: "February" },
    { number: 3, key: "Mar", label: "March" },
    { number: 4, key: "Apr", label: "April" },
    { number: 5, key: "May", label: "May" },
    { number: 6, key: "Jun", label: "June" },
    { number: 7, key: "Jul", label: "July" },
    { number: 8, key: "Aug", label: "August" },
    { number: 9, key: "Sep", label: "September" },
    { number: 10, key: "Oct", label: "October" },
    { number: 11, key: "Nov", label: "November" },
    { number: 12, key: "Dec", label: "December" }
];


/* April first - a fiscal year runs April to March. */
const FISCAL_MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

function fiscalYearStart(month, year) {
    return month >= 4 ? year : year - 1;
}


function fiscalYearLabel(start) {
    return `FY ${start}-${String(start + 1).slice(-2)}`;
}


/*
 * Group choices are prefixed so one control can offer both without
 * a class ever being mistaken for the group of the same name.
 */
const TREND_GROUP_PREFIX = "group:";


/*
 * The first group whose test matches wins, which is the same order
 * CLASS_GROUPS is evaluated in everywhere else.
 */
function classGroupIdFor(column) {

    const group = CLASS_GROUPS.find(candidate => candidate.test(column));

    return group ? group.id : null;
}


/*
 * All Classes, then the groups that actually have columns, then
 * every individual class. Group labels lead with "All" so a group
 * reads apart from a class in one flat list.
 */
function loadTrendClassOptions() {

    if (!dom.trendClassFilter) {
        return;
    }

    const schema = state.monthly.schema;

    if (!schema) {
        return;
    }

    const present = new Set(
        schema.classColumns.map(classGroupIdFor).filter(Boolean)
    );

    const groups = CLASS_GROUPS
        .filter(group => present.has(group.id))
        .map(group => ({
            value: `${TREND_GROUP_PREFIX}${group.id}`,
            label: `All ${group.label}`
        }));

    const classes = uniqueSorted(schema.classColumns).map(column => ({
        value: column,
        label: column
    }));

    populateSelect(
        dom.trendClassFilter,
        [...groups, ...classes],
        "All Classes",
        state.trendClass
    );

    state.trendClass = dom.trendClassFilter.value;
}


/*
 * The month tables carry their own column set, so the class choice
 * is resolved against them rather than against whichever scope
 * table happens to be selected.
 *
 * Returns null when everything is selected, which lets the caller
 * read the row's Total instead of summing 75 columns.
 */
function monthlyValueColumns() {

    const schema = state.monthly.schema;

    if (!schema) {
        return [];
    }

    const chosen = state.trendClass;

    if (isAll(chosen)) {
        return null;
    }

    if (String(chosen).startsWith(TREND_GROUP_PREFIX)) {

        const id = String(chosen).slice(TREND_GROUP_PREFIX.length);

        return schema.classColumns.filter(
            column => classGroupIdFor(column) === id
        );
    }

    return schema.classColumns.filter(column => column === chosen);
}


/*
 * The trend answers to its own maker select, not the sidebar's, so
 * the two tables can sit at different makers at once.
 */
/*
 * Names of the three views the trend reads. Before they existed
 * this section paged all 37,074 maker-rows to fill a 4 x 12 grid;
 * these narrow or aggregate the same figures server-side.
 */
const MONTHLY_TOTALS_VIEW = "trend_totals";
const MONTHLY_BY_MAKER_VIEW = "trend_by_maker";
const MONTHLY_MAKERS_VIEW = "trend_makers";

const MONTH_COLUMN = "month";

/*
 * Every read below is narrowed by this. The views carry all six
 * scopes at once - 192 rows in trend_totals where there used to be
 * 32 - so an unfiltered read would sum All India together with
 * Gujarat, Ahmedabad and the three RTOs and inflate IND by about a
 * tenth. The older monthly_* views had no scope to filter on, which
 * is why they are still there for anything running old code.
 */
const SCOPE_COLUMN = "scope";


function trendScope() {

    return currentView().id;
}


/*
 * The distinct maker list, straight from its own view. It runs back
 * to 2024 and so is wider than the scope tables' - 2,552 names
 * against 1,949.
 */
async function loadTrendMakerOptions(signal) {

    if (!dom.trendMakerFilter || state.monthly.makers) {
        return;
    }

    const rows = await fetchAllRows(
        MONTHLY_MAKERS_VIEW,
        [state.monthly.schema.entityColumn],
        {
            signal,
            filters: [{ column: SCOPE_COLUMN, values: [trendScope()] }]
        }
    );

    state.monthly.makers = uniqueSorted(
        rows.map(row => row[state.monthly.schema.entityColumn])
    );

    populateSelect(
        dom.trendMakerFilter,
        state.monthly.makers,
        "All Makers",
        state.trendMaker
    );

    /* A maker absent from the data falls back to All. */
    state.trendMaker = dom.trendMakerFilter.value;
}


async function describeMonthlySchema() {

    if (state.monthly.schema) {
        return state.monthly.schema;
    }

    /* Two overlapping loads would otherwise both probe the view. */
    if (state.monthly.describing) {
        return state.monthly.describing;
    }

    state.monthly.describing = describeMonthlySchemaOnce()
        .finally(() => {
            state.monthly.describing = null;
        });

    return state.monthly.describing;
}


async function describeMonthlySchemaOnce() {

    const sample = await fetchSampleRow(MONTHLY_TOTALS_VIEW);

    if (!sample) {
        throw new Error(
            "The monthly views are unavailable, so the trend cannot load."
        );
    }

    const totalColumn = getTotalColumn(sample);
    const yearColumn = getYearColumn(sample);

    state.monthly.schema = {
        /* Only monthly_by_maker carries it, but both views share it. */
        entityColumn: "Maker",
        totalColumn,
        yearColumn,
        monthColumn: MONTH_COLUMN,
        classColumns: Object.keys(sample).filter(
            column =>
                column !== totalColumn &&
                column !== MONTH_COLUMN &&
                column !== SCOPE_COLUMN &&
                !isMetadataColumn(column)
        )
    };

    return state.monthly.schema;
}


/*
 * Thirty-two rows: one per month per year, every class already
 * summed across makers. Answers IND always, and VOL too whenever
 * no single maker is chosen.
 */
function getMonthlyTotals(valueColumns, signal) {

    const schema = state.monthly.schema;

    /*
     * Keyed by scope as well as columns. Without the scope in the
     * key, switching from All India to GJ38 would be served the
     * cached All India rows and quietly show the wrong numbers.
     */
    const key =
        trendScope() + " " +
        (valueColumns ? valueColumns.join("|") : "__total__");

    if (state.monthly.cache.has(key)) {
        return state.monthly.cache.get(key);
    }

    const columns = [
        schema.monthColumn,
        schema.yearColumn,
        schema.totalColumn,
        ...(valueColumns || [])
    ];

    /*
     * The promise is cached, not its result: startup calls this
     * twice, and caching only the result let the second call start
     * a second fetch before the first had finished.
     */
    const pending = fetchAllRows(MONTHLY_TOTALS_VIEW, columns, {
        signal,
        filters: [{ column: SCOPE_COLUMN, values: [trendScope()] }]
    });

    state.monthly.cache.set(key, pending);
    pending.catch(() => state.monthly.cache.delete(key));

    return pending;
}


/*
 * One maker's thirty-two rows, filtered in the database rather than
 * by reading every maker and discarding the rest.
 */
function getMonthlyForMaker(maker, valueColumns, signal) {

    const schema = state.monthly.schema;
    /* Scope-keyed for the same reason getMonthlyTotals is. */
    const key =
        trendScope() + "\u0000" + maker + "\u0000" +
        (valueColumns ? valueColumns.join("|") : "");

    if (state.monthly.makerCache.has(key)) {
        return state.monthly.makerCache.get(key);
    }

    const columns = [
        schema.monthColumn,
        schema.yearColumn,
        schema.totalColumn,
        ...(valueColumns || [])
    ];

    const pending = fetchAllRows(MONTHLY_BY_MAKER_VIEW, columns, {
        signal,
        filters: [
            { column: SCOPE_COLUMN, values: [trendScope()] },
            { column: schema.entityColumn, values: [maker] }
        ]
    });

    state.monthly.makerCache.set(key, pending);
    pending.catch(() => state.monthly.makerCache.delete(key));

    return pending;
}


/*
 * industryRows carries every maker; selectedRows is whatever the
 * Maker select narrowed to, or the same rows when it is on All.
 */
function buildMonthlyPivot(industryRows, selectedRows, valueColumns) {

    const schema = state.monthly.schema;
    const years = new Set();
    const cells = new Map();

    const at = row => {

        const month = Number(row[schema.monthColumn]);
        const year = Number(row[schema.yearColumn]);

        if (!Number.isFinite(month) || !Number.isFinite(year)) {
            return null;
        }

        const start = fiscalYearStart(month, year);

        years.add(start);

        const id = `${start}:${month}`;
        const cell = cells.get(id) || { industry: 0, selected: 0 };

        cells.set(id, cell);

        return cell;
    };

    /*
     * The class choice narrows IND as well as VOL, so a share is
     * read within the segment: Maruti against the Motor Car market,
     * not against every registration of every kind.
     */
    for (const row of industryRows) {

        const cell = at(row);

        if (cell) {
            cell.industry += valueColumns
                ? sumColumns(row, valueColumns)
                : toNumber(row[schema.totalColumn]);
        }
    }

    for (const row of selectedRows) {

        const cell = at(row);

        if (cell) {
            cell.selected += valueColumns
                ? sumColumns(row, valueColumns)
                : toNumber(row[schema.totalColumn]);
        }
    }

    /*
     * Adds a run of cells into one. Empty in, null out - a fiscal
     * year with no data at all should read as a dash, not as zero.
     *
     * MS is deliberately not carried through: a share of shares is
     * meaningless. monthlyCell recomputes it from the summed IND and
     * VOL, which weights each month by its own size.
     */
    const sumCells = list => {

        let industry = 0;
        let selected = 0;
        let present = false;

        for (const cell of list) {

            if (cell) {
                industry += cell.industry;
                selected += cell.selected;
                present = true;
            }
        }

        return present ? { industry, selected } : null;
    };

    const rows = [...years].sort((a, b) => a - b).map(start => {

        const months = FISCAL_MONTH_ORDER.map(
            month => cells.get(`${start}:${month}`) || null
        );

        return {
            start,
            label: fiscalYearLabel(start),
            months,
            /*
             * The first and last fiscal years are usually partial -
             * the data starts in Jan 2024 and stops mid-2026 - so
             * these totals cover the months actually present, which
             * is what the empty month cells beside them show.
             */
            total: sumCells(months)
        };
    });

    const totals = FISCAL_MONTH_ORDER.map(month => {

        let industry = 0;
        let selected = 0;
        let present = false;

        for (const start of years) {

            const cell = cells.get(`${start}:${month}`);

            if (cell) {
                industry += cell.industry;
                selected += cell.selected;
                present = true;
            }
        }

        return present ? { industry, selected } : null;
    });

    return { rows, totals, grandTotal: sumCells(totals) };
}


/*
 * `extra` marks the trailing Total column, which is otherwise an
 * ordinary triple of cells.
 */
function monthlyCell(cell, extra = "") {

    const mark = extra ? ` ${extra}` : "";

    if (!cell) {
        return `
            <td class="numeric monthly-trend__empty${mark}">&mdash;</td>
            <td class="numeric monthly-trend__empty${mark}">&mdash;</td>
            <td class="numeric monthly-trend__empty${mark}">&mdash;</td>
        `;
    }

    const share = cell.industry > 0
        ? (cell.selected / cell.industry) * 100
        : 0;

    return `
        <td class="numeric${mark}">${formatIndianNumber(cell.industry)}</td>
        <td class="numeric monthly-trend__vol${mark}">${formatIndianNumber(cell.selected)}</td>
        <td class="numeric monthly-trend__ms${mark}">${share.toFixed(1)}%</td>
    `;
}


function renderMonthlyTrend(pivot) {

    const months = FISCAL_MONTH_ORDER.map(
        number => MONTH_TABLES.find(month => month.number === number)
    );

    if (dom.monthlyTrendHead) {

        dom.monthlyTrendHead.innerHTML = `
            <tr>
                <th rowspan="2" class="monthly-trend__year-head">
                    Fiscal Year
                </th>
                ${months.map(month => `
                    <th colspan="3" class="monthly-trend__month-head">
                        ${month.label}
                    </th>
                `).join("")}
                <th
                    colspan="3"
                    class="monthly-trend__month-head monthly-trend__total-head"
                >
                    Total
                </th>
            </tr>
            <tr>
                ${months.map(() => `
                    <th class="numeric monthly-trend__sub">IND</th>
                    <th class="numeric monthly-trend__sub">VOL</th>
                    <th class="numeric monthly-trend__sub">MS</th>
                `).join("")}
                <th class="numeric monthly-trend__sub monthly-trend__total-cell">IND</th>
                <th class="numeric monthly-trend__sub monthly-trend__total-cell">VOL</th>
                <th class="numeric monthly-trend__sub monthly-trend__total-cell">MS</th>
            </tr>
        `;
    }

    if (dom.monthlyTrendBody) {

        /*
         * Wrapped rather than passed by reference: map hands the
         * index in as the second argument, which monthlyCell now
         * uses for the column class.
         */
        dom.monthlyTrendBody.innerHTML = pivot.rows.map(row => `
            <tr>
                <th scope="row" class="monthly-trend__year">${row.label}</th>
                ${row.months.map(cell => monthlyCell(cell)).join("")}
                ${monthlyCell(row.total, "monthly-trend__total-cell")}
            </tr>
        `).join("");
    }

    if (dom.monthlyTrendFoot) {

        dom.monthlyTrendFoot.innerHTML = `
            <tr>
                <th scope="row" class="monthly-trend__year">Total</th>
                ${pivot.totals.map(cell => monthlyCell(cell)).join("")}
                ${monthlyCell(pivot.grandTotal, "monthly-trend__total-cell")}
            </tr>
        `;
    }
}


function setMonthlyTrendState(view) {

    if (dom.monthlyTrendLoading) {
        dom.monthlyTrendLoading.hidden = view !== "loading";
    }

    if (dom.monthlyTrendError) {
        dom.monthlyTrendError.hidden = view !== "error";
    }

    if (dom.monthlyTrendContent) {
        dom.monthlyTrendContent.hidden = view !== "ready";
    }
}


/*
 * The maker list belongs to one scope, so it is thrown away when the
 * scope changes rather than carried across. The two row caches are
 * keyed by scope and can stay.
 */
function resetTrendForScope() {

    const scope = trendScope();

    if (state.monthly.scope === scope) {
        return;
    }

    state.monthly.scope = scope;
    state.monthly.makers = null;

    /* A maker absent from the new scope falls back to All Makers. */
    state.trendMaker = CONFIG.ALL;
}


async function loadMonthlyTrend(signal) {

    if (!dom.monthlyTrendContent) {
        return;
    }

    /*
     * GJ13 has no month tables behind it, so there is nothing to
     * draw. Saying so beats an empty grid that looks like a bug.
     */
    if (SCOPES_WITHOUT_TREND.has(trendScope())) {

        setMonthlyTrendState("error");

        if (dom.monthlyTrendErrorText) {
            dom.monthlyTrendErrorText.textContent =
                `No month-level data has been loaded for ` +
                `${currentView().scopeLabel} yet, so the trend cannot be ` +
                "shown for this scope. Every other scope has it.";
        }

        return;
    }

    try {

        setMonthlyTrendState("loading");

        resetTrendForScope();

        await describeMonthlySchema();

        if (!state.trendOptionsLoaded) {
            loadTrendClassOptions();
            state.trendOptionsLoaded = true;
        }

        const valueColumns = monthlyValueColumns();

        /*
         * The industry series is always needed. A chosen maker adds
         * one more small read; on All Makers the same rows serve as
         * both sides of the comparison.
         */
        const [industryRows] = await Promise.all([
            getMonthlyTotals(valueColumns, signal),
            loadTrendMakerOptions(signal)
        ]);

        const selectedRows = isAll(state.trendMaker)
            ? industryRows
            : await getMonthlyForMaker(state.trendMaker, valueColumns, signal);

        const pivot = buildMonthlyPivot(
            industryRows,
            selectedRows,
            valueColumns
        );

        renderMonthlyTrend(pivot);

        /*
         * With no maker and no class chosen, "the selection" is the
         * whole industry, so VOL repeats IND and every share is
         * 100%. That is correct but useless, so say why.
         */
        if (dom.monthlyTrendHint) {

            const unnarrowed =
                isAll(state.trendMaker) && isAll(state.trendClass);

            dom.monthlyTrendHint.hidden = !unnarrowed;

            dom.monthlyTrendHint.textContent = unnarrowed
                ? "Choose a Maker or Class above to make VOL and MS " +
                  "meaningful. With both set to All, VOL is the whole " +
                  "industry, so it repeats IND and every share reads 100%."
                : "";
        }

        if (dom.monthlyTrendMeta) {

            const selected = pivot.totals.reduce(
                (sum, cell) => sum + (cell ? cell.selected : 0),
                0
            );

            dom.monthlyTrendMeta.textContent =
                `${currentView().scopeLabel} · ` +
                `${pivot.rows.length} fiscal years · ` +
                `${formatIndianNumber(selected)} in selection`;
        }

        setMonthlyTrendState("ready");

    } catch (error) {

        if (isAbortError(error)) {
            return;
        }

        console.error("Monthly trend failed:", error);

        if (dom.monthlyTrendErrorText) {
            dom.monthlyTrendErrorText.textContent = toUserMessage(
                error,
                "The monthly trend could not be loaded."
            );
        }

        setMonthlyTrendState("error");
    }
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
    "Can't reach the database right now. Check your connection, " +
    "then press Retry.";


/*
 * A table the API does not know about. Since the tables are named
 * in this file, the usual cause is a stale cached copy of it -
 * GitHub Pages serves script.js with max-age=600, so for ten
 * minutes after a deploy a browser can still be asking for tables
 * that were renamed or dropped.
 */
const TABLE_MISSING_MESSAGE =
    "This page is asking for a table that no longer exists, which " +
    "usually means it is running a cached copy. Reload with " +
    "Ctrl+Shift+R (Cmd+Shift+R on a Mac).";


function isTableMissing(error) {

    if (!error) {
        return false;
    }

    if (error.code === "PGRST205") {
        return true;
    }

    return /could not find the table/i.test(String(error.message || error));
}


function isDatabaseUnreachable(error) {

    if (!error || isTableMissing(error)) {
        return false;
    }

    if (error.code === "PGRST002" || error.code === "FETCH_FAILED") {
        return true;
    }

    const text = String(error.message || error);

    /*
     * Matched narrowly: PGRST205 also says "schema cache", and that
     * one means the table is gone, not the database.
     */
    return (
        /could not query the database/i.test(text) ||
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

    if (isTableMissing(error)) {
        return TABLE_MISSING_MESSAGE;
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

    const viewChanged = state.view !== previousView;
    const yearChanged = state.year !== previousYear;

    /*
     * Only the scope selects a different table now. Its class
     * columns differ from the previous scope's, so the cache, the
     * schema and the class taxonomy all have to be rebuilt.
     */
    if (viewChanged) {

        state.tableCache = new Map();

        await discoverSchema();

        applyViewVisibility();
        loadMonths();
        loadClassFilters();
    }

    /*
     * A year change keeps the same table and its cached rows - the
     * year is a column now - so nothing is refetched. Only the
     * entity list narrows, since makers come and go between years.
     */
    if (viewChanged || yearChanged) {

        await loadEntityOptions(controller.signal);

        updateViewLabels();
        readFiltersFromUI();
    }

    enforceFilterCompatibility();
    readFiltersFromUI();

    state.currentPage = 1;

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
        renderTable();

        /*
         * Deliberately not awaited. The trend reads twelve separate
         * tables, so letting it settle on its own keeps the main
         * table on screen at the usual speed; it reports its own
         * loading and failure states.
         */
        loadMonthlyTrend(controller.signal);

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
        dom.trendMakerFilter,
        dom.trendClassFilter,
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

    state.trendMaker = CONFIG.ALL;
    state.trendClass = CONFIG.ALL;

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

    /*
     * The trend's own maker only affects the trend, so it redraws
     * that section rather than running the whole dashboard.
     */
    if (dom.trendMakerFilter) {

        [dom.trendMakerFilter, dom.trendClassFilter].forEach(element => {

            if (!element) {
                return;
            }

            element.addEventListener("change", async () => {

                state.trendMaker = dom.trendMakerFilter
                    ? dom.trendMakerFilter.value
                    : CONFIG.ALL;

                state.trendClass = dom.trendClassFilter
                    ? dom.trendClassFilter.value
                    : CONFIG.ALL;

                /*
                 * Clicking an option already writes the input, but a
                 * change raised any other way would leave the visible
                 * text behind the value.
                 */
                refreshCombo(element);

                await loadMonthlyTrend();
            });
        });
    }

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
        updateYearRangeHeader();

        await applyFilters({ global: true });

    } catch (error) {

        console.error("Dashboard initialization failed:", error);

        state.rows = [];
        state.filteredRows = [];
        state.dimensionTotal = 0;
        state.kpis = emptyKPIs();

        updateKPICards();

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
