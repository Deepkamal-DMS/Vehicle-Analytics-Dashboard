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
        /* The last rendered grid, kept so the export can write it. */
        pivot: null,
        cache: new Map(),
        makerCache: new Map()
    },

    /*
     * The trend carries its own maker choice, independent of the
     * sidebar's, so the two tables can be read against different
     * makers at the same time.
     */
    /*
     * The trend's maker choice takes several at once. Empty means
     * every maker, so VOL repeats IND; one behaves as it always
     * has; two or more split each fiscal year into a row per maker.
     */
    trendMakers: [],
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
        "detailsDownloadButton",
        "detailsPdfButton",
        "trendDownloadButton",
        "trendPdfButton",
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
        "monthlyTrendTable",

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
 * Combos that take more than one value at a time. The list stays
 * open as options are ticked, and the native <select> underneath
 * holds "all" rather than any one of them - nothing reads its
 * value for these, comboValues() is the source of truth.
 */
const MULTI_COMBOS = new Set(["trendMakerFilter"]);

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
        open: false,
        multiple: MULTI_COMBOS.has(select.id),
        /* Only meaningful when multiple; empty means "all". */
        values: []
    };

    if (combo.multiple) {
        wrapper.classList.add("combo--multiple");
        input.setAttribute("aria-multiselectable", "true");
    }

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

    if (combo.multiple) {

        /* Drop anything the new option list no longer offers. */
        const offered = new Set(combo.options.map(option => option.value));

        combo.values = combo.values.filter(value => offered.has(value));

        combo.input.value = multiComboLabel(combo);

    } else {
        combo.input.value = comboLabelForValue(combo, select.value);
    }

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

    /*
     * Ticked options come first. The list renders only its first
     * 200 entries, and with 2,552 makers a selection halfway down
     * the alphabet would otherwise be invisible - the user could
     * not see, or untick, what they had already chosen.
     */
    if (combo.multiple && combo.values.length > 0) {

        const chosen = [];
        const rest = [];

        combo.matches.forEach(option => {
            (combo.values.includes(option.value) ? chosen : rest).push(option);
        });

        combo.matches = chosen.concat(rest);
    }

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

        const chosen = combo.multiple
            ? (isAll(option.value)
                ? combo.values.length === 0
                : combo.values.includes(option.value))
            : option.value === combo.select.value;

        if (chosen) {
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
     * from where the user already is. For a multi combo that is
     * the first thing ticked, or the top of the list if nothing is.
     */
    const from = combo.multiple
        ? combo.values[0]
        : combo.select.value;

    combo.activeIndex = combo.matches.findIndex(
        option => option.value === from
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
     * like a selection. A multi combo has no single value to read
     * it from; its native select stays on "all" throughout.
     */
    combo.input.value = combo.multiple
        ? multiComboLabel(combo)
        : comboLabelForValue(combo, combo.select.value);
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


/*
 * The values a combo currently holds, always as an array. Empty
 * means "all", for single and multiple alike, so callers do not
 * have to know which kind they were handed.
 */
function comboValues(select) {

    const combo = combos.get(select);

    if (combo && combo.multiple) {
        return combo.values.slice();
    }

    const value = select ? normalizeString(select.value) : "";

    return value && !isAll(value) ? [value] : [];
}


/*
 * What the input shows when the list is closed. One name reads as
 * itself; several would not fit, so they are counted.
 */
function multiComboLabel(combo) {

    if (combo.values.length === 0) {
        return "";
    }

    if (combo.values.length === 1) {
        return comboLabelForValue(combo, combo.values[0]);
    }

    return `${combo.values.length} makers`;
}


function commitComboValue(combo, value) {

    if (combo.multiple) {

        /* "All" is the absence of a selection, not one more of them. */
        if (isAll(value)) {
            combo.values = [];
        } else {

            const at = combo.values.indexOf(value);

            if (at === -1) {
                combo.values.push(value);
            } else {
                combo.values.splice(at, 1);
            }
        }

        combo.input.value = multiComboLabel(combo);

        /*
         * Left open: picking several in a row should not mean
         * reopening the list between each one. The query is
         * cleared so the full list comes back.
         */
        renderComboList(combo, "");

        combo.select.dispatchEvent(new Event("change", { bubbles: true }));

        return;
    }

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

    /*
     * Most cells in this table are zero - a maker builds one kind of
     * vehicle and nothing else - so a zero is marked and set in a
     * lighter ink. It leaves the figures that exist standing out of
     * the grid rather than buried in it.
     */
    if (toNumber(value) === 0) {
        cell.classList.add("is-zero");
    }

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

    /* Nothing on screen means nothing to write. */
    [dom.detailsDownloadButton, dom.detailsPdfButton].forEach(button => {
        if (button) {
            button.disabled = rows.length === 0;
        }
    });

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
        "All Makers"
    );

    /* refreshCombo drops any maker this scope does not offer. */
    state.trendMakers = comboValues(dom.trendMakerFilter);
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
 * The chosen makers' rows, filtered in the database rather than by
 * reading every maker and discarding the rest. One request covers
 * all of them - PostgREST takes a list - and the Maker column comes
 * back so the rows can be split apart again.
 */
function getMonthlyForMakers(makers, valueColumns, signal) {

    const schema = state.monthly.schema;

    /* JSON so a maker containing the separator cannot collide. */
    const key =
        trendScope() + " " + JSON.stringify(makers) + " " +
        (valueColumns ? valueColumns.join("|") : "");

    if (state.monthly.makerCache.has(key)) {
        return state.monthly.makerCache.get(key);
    }

    const columns = [
        schema.entityColumn,
        schema.monthColumn,
        schema.yearColumn,
        schema.totalColumn,
        ...(valueColumns || [])
    ];

    const pending = fetchAllRows(MONTHLY_BY_MAKER_VIEW, columns, {
        signal,
        filters: [
            { column: SCOPE_COLUMN, values: [trendScope()] },
            { column: schema.entityColumn, values: makers }
        ]
    });

    state.monthly.makerCache.set(key, pending);
    pending.catch(() => state.monthly.makerCache.delete(key));

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
/*
 * Builds the grid.
 *
 * industryRows is IND - every maker in the scope. series is one
 * entry per selected maker, each with its own rows; with none
 * selected it holds a single unnamed entry standing for the whole
 * industry, which is why VOL then repeats IND.
 *
 * With two or more makers the grid gains a Maker column and each
 * fiscal year becomes one row per maker, so the makers can be read
 * against each other month by month.
 */
function buildMonthlyPivot(industryRows, series, valueColumns) {

    const schema = state.monthly.schema;
    const years = new Set();

    /* start:month -> IND */
    const industry = new Map();

    /* maker -> (start:month -> VOL) */
    const selected = new Map();

    const place = row => {

        const month = Number(row[schema.monthColumn]);
        const year = Number(row[schema.yearColumn]);

        if (!Number.isFinite(month) || !Number.isFinite(year)) {
            return null;
        }

        const start = fiscalYearStart(month, year);

        years.add(start);

        return `${start}:${month}`;
    };

    const measure = row => valueColumns
        ? sumColumns(row, valueColumns)
        : toNumber(row[schema.totalColumn]);

    /*
     * The class choice narrows IND as well as VOL, so a share is
     * read within the segment: Maruti against the Motor Car market,
     * not against every registration of every kind.
     */
    for (const row of industryRows) {

        const id = place(row);

        if (id) {
            industry.set(id, (industry.get(id) || 0) + measure(row));
        }
    }

    series.forEach(entry => {

        const own = new Map();

        selected.set(entry.maker, own);

        for (const row of entry.rows) {

            const id = place(row);

            if (id) {
                own.set(id, (own.get(id) || 0) + measure(row));
            }
        }
    });

    /*
     * Adds a run of cells into one. Empty in, null out - a fiscal
     * year with no data at all should read as a dash, not as zero.
     *
     * MS is deliberately not carried through: a share of shares is
     * meaningless. monthlyCell recomputes it from the summed IND and
     * VOL, which weights each month by its own size.
     */
    const sumCells = list => {

        let ind = 0;
        let vol = 0;
        let present = false;

        for (const cell of list) {

            if (cell) {
                ind += cell.industry;
                vol += cell.selected;
                present = true;
            }
        }

        return present ? { industry: ind, selected: vol } : null;
    };

    const cellFor = (maker, start, month) => {

        const id = `${start}:${month}`;

        if (!industry.has(id)) {
            return null;
        }

        const own = selected.get(maker);

        return {
            industry: industry.get(id) || 0,
            selected: own ? own.get(id) || 0 : 0
        };
    };

    const ordered = [...years].sort((a, b) => a - b);
    const multi = series.length > 1;

    const rows = [];

    ordered.forEach(start => {

        series.forEach((entry, index) => {

            const months = FISCAL_MONTH_ORDER.map(
                month => cellFor(entry.maker, start, month)
            );

            rows.push({
                start,
                /* The year is printed once per group, not per maker. */
                label: index === 0 ? fiscalYearLabel(start) : "",
                maker: multi ? entry.maker : null,
                /*
                 * The first and last fiscal years are usually partial -
                 * the data starts in Jan 2024 and stops mid-2026 - so
                 * these totals cover the months actually present, which
                 * is what the empty month cells beside them show.
                 */
                total: sumCells(months),
                months,
                firstOfYear: index === 0
            });
        });
    });

    /*
     * The footer is every maker at once, so with several selected it
     * reads as their combined volume against the industry.
     */
    const totals = FISCAL_MONTH_ORDER.map(month => {

        let ind = 0;
        let vol = 0;
        let present = false;

        ordered.forEach(start => {

            const id = `${start}:${month}`;

            if (!industry.has(id)) {
                return;
            }

            present = true;
            ind += industry.get(id) || 0;

            series.forEach(entry => {
                const own = selected.get(entry.maker);
                vol += own ? own.get(id) || 0 : 0;
            });
        });

        return present ? { industry: ind, selected: vol } : null;
    });

    return {
        rows,
        totals,
        grandTotal: sumCells(totals),
        multi,
        makers: series.map(entry => entry.maker).filter(Boolean)
    };
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

    /* What the export writes, so the two cannot disagree. */
    state.monthly.pivot = pivot;

    /*
     * The hairlines between month groups are placed by nth-child, so
     * the stylesheet has to know the rows gained a leading cell.
     */
    if (dom.monthlyTrendTable) {
        dom.monthlyTrendTable.classList.toggle(
            "monthly-trend__table--with-maker",
            Boolean(pivot.multi)
        );
    }

    [dom.trendDownloadButton, dom.trendPdfButton].forEach(button => {
        if (button) {
            button.disabled = pivot.rows.length === 0;
        }
    });

    const months = FISCAL_MONTH_ORDER.map(
        number => MONTH_TABLES.find(month => month.number === number)
    );

    if (dom.monthlyTrendHead) {

        /* The Maker column only appears when there is one to tell apart. */
        const makerHead = pivot.multi
            ? '<th rowspan="2" class="monthly-trend__maker-head">Maker</th>'
            : "";

        dom.monthlyTrendHead.innerHTML = `
            <tr>
                <th rowspan="2" class="monthly-trend__year-head">
                    Fiscal Year
                </th>
                ${makerHead}
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
            <tr${row.firstOfYear && pivot.multi
                ? ' class="monthly-trend__group-start"'
                : ""}>
                <th scope="row" class="monthly-trend__year">${row.label}</th>
                ${pivot.multi
                    ? `<td class="monthly-trend__maker" title="${
                        escapeHtml(row.maker)}">${escapeHtml(row.maker)}</td>`
                    : ""}
                ${row.months.map(cell => monthlyCell(cell)).join("")}
                ${monthlyCell(row.total, "monthly-trend__total-cell")}
            </tr>
        `).join("");
    }

    if (dom.monthlyTrendFoot) {

        /*
         * With several makers the footer is their combined volume,
         * so it is labelled as such rather than left ambiguous.
         */
        dom.monthlyTrendFoot.innerHTML = `
            <tr>
                <th scope="row" class="monthly-trend__year">Total</th>
                ${pivot.multi
                    ? `<td class="monthly-trend__maker">All ${
                        pivot.makers.length} selected</td>`
                    : ""}
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

    /* Makers absent from the new scope fall back to All Makers. */
    state.trendMakers = [];

    const combo = combos.get(dom.trendMakerFilter);

    if (combo) {
        combo.values = [];
    }
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

        /*
         * No maker chosen means the selection is the whole industry,
         * so the same rows serve as both sides and nothing more is
         * fetched. Otherwise every chosen maker comes back in one
         * request and is split apart by name here.
         */
        let series;

        if (state.trendMakers.length === 0) {

            series = [{ maker: null, rows: industryRows }];

        } else {

            const rows = await getMonthlyForMakers(
                state.trendMakers,
                valueColumns,
                signal
            );

            const byMaker = new Map(
                state.trendMakers.map(maker => [maker, []])
            );

            rows.forEach(row => {

                const bucket = byMaker.get(
                    row[state.monthly.schema.entityColumn]
                );

                if (bucket) {
                    bucket.push(row);
                }
            });

            series = state.trendMakers.map(maker => ({
                maker,
                rows: byMaker.get(maker) || []
            }));
        }

        const pivot = buildMonthlyPivot(
            industryRows,
            series,
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
                state.trendMakers.length === 0 && isAll(state.trendClass);

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
   23. XLSX EXPORT

   Writes a real .xlsx - a ZIP of XML parts - rather than a CSV
   named .xlsx or an HTML table served as application/vnd.ms-excel,
   which recent Excel opens behind a security warning.

   No library. The repo has no package.json and should keep it
   that way, and tools/xlsx-read.js already reads the format
   without one, so the writer matches.

   ZIP entries are STORED, not deflated. Deflate in the browser
   means CompressionStream, which is async and not in every
   browser the dashboard has to work in; storing costs file size
   on tables of a few thousand rows and nothing else. These export
   at a few hundred KB.

   Strings are inline (t="inlineStr") so there is no shared string
   table to build and keep in sync.
   ============================================================ */

const CRC_TABLE = (() => {

    const table = new Uint32Array(256);

    for (let n = 0; n < 256; n += 1) {

        let c = n;

        for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }

        table[n] = c >>> 0;
    }

    return table;
})();


function crc32(bytes) {

    let c = 0xffffffff;

    for (let at = 0; at < bytes.length; at += 1) {
        c = CRC_TABLE[(c ^ bytes[at]) & 0xff] ^ (c >>> 8);
    }

    return (c ^ 0xffffffff) >>> 0;
}


/*
 * The C0 controls Excel refuses, built from escapes so the source
 * carries no literal control characters of its own.
 */
const CONTROL_CHARACTERS = new RegExp(
    "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]",
    "g"
);


/*
 * Maker names come from the database and are written into innerHTML,
 * so they are escaped rather than trusted. Vahan has names carrying
 * ampersands - "TATA MOTORS LTD & CO" - which would otherwise break
 * the markup even with nothing malicious involved.
 */
function escapeHtml(value) {

    return String(value === null || value === undefined ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}


function xmlEscape(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        /* Excel rejects the C0 range outright, so drop it. */
        .replace(CONTROL_CHARACTERS, "");
}


/* 0 -> A, 25 -> Z, 26 -> AA. */
function columnLetter(index) {

    let letters = "";
    let n = index;

    for (;;) {

        letters = String.fromCharCode(65 + (n % 26)) + letters;

        if (n < 26) {
            return letters;
        }

        n = Math.floor(n / 26) - 1;
    }
}


/*
 * A cell is a number, or anything else rendered as text. null and
 * "" are written as an empty cell rather than a zero, so a gap in
 * the source stays a gap in the sheet.
 */
function sheetCell(value, reference, styleIndex) {

    const style = styleIndex ? ` s="${styleIndex}"` : "";

    if (value === null || value === undefined || value === "") {
        return "";
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${reference}"${style}><v>${value}</v></c>`;
    }

    return (
        `<c r="${reference}"${style} t="inlineStr">` +
        `<is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
    );
}


/*
 * rows: array of arrays. A cell may be a bare value or
 * { value, style } where style indexes the tiny stylesheet below:
 * 1 = bold, 2 = bold with a top rule, 3 = one decimal place.
 */
function buildSheetXml(rows, { merges = [], widths = [] } = {}) {

    const body = rows.map((cells, rowIndex) => {

        const inner = cells.map((cell, columnIndex) => {

            const reference = columnLetter(columnIndex) + (rowIndex + 1);

            return cell !== null && typeof cell === "object"
                ? sheetCell(cell.value, reference, cell.style)
                : sheetCell(cell, reference, 0);

        }).join("");

        return `<row r="${rowIndex + 1}">${inner}</row>`;

    }).join("");

    const cols = widths.length === 0
        ? ""
        : "<cols>" + widths.map((width, at) =>
            `<col min="${at + 1}" max="${at + 1}" width="${width}" ` +
            'customWidth="1"/>'
        ).join("") + "</cols>";

    const merged = merges.length === 0
        ? ""
        : `<mergeCells count="${merges.length}">` +
            merges.map(ref => `<mergeCell ref="${ref}"/>`).join("") +
            "</mergeCells>";

    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/' +
        'spreadsheetml/2006/main">' +
        cols +
        `<sheetData>${body}</sheetData>` +
        merged +
        "</worksheet>"
    );
}


const XLSX_STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/' +
    'spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts>' +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    "</fonts>" +
    '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/></border>' +
    '<border><left/><right/><top style="thin"/><bottom/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" ' +
    'borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" ' +
    'applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" ' +
    'applyFont="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" ' +
    'applyNumberFormat="1"/>' +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" ' +
    'builtinId="0"/></cellStyles>' +
    "</styleSheet>";


function xlsxParts(sheetName, sheetXml) {

    const name = xmlEscape(sheetName).slice(0, 31);

    return [
        {
            path: "[Content_Types].xml",
            data:
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Types xmlns="http://schemas.openxmlformats.org/' +
                'package/2006/content-types">' +
                '<Default Extension="rels" ContentType="application/' +
                'vnd.openxmlformats-package.relationships+xml"/>' +
                '<Default Extension="xml" ContentType="application/xml"/>' +
                '<Override PartName="/xl/workbook.xml" ContentType=' +
                '"application/vnd.openxmlformats-officedocument.' +
                'spreadsheetml.sheet.main+xml"/>' +
                '<Override PartName="/xl/worksheets/sheet1.xml" ContentType=' +
                '"application/vnd.openxmlformats-officedocument.' +
                'spreadsheetml.worksheet+xml"/>' +
                '<Override PartName="/xl/styles.xml" ContentType=' +
                '"application/vnd.openxmlformats-officedocument.' +
                'spreadsheetml.styles+xml"/>' +
                "</Types>"
        },
        {
            path: "_rels/.rels",
            data:
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Relationships xmlns="http://schemas.openxmlformats.org/' +
                'package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats' +
                '.org/officeDocument/2006/relationships/officeDocument" ' +
                'Target="xl/workbook.xml"/></Relationships>'
        },
        {
            path: "xl/workbook.xml",
            data:
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<workbook xmlns="http://schemas.openxmlformats.org/' +
                'spreadsheetml/2006/main" xmlns:r="http://schemas.' +
                'openxmlformats.org/officeDocument/2006/relationships">' +
                `<sheets><sheet name="${name}" sheetId="1" ` +
                'r:id="rId1"/></sheets></workbook>'
        },
        {
            path: "xl/_rels/workbook.xml.rels",
            data:
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Relationships xmlns="http://schemas.openxmlformats.org/' +
                'package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats' +
                '.org/officeDocument/2006/relationships/worksheet" ' +
                'Target="worksheets/sheet1.xml"/>' +
                '<Relationship Id="rId2" Type="http://schemas.openxmlformats' +
                '.org/officeDocument/2006/relationships/styles" ' +
                'Target="styles.xml"/></Relationships>'
        },
        { path: "xl/styles.xml", data: XLSX_STYLES },
        { path: "xl/worksheets/sheet1.xml", data: sheetXml }
    ];
}


/*
 * Raw deflate, which is exactly what ZIP method 8 stores. Returns
 * null where the browser has no CompressionStream, and the caller
 * falls back to storing the entry uncompressed - a valid ZIP either
 * way, just a bigger one.
 *
 * Worth the trouble: an All India export is around 150,000 cells,
 * most of them a zero, which stores at about 4 MB and deflates to a
 * few hundred KB.
 */
async function deflate(bytes, format) {

    if (typeof CompressionStream === "undefined") {
        return null;
    }

    try {

        const stream = new Blob([bytes])
            .stream()
            .pipeThrough(new CompressionStream(format));

        return new Uint8Array(await new Response(stream).arrayBuffer());

    } catch (error) {

        console.warn("deflate unavailable, storing instead:", error);

        return null;
    }
}


/*
 * ZIP method 8 is RAW deflate - RFC 1951, no wrapper.
 */
function deflateRaw(bytes) {

    return deflate(bytes, "deflate-raw");
}


/*
 * PDF's /FlateDecode is ZLIB deflate - RFC 1950, the two-byte
 * header and trailing Adler-32 included. This is not the same
 * thing as the ZIP above, and a reader handed raw deflate here
 * silently renders a blank page rather than reporting an error.
 */
function deflateZlib(bytes) {

    return deflate(bytes, "deflate");
}


/*
 * Written straight into one Uint8Array rather than concatenated, so
 * a large sheet does not copy itself repeatedly.
 */
async function zipArchive(parts) {

    const encoder = new TextEncoder();

    const entries = [];

    for (const part of parts) {

        const raw = encoder.encode(part.data);
        const packed = await deflateRaw(raw);

        /* Only worth it if it actually came out smaller. */
        const deflated = packed !== null && packed.length < raw.length;

        entries.push({
            name: encoder.encode(part.path),
            data: deflated ? packed : raw,
            method: deflated ? 8 : 0,
            size: raw.length,
            crc: crc32(raw),
            offset: 0
        });
    }

    const LOCAL = 30;
    const CENTRAL = 46;
    const END = 22;

    let size = END;

    entries.forEach(entry => {
        size += LOCAL + entry.name.length + entry.data.length;
        size += CENTRAL + entry.name.length;
    });

    const out = new Uint8Array(size);
    const view = new DataView(out.buffer);

    let at = 0;

    entries.forEach(entry => {

        entry.offset = at;

        view.setUint32(at, 0x04034b50, true);
        view.setUint16(at + 4, 20, true);
        view.setUint16(at + 6, 0x0800, true);   /* UTF-8 names */
        view.setUint16(at + 8, entry.method, true);
        view.setUint16(at + 10, 0, true);       /* time */
        view.setUint16(at + 12, 0x21, true);    /* date: 1 Jan 1980 */
        view.setUint32(at + 14, entry.crc, true);
        view.setUint32(at + 18, entry.data.length, true);
        view.setUint32(at + 22, entry.size, true);
        view.setUint16(at + 26, entry.name.length, true);
        view.setUint16(at + 28, 0, true);

        at += LOCAL;
        out.set(entry.name, at);
        at += entry.name.length;
        out.set(entry.data, at);
        at += entry.data.length;
    });

    const directoryAt = at;

    entries.forEach(entry => {

        view.setUint32(at, 0x02014b50, true);
        view.setUint16(at + 4, 20, true);
        view.setUint16(at + 6, 20, true);
        view.setUint16(at + 8, 0x0800, true);
        view.setUint16(at + 10, entry.method, true);
        view.setUint16(at + 12, 0, true);
        view.setUint16(at + 14, 0x21, true);
        view.setUint32(at + 16, entry.crc, true);
        view.setUint32(at + 20, entry.data.length, true);
        view.setUint32(at + 24, entry.size, true);
        view.setUint16(at + 28, entry.name.length, true);
        view.setUint16(at + 30, 0, true);
        view.setUint16(at + 32, 0, true);
        view.setUint16(at + 34, 0, true);
        view.setUint16(at + 36, 0, true);
        view.setUint32(at + 38, 0, true);
        view.setUint32(at + 42, entry.offset, true);

        at += CENTRAL;
        out.set(entry.name, at);
        at += entry.name.length;
    });

    view.setUint32(at, 0x06054b50, true);
    view.setUint16(at + 8, entries.length, true);
    view.setUint16(at + 10, entries.length, true);
    view.setUint32(at + 12, at - directoryAt, true);
    view.setUint32(at + 16, directoryAt, true);

    return out;
}


/* Shared by both formats: hand the bytes to the browser as a file. */
function saveBlob(blob, fileName) {

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    link.remove();

    /* Revoked late: Safari has not finished reading it synchronously. */
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}


async function downloadWorkbook(fileName, sheetName, rows, options) {

    const archive = await zipArchive(
        xlsxParts(sheetName, buildSheetXml(rows, options))
    );

    saveBlob(
        new Blob([archive], {
            type: "application/vnd.openxmlformats-officedocument." +
                "spreadsheetml.sheet"
        }),
        fileName
    );
}


/*
 * Spelled into the file so a downloaded sheet can be read months
 * later without having to remember what was on screen.
 */
function activeFilterSummary({ trend = false } = {}) {

    const parts = [`Scope: ${currentView().scopeLabel}`];

    if (trend) {

        parts.push(
            `Maker: ${state.trendMakers.length === 0
                ? "All"
                : state.trendMakers.join(", ")}`,
            `Class: ${isAll(state.trendClass) ? "All" : state.trendClass}`
        );

    } else {

        parts.push(`Year: ${state.year}`);

        if (state.filters.makers.length > 0) {
            parts.push(`Maker: ${state.filters.makers.join(", ")}`);
        }

        if (!isAll(state.filters.category)) {
            parts.push(`Category: ${state.filters.category}`);
        }

        if (!isAll(state.filters.subcategory)) {
            parts.push(`Subcategory: ${state.filters.subcategory}`);
        }

        if (!isAll(state.filters.month)) {
            parts.push(`Month: ${state.filters.month}`);
        }

        const terms = state.searchTerms.filter(term => term.trim() !== "");

        if (terms.length > 0) {
            parts.push(`Search: ${terms.join(" | ")}`);
        }
    }

    return parts.join("  ·  ");
}


/* ============================================================
   PDF

   Also written by hand, for the same reason the xlsx is: no
   package.json, no CDN script.

   PDF is a plain byte format, so a table of text needs no library
   - only the cross-reference table has to be right, since a byte
   offset that is off by one makes the whole file unreadable.
   Helvetica is one of the fourteen fonts every reader carries, so
   nothing is embedded.

   Both tables are far wider than a page. Rather than shrink them
   to nothing, columns are laid out at a readable size and the
   sheet is split into bands that continue on later pages, the way
   a spreadsheet prints. Every page repeats the entity column and
   the header row so a band is readable on its own.
   ============================================================ */

/* A4 landscape, in points. */
const PDF_PAGE = { width: 842, height: 595 };

const PDF_MARGIN = { top: 44, right: 28, bottom: 34, left: 28 };

const PDF_FONT_SIZE = 7.2;
const PDF_HEAD_SIZE = 7.2;
const PDF_TITLE_SIZE = 12;
const PDF_ROW_HEIGHT = 12.5;


/*
 * Helvetica's advance widths, per 1000 units, for the printable
 * ASCII range starting at space. Without these every column would
 * have to be sized by guesswork.
 */
const HELVETICA_WIDTHS = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333,
    278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278,
    584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278,
    500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944,
    667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556,
    278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500,
    278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];


function pdfTextWidth(text, size) {

    let units = 0;

    for (let at = 0; at < text.length; at += 1) {

        const code = text.charCodeAt(at);
        const index = code - 32;

        units += index >= 0 && index < HELVETICA_WIDTHS.length
            ? HELVETICA_WIDTHS[index]
            : 556;
    }

    return (units / 1000) * size;
}


/*
 * WinAnsi puts a handful of typographic characters in 0x80-0x9F,
 * where Unicode has control codes instead, so they need mapping by
 * hand. The em dash is the one that matters here - it is in every
 * title - but the quotes and the ellipsis turn up in maker names.
 */
const WINANSI_SPECIALS = new Map([
    [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
    [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
    [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
    [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
    [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
    [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]
]);


/*
 * WinAnsi is a single-byte encoding, so anything outside it is
 * replaced rather than written as mojibake.
 */
function pdfEscape(text) {

    let out = "";

    for (const character of String(text)) {

        const code = character.codePointAt(0);

        if (character === "(" || character === ")" || character === "\\") {
            out += "\\" + character;
        } else if (code >= 32 && code <= 126) {
            out += character;
        } else if (WINANSI_SPECIALS.has(code)) {
            out += "\\" + WINANSI_SPECIALS.get(code).toString(8).padStart(3, "0");
        } else if (code >= 160 && code <= 255) {
            out += "\\" + code.toString(8).padStart(3, "0");
        } else {
            out += "?";
        }
    }

    return out;
}


function pdfTruncate(text, size, limit) {

    const value = String(text === null || text === undefined ? "" : text);

    if (pdfTextWidth(value, size) <= limit) {
        return value;
    }

    let cut = value;

    while (cut.length > 1 && pdfTextWidth(cut + "...", size) > limit) {
        cut = cut.slice(0, -1);
    }

    return cut + "...";
}


/*
 * A page of content, built as a PDF content stream. Cells are
 * { text, align, bold }, columns carry their widths.
 */
/*
 * A cell is a string, or { text, span, align } where span merges
 * that many columns - which is how a month's name sits centred over
 * its IND / VOL / MS triplet, the way it does in the spreadsheet.
 */
function pdfCell(cell) {

    if (cell === null || cell === undefined) {
        return { text: "", span: 1, align: null };
    }

    if (typeof cell === "object") {
        return {
            text: cell.text === undefined ? "" : String(cell.text),
            span: cell.span || 1,
            align: cell.align || null
        };
    }

    return { text: String(cell), span: 1, align: null };
}


function pdfDrawRow(cells, columns, x0, y, size, bold, lead = 1) {

    const parts = [`BT /${bold ? "F2" : "F1"} ${size} Tf`];

    let x = x0;
    let column = 0;

    cells.forEach((raw, index) => {

        const cell = pdfCell(raw);

        let width = 0;

        for (let n = 0; n < cell.span && column + n < columns.length; n += 1) {
            width += columns[column + n];
        }

        column += cell.span;

        if (cell.text !== "") {

            const text = pdfTruncate(cell.text, size, width - 6);

            /*
             * Numbers right-align under their headings; the leading
             * label columns do not. A span always centres, since the
             * only spanning cell is a group heading.
             */
            /*
             * Numbers right-align under their headings; the leading
             * label columns - fiscal year, maker - read left. A span
             * always centres, since the only spanning cell is a
             * group heading.
             */
            const align = cell.align ||
                (cell.span > 1 ? "center" : index < lead ? "left" : "right");

            let at = x + 3;

            if (align === "right") {
                at = x + width - 3 - pdfTextWidth(text, size);
            } else if (align === "center") {
                at = x + (width - pdfTextWidth(text, size)) / 2;
            }

            parts.push(`1 0 0 1 ${at.toFixed(2)} ${y.toFixed(2)} Tm`);
            parts.push(`(${pdfEscape(text)}) Tj`);
        }

        x += width;
    });

    parts.push("ET");

    return parts.join("\n");
}


/*
 * Splits the columns into bands that each fit the printable width.
 * The lead columns repeat on every band so a page of numbers is
 * never anonymous, and a band never splits a group - the three
 * cells under one month stay together.
 */
function pdfBands(widths, available, lead, groupSize) {

    const leadWidth = widths.slice(0, lead).reduce((a, b) => a + b, 0);
    const bands = [];

    let current = [];
    let used = leadWidth;

    for (let index = lead; index < widths.length; index += groupSize) {

        const group = [];
        let groupWidth = 0;

        for (let n = 0; n < groupSize && index + n < widths.length; n += 1) {
            group.push(index + n);
            groupWidth += widths[index + n];
        }

        if (used + groupWidth > available && current.length > 0) {
            bands.push(current);
            current = [];
            used = leadWidth;
        }

        current.push(...group);
        used += groupWidth;
    }

    if (current.length > 0) {
        bands.push(current);
    }

    return bands;
}


/*
 * rows[0 .. headerCount - 1] are the header, repeated on every
 * page. Any row listed in options.footRows is drawn in bold under
 * a rule.
 */
async function buildPdf(title, subtitle, rows, widths, options = {}) {

    const lead = options.lead || 1;
    const groupSize = options.groupSize || 1;
    const headerCount = options.headerCount || 1;
    const foot = new Set(options.footRows || []);

    const printWidth = PDF_PAGE.width - PDF_MARGIN.left - PDF_MARGIN.right;
    const bands = pdfBands(widths, printWidth, lead, groupSize);

    const bodyTop = PDF_PAGE.height - PDF_MARGIN.top - 26;

    const perPage = Math.floor(
        (bodyTop - PDF_MARGIN.bottom - headerCount * PDF_ROW_HEIGHT) /
        PDF_ROW_HEIGHT
    );

    const headers = rows.slice(0, headerCount);
    const body = rows.slice(headerCount);

    const pages = [];

    /*
     * A header cell may span its group, so the cells for a band are
     * picked by walking the row and keeping whatever covers a wanted
     * column. Plain rows are one cell per column and fall out of the
     * same walk.
     */
    const pickCells = (row, band) => {

        const wanted = new Set(band);
        const out = [];

        let column = 0;

        row.forEach(raw => {

            const cell = pdfCell(raw);
            const covers = [];

            for (let n = 0; n < cell.span; n += 1) {
                covers.push(column + n);
            }

            column += cell.span;

            if (covers[0] < lead) {
                out.push(raw);
                return;
            }

            const kept = covers.filter(index => wanted.has(index));

            if (kept.length > 0) {
                out.push(cell.span > 1 ? { ...pdfCell(raw), span: kept.length } : raw);
            }
        });

        return out;
    };

    bands.forEach((band, bandIndex) => {

        const columns = widths.slice(0, lead)
            .concat(band.map(index => widths[index]));

        const bandWidth = columns.reduce((a, b) => a + b, 0);

        for (let from = 0; from < body.length; from += perPage) {

            const slice = body.slice(from, from + perPage);
            const out = [];

            out.push(
                `BT /F2 ${PDF_TITLE_SIZE} Tf 1 0 0 1 ${PDF_MARGIN.left} ` +
                `${PDF_PAGE.height - PDF_MARGIN.top} Tm ` +
                `(${pdfEscape(title)}) Tj ET`
            );

            out.push(
                `BT /F1 7 Tf 0.35 0.4 0.47 rg 1 0 0 1 ${PDF_MARGIN.left} ` +
                `${PDF_PAGE.height - PDF_MARGIN.top - 13} Tm ` +
                `(${pdfEscape(subtitle)}) Tj ET 0 0 0 rg`
            );

            let y = bodyTop;

            /* The header rows sit on one tinted band. */
            out.push("0.93 0.95 0.98 rg");
            out.push(
                `${PDF_MARGIN.left} ` +
                `${(y - 3.5 - (headerCount - 1) * PDF_ROW_HEIGHT).toFixed(2)} ` +
                `${bandWidth.toFixed(2)} ` +
                `${(PDF_ROW_HEIGHT * headerCount).toFixed(2)} re f`
            );
            out.push("0 0 0 rg");

            headers.forEach(row => {
                out.push(
                    pdfDrawRow(pickCells(row, band), columns, PDF_MARGIN.left,
                        y, PDF_HEAD_SIZE, true, lead)
                );
                y -= PDF_ROW_HEIGHT;
            });

            /* A rule under the header, and one above the footer row. */
            out.push("0.78 0.82 0.88 RG 0.7 w");
            out.push(
                `${PDF_MARGIN.left} ${(y + PDF_ROW_HEIGHT - 3.5).toFixed(2)} m ` +
                `${(PDF_MARGIN.left + bandWidth).toFixed(2)} ` +
                `${(y + PDF_ROW_HEIGHT - 3.5).toFixed(2)} l S`
            );

            slice.forEach((row, index) => {

                const absolute = from + index + headerCount;
                const isFoot = foot.has(absolute);

                /*
                 * Every other row gets a whisper of tint. Enough to
                 * follow a row across forty columns, not enough to
                 * read as a highlight.
                 */
                if (!isFoot && index % 2 === 1) {
                    out.push("0.975 0.98 0.988 rg");
                    out.push(
                        `${PDF_MARGIN.left} ${(y - 3.5).toFixed(2)} ` +
                        `${bandWidth.toFixed(2)} ${PDF_ROW_HEIGHT.toFixed(2)} re f`
                    );
                    out.push("0 0 0 rg");
                }

                if (isFoot) {
                    out.push("0.78 0.82 0.88 RG 0.7 w");
                    out.push(
                        `${PDF_MARGIN.left} ${(y + PDF_ROW_HEIGHT - 3.5).toFixed(2)} m ` +
                        `${(PDF_MARGIN.left + bandWidth).toFixed(2)} ` +
                        `${(y + PDF_ROW_HEIGHT - 3.5).toFixed(2)} l S`
                    );
                }

                out.push(
                    pdfDrawRow(pickCells(row, band), columns, PDF_MARGIN.left,
                        y, PDF_FONT_SIZE, isFoot, lead)
                );

                y -= PDF_ROW_HEIGHT;
            });

            const page = Math.floor(from / perPage) + 1;
            const ofPages = Math.ceil(body.length / perPage) || 1;

            out.push(
                `BT /F1 6.5 Tf 0.55 0.58 0.63 rg 1 0 0 1 ${PDF_MARGIN.left} ` +
                `${PDF_MARGIN.bottom - 12} Tm (` +
                pdfEscape(
                    `Columns ${bandIndex + 1} of ${bands.length}` +
                    `  \u00b7  Rows page ${page} of ${ofPages}`
                ) +
                ") Tj ET 0 0 0 rg"
            );

            pages.push(out.join("\n"));
        }
    });

    return assemblePdf(pages);
}



async function assemblePdf(pages) {

    const encoder = new TextEncoder();

    /* Each part is a string or a Uint8Array; both end up as bytes. */
    const parts = [];
    const offsets = [];

    let at = 0;

    const put = value => {

        const bytes = typeof value === "string"
            ? encoder.encode(value)
            : value;

        parts.push(bytes);
        at += bytes.length;
    };

    const startObject = () => {
        offsets.push(at);
    };

    put("%PDF-1.4\n");

    const pageIds = pages.map((content, index) => 4 + index * 2);

    startObject();
    put("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

    startObject();
    put(
        "2 0 obj\n<< /Type /Pages /Count " + pages.length +
        " /Kids [" + pageIds.map(id => `${id} 0 R`).join(" ") + "] >>\nendobj\n"
    );

    startObject();
    put(
        "3 0 obj\n<< /Font << /F1 << /Type /Font /Subtype /Type1 " +
        "/BaseFont /Helvetica /Encoding /WinAnsiEncoding >> " +
        "/F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold " +
        "/Encoding /WinAnsiEncoding >> >> >>\nendobj\n"
    );

    for (let index = 0; index < pages.length; index += 1) {

        const id = pageIds[index];

        startObject();
        put(
            `${id} 0 obj\n<< /Type /Page /Parent 2 0 R ` +
            `/MediaBox [0 0 ${PDF_PAGE.width} ${PDF_PAGE.height}] ` +
            `/Resources 3 0 R /Contents ${id + 1} 0 R >>\nendobj\n`
        );

        const raw = encoder.encode(pages[index]);
        const packed = await deflateZlib(raw);

        const deflated = packed !== null && packed.length < raw.length;
        const data = deflated ? packed : raw;

        startObject();
        put(
            `${id + 1} 0 obj\n<< /Length ${data.length}` +
            (deflated ? " /Filter /FlateDecode" : "") +
            " >>\nstream\n"
        );
        put(data);
        put("\nendstream\nendobj\n");
    }

    const xrefAt = at;

    let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;

    offsets.forEach(offset => {
        xref += String(offset).padStart(10, "0") + " 00000 n \n";
    });

    xref +=
        `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\n` +
        `startxref\n${xrefAt}\n%%EOF\n`;

    put(xref);

    const out = new Uint8Array(at);

    let cursor = 0;

    parts.forEach(bytes => {
        out.set(bytes, cursor);
        cursor += bytes.length;
    });

    return out;
}


async function downloadPdf(fileName, title, subtitle, rows, widths, options) {

    saveBlob(
        new Blob([await buildPdf(title, subtitle, rows, widths, options)],
            { type: "application/pdf" }),
        fileName
    );
}


function exportFileName(prefix, extension) {

    const stamp = new Date().toISOString().slice(0, 10);

    return `${prefix}-${currentView().id}-${stamp}.${extension}`;
}


/*
 * The Details table, every filtered row rather than the page on
 * screen. Columns, order and totals are the rendered ones.
 */
async function exportDetailsTable() {

    const rows = state.filteredRows;

    if (!rows || rows.length === 0) {
        return;
    }

    const columns = state.columns;

    const sheet = [
        [{ value: `${currentView().title}`, style: 1 }],
        [activeFilterSummary()],
        [`${rows.length} rows · exported from all pages, not just the one shown`],
        [],
        columns.map(column => ({ value: column.label, style: 1 }))
    ];

    rows.forEach((row, index) => {

        sheet.push(columns.map(column => {

            if (column.type === "index") {
                return row.srNo === null || row.srNo === undefined
                    ? index + 1
                    : toNumber(row.srNo);
            }

            if (column.type === "entity") {
                return row.entity;
            }

            const value = column.type === "total"
                ? row.total
                : row.values[column.key];

            /* Blank stays blank; only a real figure becomes a number. */
            return value === null || value === undefined || value === ""
                ? null
                : toNumber(value);
        }));
    });

    const totals = calculateColumnTotals(rows, columns);

    sheet.push(columns.map((column, index) => {

        if (index === 0) {
            return { value: "Total", style: 2 };
        }

        if (column.type === "entity") {
            return { value: `${rows.length} ${currentView().entityPlural}`, style: 2 };
        }

        return { value: totals[column.key], style: 2 };
    }));

    const widths = columns.map((column, index) =>
        index === 0 ? 8 : index === 1 ? 42 : Math.max(12, column.label.length + 2)
    );

    await downloadWorkbook(
        exportFileName("details", "xlsx"),
        `${currentView().scopeLabel} ${state.year}`.slice(0, 31),
        sheet,
        { widths }
    );
}


/*
 * The Details table as a PDF. Same rows the spreadsheet gets, laid
 * out across column bands so nothing has to shrink to fit.
 */
async function exportDetailsPdf() {

    const rows = state.filteredRows;

    if (!rows || rows.length === 0) {
        return;
    }

    const columns = state.columns;

    const sheet = [columns.map(column => column.label)];

    rows.forEach((row, index) => {

        sheet.push(columns.map(column => {

            if (column.type === "index") {
                return formatIndianNumber(
                    row.srNo === null || row.srNo === undefined
                        ? index + 1
                        : toNumber(row.srNo)
                );
            }

            if (column.type === "entity") {
                return row.entity;
            }

            const value = column.type === "total"
                ? row.total
                : row.values[column.key];

            return value === null || value === undefined || value === ""
                ? ""
                : formatIndianNumber(toNumber(value));
        }));
    });

    const totals = calculateColumnTotals(rows, columns);

    sheet.push(columns.map((column, index) => {

        if (index === 0) {
            return "Total";
        }

        if (column.type === "entity") {
            return `${rows.length} ${currentView().entityPlural}`;
        }

        return formatIndianNumber(totals[column.key]);
    }));

    /*
     * The entity column is given room for a real maker name; the
     * rest are sized to their heading, which is what decides how
     * many fit in a band.
     */
    const widths = columns.map((column, index) => {

        if (index === 0) {
            return 34;
        }

        if (column.type === "entity") {
            return 168;
        }

        return Math.min(
            120,
            Math.max(44, pdfTextWidth(column.label, PDF_HEAD_SIZE) + 10)
        );
    });

    await downloadPdf(
        exportFileName("details", "pdf"),
        currentView().title,
        activeFilterSummary() + `  ·  ${rows.length} rows`,
        sheet,
        widths,
        { lead: 2, footRows: [sheet.length - 1] }
    );
}


/*
 * The trend grid as a PDF. Each month is one column reading
 * "IND / VOL / MS" rather than three, because twelve months at
 * three columns each will not fit any page at a readable size.
 */
async function exportTrendPdf() {

    const pivot = state.monthly.pivot;

    if (!pivot || pivot.rows.length === 0) {
        return;
    }

    const months = FISCAL_MONTH_ORDER.map(
        number => MONTH_TABLES.find(month => month.number === number)
    );

    const groups = months.map(month => month.label).concat("Total");

    const lead = pivot.multi ? 2 : 1;

    /*
     * Two header rows, as on screen and in the spreadsheet: the
     * month spanning its triplet, then IND / VOL / MS beneath.
     */
    const groupRow = pivot.multi ? ["", ""] : [""];
    const subRow = pivot.multi
        ? ["Fiscal Year", "Maker"]
        : ["Fiscal Year"];

    groups.forEach(label => {
        groupRow.push({ text: label, span: 3 });
        subRow.push("IND", "VOL", "MS");
    });

    const sheet = [groupRow, subRow];

    const triplet = cell => {

        if (!cell) {
            return ["", "", ""];
        }

        const share = cell.industry > 0
            ? (cell.selected / cell.industry) * 100
            : 0;

        return [
            formatIndianNumber(cell.industry),
            formatIndianNumber(cell.selected),
            share.toFixed(1) + "%"
        ];
    };

    pivot.rows.forEach(row => {

        /*
         * The screen prints the year once per block of makers; on
         * paper a page break could separate them, so every row
         * carries its own.
         */
        const line = pivot.multi
            ? [fiscalYearLabel(row.start), row.maker]
            : [row.label];

        row.months.forEach(cell => line.push(...triplet(cell)));
        line.push(...triplet(row.total));

        sheet.push(line);
    });

    const footer = pivot.multi
        ? ["Total", `All ${pivot.makers.length} selected`]
        : ["Total"];

    pivot.totals.forEach(cell => footer.push(...triplet(cell)));
    footer.push(...triplet(pivot.grandTotal));

    sheet.push(footer);

    const widths = (pivot.multi ? [58, 172] : [66])
        .concat(groups.flatMap(() => [46, 46, 34]));

    await downloadPdf(
        exportFileName("trend", "pdf"),
        `Monthly Trend \u2014 ${currentView().scopeLabel}`,
        activeFilterSummary({ trend: true }),
        sheet,
        widths,
        {
            lead,
            groupSize: 3,
            headerCount: 2,
            footRows: [sheet.length - 1]
        }
    );
}


/*
 * The trend grid as it reads on screen: a fiscal year per row,
 * IND / VOL / MS under each month, and the Total group last.
 */
async function exportTrendTable() {

    const pivot = state.monthly.pivot;

    if (!pivot || pivot.rows.length === 0) {
        return;
    }

    const months = FISCAL_MONTH_ORDER.map(
        number => MONTH_TABLES.find(month => month.number === number)
    );

    const groups = [...months.map(month => month.label), "Total"];

    /* Row 5 spans each group across its three columns; row 6 names them. */
    const lead = pivot.multi ? 2 : 1;

    const groupRow = pivot.multi ? ["", ""] : [""];

    const subRow = pivot.multi
        ? [{ value: "Fiscal Year", style: 1 }, { value: "Maker", style: 1 }]
        : [{ value: "Fiscal Year", style: 1 }];

    groups.forEach(label => {
        groupRow.push({ value: label, style: 1 }, "", "");
        subRow.push(
            { value: "IND", style: 1 },
            { value: "VOL", style: 1 },
            { value: "MS %", style: 1 }
        );
    });

    const sheet = [
        [{ value: "Monthly Trend", style: 1 }],
        [activeFilterSummary({ trend: true })],
        ["IND is the whole industry, VOL the selection, MS the share of IND"],
        [],
        groupRow,
        subRow
    ];

    const cellsFor = cell => {

        if (!cell) {
            return [null, null, null];
        }

        const share = cell.industry > 0
            ? (cell.selected / cell.industry) * 100
            : 0;

        return [
            cell.industry,
            cell.selected,
            { value: Number(share.toFixed(1)), style: 3 }
        ];
    };

    pivot.rows.forEach(row => {

        /*
         * The screen prints the year once per block of makers; a
         * spreadsheet gets sorted and filtered, so every row carries
         * its own year.
         */
        const line = pivot.multi
            ? [fiscalYearLabel(row.start), row.maker]
            : [row.label];

        row.months.forEach(cell => line.push(...cellsFor(cell)));
        line.push(...cellsFor(row.total));

        sheet.push(line);
    });

    const footer = pivot.multi
        ? [
            { value: "Total", style: 2 },
            { value: `All ${pivot.makers.length} selected`, style: 2 }
        ]
        : [{ value: "Total", style: 2 }];

    pivot.totals.forEach(cell =>
        cellsFor(cell).forEach(value =>
            footer.push(
                value !== null && typeof value === "object"
                    ? { ...value, style: 2 }
                    : { value, style: 2 }
            )
        )
    );

    cellsFor(pivot.grandTotal).forEach(value =>
        footer.push(
            value !== null && typeof value === "object"
                ? { ...value, style: 2 }
                : { value, style: 2 }
        )
    );

    sheet.push(footer);

    /* Merge each group label across its three columns, on row 5. */
    const merges = groups.map((label, index) => {

        const first = lead + index * 3;

        return `${columnLetter(first)}5:${columnLetter(first + 2)}5`;
    });

    const widths = pivot.multi
        ? [14, 40, ...groups.flatMap(() => [12, 12, 8])]
        : [14, ...groups.flatMap(() => [12, 12, 8])];

    await downloadWorkbook(
        exportFileName("trend", "xlsx"),
        `Trend ${currentView().scopeLabel}`.slice(0, 31),
        sheet,
        { merges, widths }
    );
}


/* ============================================================
   24. LOADING / ERROR
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

    state.trendMakers = [];

    const trendCombo = combos.get(dom.trendMakerFilter);

    if (trendCombo) {
        trendCombo.values = [];
    }

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


function setupDownloadListeners() {

    /*
     * Building the archive is async - deflate is a stream - so the
     * button is held disabled for the duration. A second click
     * mid-write would otherwise start a competing export.
     */
    const wire = (button, run, label) => {

        if (!button) {
            return;
        }

        button.addEventListener("click", async () => {

            button.disabled = true;

            try {
                await run();
            } catch (error) {
                console.error(`${label} export failed:`, error);
            } finally {
                button.disabled = false;
            }
        });
    };

    wire(dom.detailsDownloadButton, exportDetailsTable, "Details xlsx");
    wire(dom.detailsPdfButton, exportDetailsPdf, "Details pdf");
    wire(dom.trendDownloadButton, exportTrendTable, "Trend xlsx");
    wire(dom.trendPdfButton, exportTrendPdf, "Trend pdf");
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

                state.trendMakers = comboValues(dom.trendMakerFilter);

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
            setupDownloadListeners();
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
