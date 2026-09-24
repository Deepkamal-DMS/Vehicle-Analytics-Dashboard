/* ============================================================
   VEHICLE REGISTRATION ANALYTICS DASHBOARD
   File: /script.js

   Vanilla JavaScript + Supabase PostgREST (no Supabase client)

   ------------------------------------------------------------
   SCHEMA (Supabase project ytgoonducepylslknkag)

   YEAR GRAIN - all WIDE, Maker x Vehicle Class, year a column:

       MAKER_WISE                 3,994 rows   74 classes
       Gujarat_Class_Wise           862 rows   61 classes
       Ahmedabad_Class_Wise         414 rows   49 classes  (view)
       Maker_Class_Wise_GJ01        278 rows   43 classes
       Maker_Class_Wise_GJ13        229 rows   32 classes
       Maker_Class_Wise_GJ27        275 rows   38 classes
       Maker_Class_Wise_GJ38        292 rows   31 classes

   Each holds 2025 and 2026. Ahmedabad is GJ01 + GJ27 + GJ38
   summed PER MAKER.

   MONTH GRAIN - one view over 36 month tables:

       trend_by_maker   54,019 rows
       scope | year | month (1-12) | Maker | <75 classes> | Total

   Its six scopes are all_india, gujarat, ahmedabad, gj01, gj27
   and gj38. EVERY read must filter on scope, or six scopes sum
   together. It carries 2024 as well as 2025 and 2026.

   ------------------------------------------------------------
   WHAT THE DATA CAN AND CANNOT DO

   maker x class          yes, per scope, per year
   maker x class x month  yes, per scope - except GJ13, which has
                          no month tables at all
   maker x rto            only GJ01, GJ13, GJ27, GJ38 exist. There
                          is no table for the other 48 Gujarat
                          RTOs, and none for RTOs outside Gujarat
   state x class          NO TABLE EXISTS
   years before 2025      NO TABLE EXISTS at year grain; the month
                          view reaches back to 2024 and no further

   ------------------------------------------------------------
   GRAIN SWITCH

   One rule decides which of the two sources every card reads:

       Month filter on "all"  ->  year grain (the scope tables)
       Month filter narrowed  ->  month grain (trend_by_maker)

   The two disagree on 2026 by about 5 lakh units at All India -
   the scope tables are a mid-August snapshot, the month tables
   close on 31 August - so the switch is stated on screen rather
   than left to be discovered. 2025 reconciles to single digits.

   Reads page with .range() in 1,000-row chunks.
   ============================================================ */


/* ============================================================
   1. API CONFIGURATION
   ============================================================ */

/*
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

/*
 * The Import card's one door to the database. Nothing about this
 * URL grants write access on its own - see supabase/functions/
 * import-workbook/index.ts's header comment for why calling it is
 * safe even before the dashboard has a login.
 */
const IMPORT_FUNCTION_URL =
    "https://ytgoonducepylslknkag.supabase.co/functions/v1/import-workbook";


/* ============================================================
   2. TABLE CONFIGURATION
   ============================================================ */

const SCOPE_TABLES = {
    all_india: "MAKER_WISE",
    gujarat:   "Gujarat_Class_Wise",
    ahmedabad: "Ahmedabad_Class_Wise",
    gj01:      "Maker_Class_Wise_GJ01",
    gj13:      "Maker_Class_Wise_GJ13",
    gj27:      "Maker_Class_Wise_GJ27",
    gj38:      "Maker_Class_Wise_GJ38"
};


/*
 * The scopes the sidebar offers as a universe. The four RTOs are
 * not here - they are the RTO filter's job, and selecting one
 * there overrides whichever of these is set.
 */
const SCOPES = [
    { id: "all_india", label: "All India" },
    { id: "gujarat",   label: "Gujarat" },
    { id: "ahmedabad", label: "Ahmedabad" }
];


/*
 * Every RTO the database holds. Four, not the fifty-two a full
 * Gujarat listing would have: Vahan was pulled for these codes
 * only. Names follow the published Gujarat RTO register; the
 * workbooks carry the code alone, so they are set here and are
 * the one thing on this screen not read from the data.
 *
 * GJ13 has a year-grain table but no month tables, so it drops
 * out whenever the Month filter is narrowed. Known and accepted.
 */
const RTOS = [
    { code: "GJ01", name: "AHMEDABAD", scope: "gj01", months: true },
    { code: "GJ13", name: "SURENDRANAGAR", scope: "gj13", months: false },
    { code: "GJ27", name: "AHMEDABAD (EAST)", scope: "gj27", months: true },
    { code: "GJ38", name: "AHMEDABAD (RURAL) BAVLA", scope: "gj38", months: true }
];


function rtoByCode(code) {

    return RTOS.find(rto => rto.code === code) || null;
}


/*
 * The month-grain view and the column that must narrow every
 * read of it. Without the scope filter a single request sums six
 * scopes together and inflates every figure by about a tenth.
 */
const MONTH_VIEW = "trend_by_maker";

const SCOPE_COLUMN = "scope";
const MONTH_COLUMN = "month";


/* Only three of the six month scopes are an RTO. */
const MONTH_SCOPES = new Set([
    "all_india", "gujarat", "ahmedabad", "gj01", "gj27", "gj38"
]);


const MONTHS = [
    { number: 1,  key: "Jan", label: "January" },
    { number: 2,  key: "Feb", label: "February" },
    { number: 3,  key: "Mar", label: "March" },
    { number: 4,  key: "Apr", label: "April" },
    { number: 5,  key: "May", label: "May" },
    { number: 6,  key: "Jun", label: "June" },
    { number: 7,  key: "Jul", label: "July" },
    { number: 8,  key: "Aug", label: "August" },
    { number: 9,  key: "Sep", label: "September" },
    { number: 10, key: "Oct", label: "October" },
    { number: 11, key: "Nov", label: "November" },
    { number: 12, key: "Dec", label: "December" }
];


/*
 * Year grain holds two; the month view reaches back one further.
 * Which of these the Year filter offers depends on the grain, so
 * both lists are kept rather than one merged one.
 */
const YEARS_YEAR_GRAIN = ["2025", "2026"];

const YEARS_MONTH_GRAIN = ["2024", "2025", "2026"];


/*
 * When the six scope tables were last pulled from Vahan. Only the
 * part-year matters: 2025 and earlier are closed, but 2026 is a
 * snapshot taken part-way through August.
 */
const DATA_AS_OF = { year: "2026", label: "20-Aug-2026" };


function tableFor(scope) {

    return SCOPE_TABLES[scope] || SCOPE_TABLES[DEFAULT_SCOPE];
}


const DEFAULT_SCOPE = "all_india";


/* ============================================================
   3. APPLICATION CONFIGURATION
   ============================================================ */

const CONFIG = {

    ALL: "all",

    PAGE_SIZE: 25,

    SEARCH_DELAY: 180,

    /*
     * Reads page in these chunks. Supabase caps a response at
     * 1,000 rows on this project, so asking for more gains
     * nothing.
     */
    FETCH_PAGE_SIZE: 1000,

    MAX_FETCH_PAGES: 200,

    /*
     * Pages after the first are fetched this many at a time. The
     * month view narrowed to one month is three or four pages;
     * narrowed to six months it is closer to twenty, and fetching
     * those one after another is the difference between one
     * second and five.
     */
    FETCH_CONCURRENCY: 6,

    /* A 2,000-entry check list is built lazily past this point. */
    CHECKLIST_RENDER_LIMIT: 300,

    /* Columns in the RTO comparison before the Others rollup. */
    RTO_MAKER_COLUMNS: 5,

    /* Rows in each Quick Summary panel. */
    SUMMARY_ROWS: 5,

    /*
     * A maker needs at least this many registrations in the base
     * year before its growth is worth ranking - without it the
     * Highest Growth panel fills with makers that went from two
     * units to nine.
     */
    GROWTH_MIN_BASE: 100,

    /*
     * The detailed table unpivots maker x class, so a wide
     * selection can reach six figures of rows. Rendering is
     * paged, but the array itself is capped so the browser is
     * never asked to hold an unbounded one.
     */
    MAX_DETAIL_ROWS: 50000
};


const METADATA_COLUMNS = [
    "id", "sr no", "sr_no", "srno",
    "maker", "maker name", "maker_name",
    "state", "state name", "state_name",
    "rto", "scope", "month",
    "total", "grand total", "year"
];


/*
 * Group choices are prefixed so one flat list can offer both a
 * group and a class without either being mistaken for the other.
 */
const GROUP_PREFIX = "group:";


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


function classGroupIdFor(column) {

    const group = CLASS_GROUPS.find(candidate => candidate.test(column));

    return group ? group.id : "OTHER";
}


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

   Two copies of the filters. `pending` is what the sidebar
   shows; `filters` is what the figures on screen answer to.
   Apply copies one into the other. Nothing reads `pending`
   except the sidebar, so a half-made selection can never be
   mistaken for the selection a number was computed from.
   ============================================================ */

function emptyFilters() {

    return {
        scope: DEFAULT_SCOPE,

        /* Empty means every one of them, for all five. */
        years: [],
        months: [],
        rtos: [],
        makers: [],
        classes: []
    };
}


function emptyKpis() {

    return {
        registrations: null,
        makers: null,
        rtos: null,
        classes: null,
        share: null,
        yearsLabel: "—",
        yearsMeta: "",
        deltas: {}
    };
}


const state = {

    initialized: false,
    wired: false,
    retryWired: false,

    requestId: 0,
    activeController: null,

    filters: emptyFilters(),
    pending: emptyFilters(),

    /* "year" or "month". See the GRAIN SWITCH note at the top. */
    grain: "year",

    /* Which options each check list offers, rebuilt as scope moves. */
    options: {
        years: [],
        months: MONTHS.map(month => ({
            value: String(month.number),
            label: month.label
        })),
        rtos: RTOS.map(rto => ({
            value: rto.code,
            label: `${rto.code} — ${rto.name}`
        })),
        makers: [],
        classes: []
    },

    /*
     * The class columns the active source actually carries. Vahan
     * drops classes with no entries, so this differs by scope and
     * is re-read rather than assumed.
     */
    classColumns: [],

    /*
     * Loaded records. `main` answers the Scope / RTO selection and
     * feeds cards 1 and 3; `rto` is always the four RTO sources and
     * feeds card 2, whatever Scope says.
     *
     * A record is { rto, year, month, maker, raw } where raw is the
     * API row - the class figures are read out of it on demand
     * rather than copied into a second object per row.
     */
    main: { records: [], classColumns: [] },
    rto: { records: [], classColumns: [] },

    /* Whole tables, keyed by name. */
    tableCache: new Map(),

    /* Built from the records above on every render. */
    makerTable: { rows: [], years: [], totals: null },
    rtoTable: { rows: [], makerColumns: [], totals: null },
    detailTable: { rows: [], truncated: false, totals: null },

    kpis: emptyKpis(),
    summary: { makers: [], rtos: [], growth: [], facts: [] },

    /* Per-card view state. */
    view: {
        maker: { page: 1, pageSize: 25, sortKey: "__total", sortDir: "desc" },
        detail: {
            page: 1,
            pageSize: 25,
            sortKey: "registration",
            sortDir: "desc",
            search: ""
        }
    },

    searchTimer: null,

    /* Notes the loader raises for the cards to print. */
    notices: { rto: "", detail: "" },

    /*
     * The Import card. `report` is the last preview this file was
     * checked against - commit re-sends the same File object rather
     * than trusting a copy of this, but the confirm button stays
     * disabled unless a report with no blocking problems is here.
     */
    import: {
        file: null,
        report: null,
        busy: false
    },

    /*
     * The credentials the login form last collected, sent as Basic
     * auth on every import-workbook call. Held in sessionStorage,
     * not localStorage - a closed tab should not leave them sitting
     * around - and never in state.import above, which is cleared on
     * every successful commit while a login should not be.
     */
    auth: {
        user: null,
        pass: null
    }
};


/* ============================================================
   6. DOM CACHE
   ============================================================ */

const dom = {};


function cacheDOM() {

    const ids = [

        /* Shell */
        "appShell",
        "filterSidebar",
        "collapseFiltersButton",
        "dashboardFilters",
        "scopeFilter",
        "filterNotice",
        "applyFiltersButton",
        "resetFiltersButton",

        /* Header */
        "dashboardTitle",
        "dataRefreshedOn",
        "exportMenuButton",
        "exportMenuList",

        /* KPIs */
        "kpiRegistrations", "kpiRegistrationsDelta",
        "kpiMakers", "kpiMakersDelta",
        "kpiRtos", "kpiRtosDelta",
        "kpiClasses", "kpiClassesDelta",
        "kpiShare", "kpiShareDelta",
        "kpiYears", "kpiYearsDelta",

        /* Card 1 */
        "makerTable", "makerTableHead", "makerTableBody", "makerTableFoot",
        "makerCardMeta", "makerCardState",
        "makerPageSize", "makerPageIndicator",

        /* Card 2 */
        "rtoTable", "rtoTableHead", "rtoTableBody", "rtoTableFoot",
        "rtoCardMeta", "rtoCardState", "rtoCardNote",

        /* Card 3 */
        "detailTable", "detailTableHead", "detailTableBody", "detailTableFoot",
        "detailCardMeta", "detailCardState", "detailCardNote",
        "detailSearch", "detailPageSize", "detailPageIndicator",

        /* Import dialog */
        "importOpenButton", "importOverlay", "importClose",
        "importChecksToggle", "importChecksPanel",
        "importForm", "importFileInput", "importFileLabel",
        "importValidateButton", "importCommitButton",
        "importState", "importReport", "importResult",

        /* Login dialog - gates the whole dashboard, see bootstrapApp() */
        "loginOverlay", "loginForm",
        "loginUser", "loginPass", "loginError", "loginSubmit",

        /* Sits in the header, outside every card - shown once logged in */
        "logoutButton",

        /* Quick summary */
        "topMakersList",
        "topRtosList",
        "topGrowthList",
        "growthPanelTitle",
        "dataSummaryList",

        /* Dialog */
        "viewAllOverlay", "viewAllTitle", "viewAllList", "viewAllClose",

        /* States */
        "globalLoading",
        "errorMessage",
        "errorMessageText",
        "retryButton"
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


async function fetchRowCount(table, options = {}) {

    const { filters = [], signal = null } = options;

    let query = restClient
        .from(table)
        .select("*", { count: "exact", head: true });

    filters.forEach(filter => {
        query = query.in(filter.column, filter.values);
    });

    if (signal) {
        query = query.abortSignal(signal);
    }

    const { count, error } = await query;

    if (error) {
        throw apiError(table, error);
    }

    return count || 0;
}


/*
 * Whole small/medium tables are cached - the dashboard reads
 * the same ones repeatedly as filters change.
 */
function getCachedTable(table, columns, signal) {

    if (state.tableCache.has(table)) {
        return state.tableCache.get(table);
    }

    const pending = fetchAllRows(table, columns, { signal });

    state.tableCache.set(table, pending);
    pending.catch(() => state.tableCache.delete(table));

    return pending;
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


/* ============================================================
   12. SOURCE RESOLUTION

   Two questions decide every read: which grain, and which
   scopes. Everything downstream asks these rather than looking
   at the filters itself.
   ============================================================ */

/*
 * Month grain only once the Month filter actually narrows. All
 * twelve ticked is the same selection as none, and reading a
 * whole year out of the month view would be twelve times the
 * work for a figure the scope table already holds.
 */
function grainFor(filters) {

    const months = filters.months;

    return months.length > 0 && months.length < MONTHS.length
        ? "month"
        : "year";
}


function availableYears(grain) {

    return grain === "month" ? YEARS_MONTH_GRAIN : YEARS_YEAR_GRAIN;
}


/*
 * The RTO filter overrides Scope when anything is ticked: an RTO
 * is a narrower universe than any scope on the list, so applying
 * both would either contradict or double-count.
 */
function rtoOverrideActive(filters) {

    return filters.rtos.length > 0;
}


/*
 * What the main cards read, as a list of sources. One entry per
 * table at year grain, one per scope at month grain; `rto` is the
 * code a row belongs to, or null when the source is not an RTO.
 */
function mainSources(filters, grain) {

    if (rtoOverrideActive(filters)) {
        return rtoSources(filters.rtos, grain);
    }

    return [{ scope: filters.scope, rto: null }];
}


function rtoSources(codes, grain) {

    const wanted = codes.length > 0
        ? codes
        : RTOS.map(rto => rto.code);

    return wanted
        .map(rtoByCode)
        .filter(Boolean)
        .filter(rto => grain !== "month" || rto.months)
        .map(rto => ({ scope: rto.scope, rto: rto.code }));
}


/*
 * Codes asked for that the chosen grain cannot serve. Only GJ13
 * is ever in here, and only at month grain.
 */
function rtosWithoutGrain(codes, grain) {

    if (grain !== "month") {
        return [];
    }

    const wanted = codes.length > 0 ? codes : RTOS.map(rto => rto.code);

    return wanted
        .map(rtoByCode)
        .filter(rto => rto && !rto.months)
        .map(rto => rto.code);
}


function scopeLabel(filters) {

    if (rtoOverrideActive(filters)) {
        return filters.rtos.join(" + ");
    }

    const scope = SCOPES.find(entry => entry.id === filters.scope);

    return scope ? scope.label : filters.scope;
}


/* ============================================================
   13. PARALLEL PAGING

   fetchAllRows walks a table one page at a time, which is right
   for a few thousand rows. The month view narrowed to half a
   year is twenty pages, and twenty round trips in a row is a
   visible wait, so the count is asked for once and the pages
   after the first go out together.
   ============================================================ */

async function fetchAllRowsFast(table, columns, options = {}) {

    const select = buildSelect(columns);

    const first = await fetchPage(
        table,
        select,
        0,
        CONFIG.FETCH_PAGE_SIZE - 1,
        options
    );

    if (first.length < CONFIG.FETCH_PAGE_SIZE) {
        return first;
    }

    /*
     * A HEAD request with count=exact, so the remaining ranges can
     * be worked out rather than discovered one empty page at a
     * time. If it fails - an older PostgREST, a proxy that eats
     * the header - the sequential walk still finishes the job.
     */
    let total = 0;

    try {
        total = await fetchRowCount(table, options);
    } catch (error) {
        console.warn(`${table}: row count unavailable`, error.message);
    }

    if (!total) {
        return fetchAllRows(table, columns, options);
    }

    const ranges = [];

    for (
        let from = CONFIG.FETCH_PAGE_SIZE;
        from < total && ranges.length < CONFIG.MAX_FETCH_PAGES;
        from += CONFIG.FETCH_PAGE_SIZE
    ) {
        ranges.push(from);
    }

    const rows = first;

    for (let at = 0; at < ranges.length; at += CONFIG.FETCH_CONCURRENCY) {

        const batch = ranges.slice(at, at + CONFIG.FETCH_CONCURRENCY);

        const pages = await Promise.all(batch.map(from =>
            fetchPage(
                table,
                select,
                from,
                from + CONFIG.FETCH_PAGE_SIZE - 1,
                options
            )
        ));

        pages.forEach(page => rows.push(...page));
    }

    return rows;
}


/* ============================================================
   14. SCHEMA + CLASS TAXONOMY
   ============================================================ */

const schemaCache = new Map();


/*
 * One sample row per table tells us its class columns. Cached
 * for the session: a table's shape does not change between
 * filter applications.
 */
async function describeSource(table) {

    if (schemaCache.has(table)) {
        return schemaCache.get(table);
    }

    const pending = describeWideTable(table, "maker").then(schema => {

        if (!schema) {
            throw new Error(
                `${table} is unavailable, so its figures cannot be loaded.`
            );
        }

        return schema;
    });

    schemaCache.set(table, pending);
    pending.catch(() => schemaCache.delete(table));

    return pending;
}


/*
 * At year grain each source is its own table with its own column
 * set, so the class list is the union of them. At month grain
 * every scope shares the one view's columns.
 */
async function describeSources(sources, grain) {

    if (grain === "month") {

        const schema = await describeSource(MONTH_VIEW);

        return {
            classColumns: schema.classColumns.slice(),
            byScope: new Map(
                sources.map(source => [source.scope, schema])
            )
        };
    }

    const schemas = await Promise.all(
        sources.map(source => describeSource(tableFor(source.scope)))
    );

    const columns = new Set();

    schemas.forEach(schema => {
        schema.classColumns.forEach(column => columns.add(column));
    });

    return {
        classColumns: uniqueSorted([...columns]),
        byScope: new Map(
            sources.map((source, at) => [source.scope, schemas[at]])
        )
    };
}


/*
 * The class options: the groups that this column set actually
 * has members for, then every individual class.
 */
function classOptionsFor(classColumns) {

    const present = new Set(classColumns.map(classGroupIdFor));

    const groups = CLASS_GROUPS
        .filter(group => present.has(group.id))
        .map(group => ({
            value: `${GROUP_PREFIX}${group.id}`,
            label: `All ${group.label}`
        }));

    const classes = classColumns.map(column => ({
        value: column,
        label: column
    }));

    return [...groups, ...classes];
}


/*
 * Resolves the class selection against one source's columns.
 * Nothing selected means every column it has.
 */
function resolveClassColumns(selection, classColumns) {

    if (selection.length === 0) {
        return classColumns.slice();
    }

    const groups = new Set(
        selection
            .filter(value => value.startsWith(GROUP_PREFIX))
            .map(value => value.slice(GROUP_PREFIX.length))
    );

    const exact = new Set(
        selection.filter(value => !value.startsWith(GROUP_PREFIX))
    );

    return classColumns.filter(column =>
        exact.has(column) || groups.has(classGroupIdFor(column))
    );
}


/* ============================================================
   15. CHECK LISTS

   Five of the six filters take several values at once. Each is
   a header, a summary bar that collapses the list, an optional
   search box and a list of checkboxes. The selection lives in
   state.pending; the DOM is only ever a picture of it.
   ============================================================ */

const checklists = new Map();


function buildChecklists() {

    document.querySelectorAll("[data-checklist]").forEach(root => {

        const name = root.getAttribute("data-checklist");

        const checklist = {
            name,
            root,
            toggle: root.querySelector("[data-checklist-toggle]"),
            label: root.querySelector("[data-checklist-label]"),
            panel: root.querySelector("[data-checklist-panel]"),
            search: root.querySelector("[data-checklist-search]"),
            list: root.querySelector("[data-checklist-options]"),
            query: ""
        };

        checklists.set(name, checklist);

        wireChecklist(checklist);
    });
}


function wireChecklist(checklist) {

    if (checklist.toggle) {

        checklist.toggle.addEventListener("click", () => {

            const open = checklist.toggle.getAttribute("aria-expanded") === "true";

            checklist.toggle.setAttribute("aria-expanded", String(!open));
        });
    }

    if (checklist.search) {

        checklist.search.addEventListener("input", () => {
            checklist.query = checklist.search.value;
            renderChecklist(checklist.name);
        });
    }

    if (!checklist.list) {
        return;
    }

    checklist.list.addEventListener("change", event => {

        const input = event.target.closest("input[type=checkbox]");

        if (!input) {
            return;
        }

        const value = input.value;
        const selected = state.pending[checklist.name];

        if (input.checked) {

            if (!selected.includes(value)) {
                selected.push(value);
            }

        } else {

            const at = selected.indexOf(value);

            if (at !== -1) {
                selected.splice(at, 1);
            }
        }

        /*
         * The list that was clicked is deliberately not rebuilt.
         * Ticked entries sort to the top, so redrawing it here
         * would move the row out from under the pointer between
         * one tick and the next.
         */
        onPendingChanged(checklist.name, { origin: checklist.name });
    });
}


/*
 * The wording the summary bar carries. "All X" when nothing is
 * ticked, the one name when one is, a count after that.
 */
const CHECKLIST_WORDING = {
    years: { all: "All Years", one: value => value, many: "Years" },
    months: {
        all: "All Months",
        one: value => monthLabel(value),
        many: "Months"
    },
    rtos: { all: "All RTOs Selected", one: value => value, many: "RTOs" },
    makers: {
        all: "All Makers Selected",
        one: value => value,
        many: "Makers"
    },
    classes: {
        all: "All Classes Selected",
        one: value => classOptionLabel(value),
        many: "Classes"
    }
};


function monthLabel(number) {

    const month = MONTHS.find(entry => String(entry.number) === String(number));

    return month ? month.label : String(number);
}


function classOptionLabel(value) {

    if (!String(value).startsWith(GROUP_PREFIX)) {
        return value;
    }

    const id = String(value).slice(GROUP_PREFIX.length);
    const group = CLASS_GROUPS.find(entry => entry.id === id);

    return group ? `All ${group.label}` : value;
}


function checklistSummary(name) {

    const selected = state.pending[name];
    const wording = CHECKLIST_WORDING[name];
    const options = state.options[name] || [];

    if (selected.length === 0 || selected.length === options.length) {
        return options.length === 0
            ? wording.all
            : `${wording.all} (${options.length})`;
    }

    if (selected.length === 1) {
        return wording.one(selected[0]);
    }

    return `${selected.length} ${wording.many} Selected`;
}


function renderChecklist(name) {

    const checklist = checklists.get(name);

    if (!checklist || !checklist.list) {
        return;
    }

    const options = state.options[name] || [];
    const selected = new Set(state.pending[name]);
    const query = normalizeKey(checklist.query);

    const matches = query === ""
        ? options
        : options.filter(option =>
            normalizeKey(option.label).includes(query) ||
            normalizeKey(option.value).includes(query));

    checklist.list.innerHTML = "";

    if (matches.length === 0) {

        const empty = document.createElement("li");

        empty.className = "checklist__empty";
        empty.textContent = options.length === 0
            ? "Nothing to select yet."
            : "No matches";

        checklist.list.appendChild(empty);

        syncChecklistLabel(name);

        return;
    }

    /*
     * Ticked entries come first, because the list is capped: with
     * 2,000 makers a selection halfway down the alphabet would
     * otherwise be off the end of the rendered slice, and the
     * reader could neither see it nor untick it.
     */
    const ordered = [
        ...matches.filter(option => selected.has(option.value)),
        ...matches.filter(option => !selected.has(option.value))
    ];

    const visible = ordered.slice(0, CONFIG.CHECKLIST_RENDER_LIMIT);

    const fragment = document.createDocumentFragment();

    visible.forEach((option, index) => {

        const item = document.createElement("li");
        item.className = "checklist__item";

        const label = document.createElement("label");

        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = option.value;
        input.checked = selected.has(option.value);
        input.id = `${name}Option${index}`;

        const text = document.createElement("span");
        text.textContent = option.label;
        text.title = option.label;

        label.appendChild(input);
        label.appendChild(text);
        item.appendChild(label);

        fragment.appendChild(item);
    });

    checklist.list.appendChild(fragment);

    if (ordered.length > visible.length) {

        const more = document.createElement("li");

        more.className = "checklist__more";

        more.textContent =
            `Showing ${formatIndianNumber(visible.length)} of ` +
            `${formatIndianNumber(ordered.length)} — keep typing`;

        checklist.list.appendChild(more);
    }

    syncChecklistLabel(name);
}


function syncChecklistLabel(name) {

    const checklist = checklists.get(name);

    if (checklist && checklist.label) {
        checklist.label.textContent = checklistSummary(name);
    }
}


function renderAllChecklists({ origin = null } = {}) {

    checklists.forEach(checklist => {

        if (checklist.name === origin) {
            syncChecklistLabel(checklist.name);
            return;
        }

        renderChecklist(checklist.name);
    });
}


/* ============================================================
   16. PENDING FILTERS

   Everything the sidebar changes lands here. Nothing is fetched
   until Apply, except the option lists themselves - changing
   Scope has to re-read which makers and classes exist before
   the reader can pick one.
   ============================================================ */

function filtersEqual(a, b) {

    const same = (x, y) =>
        x.length === y.length && x.every((value, at) => value === y[at]);

    return (
        a.scope === b.scope &&
        same(a.years, b.years) &&
        same(a.months, b.months) &&
        same(a.rtos, b.rtos) &&
        same(a.makers, b.makers) &&
        same(a.classes, b.classes)
    );
}


function markDirty() {

    if (!dom.applyFiltersButton) {
        return;
    }

    dom.applyFiltersButton.classList.toggle(
        "is-dirty",
        !filtersEqual(state.pending, state.filters)
    );
}


/*
 * Called after any sidebar change. Month and RTO and Scope all
 * move which options the other lists can offer, so those are
 * rebuilt before the labels are redrawn.
 */
async function onPendingChanged(name, { origin = null } = {}) {

    /*
     * Scope, RTO and Month all move which makers, classes and
     * years exist, so those lists are rebuilt before anything is
     * redrawn. Maker and Class narrow nothing but themselves.
     */
    let rebuilt = false;

    if (name === "months" || name === "rtos" || name === "scope") {

        try {
            await loadFilterOptions();
            rebuilt = true;
        } catch (error) {
            console.warn("Filter options unavailable:", error.message);
        }
    }

    renderAllChecklists({ origin: rebuilt ? null : origin });
    updateFilterNotice();
    markDirty();
}


/*
 * Drops selections the new source cannot offer - a maker that
 * only trades in Gujarat, a class the RTO table has no column
 * for - so an invisible filter can never narrow the figures.
 */
function pruneSelection(name) {

    const allowed = new Set(
        (state.options[name] || []).map(option => option.value)
    );

    state.pending[name] = state.pending[name].filter(
        value => allowed.has(value)
    );
}


async function loadFilterOptions(signal) {

    const pending = state.pending;
    const grain = grainFor(pending);

    state.options.years = availableYears(grain).map(year => ({
        value: year,
        label: year
    }));

    pruneSelection("years");

    const sources = mainSources(pending, grain);

    if (sources.length === 0) {
        state.options.makers = [];
        state.options.classes = [];
        return;
    }

    const schema = await describeSources(sources, grain);

    state.classColumns = schema.classColumns;
    state.options.classes = classOptionsFor(schema.classColumns);

    pruneSelection("classes");

    state.options.makers = (await loadMakerOptions(sources, grain, signal))
        .map(maker => ({ value: maker, label: maker }));

    pruneSelection("makers");
}


/*
 * The maker list is read from whichever source is on screen. At
 * year grain that is the scope table itself, already cached; at
 * month grain it is the dedicated distinct-maker view, which is
 * a few hundred rows against the month view's tens of thousands.
 */
const makerListCache = new Map();


async function loadMakerOptions(sources, grain, signal) {

    const key = grain + " " + sources.map(source => source.scope).join(",");

    if (makerListCache.has(key)) {
        return makerListCache.get(key);
    }

    const pending = (async () => {

        if (grain === "month") {

            const rows = await fetchAllRows(
                "trend_makers",
                ["Maker"],
                {
                    signal,
                    filters: [{
                        column: SCOPE_COLUMN,
                        values: sources.map(source => source.scope)
                    }]
                }
            );

            return uniqueSorted(rows.map(row => row.Maker));
        }

        const lists = await Promise.all(sources.map(async source => {

            const table = tableFor(source.scope);
            const schema = await describeSource(table);

            const rows = await getCachedTable(
                table,
                sourceColumns(schema),
                signal
            );

            return rows.map(row => row[schema.entityColumn]);
        }));

        return uniqueSorted(lists.flat());
    })();

    makerListCache.set(key, pending);
    pending.catch(() => makerListCache.delete(key));

    return pending;
}


/*
 * Everything a year-grain read needs: the maker, the year, the
 * total and every class column. One select covers both the
 * option list and the figures, so the table is cached once.
 */
function sourceColumns(schema) {

    const columns = [schema.entityColumn, schema.totalColumn];

    if (schema.yearColumn) {
        columns.unshift(schema.yearColumn);
    }

    return columns.concat(schema.classColumns);
}


/* ============================================================
   17. FILTER NOTICE

   Says the two things a reader cannot see for themselves: which
   grain the figures came from, and which selections the data
   could not honour.
   ============================================================ */

function updateFilterNotice() {

    if (!dom.filterNotice) {
        return;
    }

    const pending = state.pending;
    const grain = grainFor(pending);
    const messages = [];

    if (rtoOverrideActive(pending)) {
        messages.push(
            "RTO is selected, so Scope is ignored: the figures cover " +
            `${pending.rtos.join(", ")} only.`
        );
    }

    const missing = rtosWithoutGrain(pending.rtos, grain);

    if (missing.length > 0) {
        messages.push(
            `${missing.join(", ")} has no month tables, so it drops out ` +
            "while a month is selected."
        );
    }

    if (grain === "month") {
        messages.push(
            "Month grain: figures come from the monthly tables, which " +
            "run to 2024 and close on 31 August 2026."
        );
    } else {
        messages.push(
            `Year grain: 2026 is as of ${DATA_AS_OF.label}. Selecting a ` +
            "month switches to the monthly tables, whose 2026 totals are " +
            "slightly higher."
        );
    }

    dom.filterNotice.hidden = messages.length === 0;
    dom.filterNotice.textContent = messages.join(" ");
}


/* ============================================================
   18. LOADING RECORDS

   A record is one row of one source, kept as it arrived:

       { rto, scope, year, month, maker, raw }

   The class figures stay inside `raw` and are summed on demand.
   Copying 75 columns into a second object per row would triple
   the memory for no gain - every consumer wants a different
   subset of them.
   ============================================================ */

/*
 * Loads one year further back than asked for, so the detailed
 * table can show a year-on-year change on its first render
 * rather than after a second request.
 */
function yearsToLoad(selected, grain) {

    const available = availableYears(grain);

    const wanted = selected.length > 0 ? selected : available;

    const withPrior = new Set(wanted);

    wanted.forEach(year => {
        withPrior.add(String(Number(year) - 1));
    });

    return available.filter(year => withPrior.has(year));
}


async function loadRecords(sources, grain, years, months, signal) {

    if (sources.length === 0) {
        return { records: [], classColumns: [] };
    }

    const schema = await describeSources(sources, grain);

    const records = grain === "month"
        ? await loadMonthRecords(sources, years, months, signal)
        : await loadYearRecords(sources, signal);

    return { records, classColumns: schema.classColumns };
}


async function loadYearRecords(sources, signal) {

    const perSource = await Promise.all(sources.map(async source => {

        const table = tableFor(source.scope);
        const schema = await describeSource(table);

        const rows = await getCachedTable(
            table,
            sourceColumns(schema),
            signal
        );

        return rows.map(row => ({
            rto: source.rto,
            scope: source.scope,
            year: normalizeString(row[schema.yearColumn]),
            month: null,
            maker: normalizeString(row[schema.entityColumn]),
            raw: row
        }));
    }));

    return perSource.flat();
}


/*
 * One request for every scope at once - PostgREST takes a list -
 * narrowed by year and month in the database rather than by
 * reading the whole view and discarding most of it.
 */
async function loadMonthRecords(sources, years, months, signal) {

    const schema = await describeSource(MONTH_VIEW);

    const columns = [
        SCOPE_COLUMN,
        schema.yearColumn,
        MONTH_COLUMN,
        schema.entityColumn,
        schema.totalColumn,
        ...schema.classColumns
    ];

    const filters = [
        {
            column: SCOPE_COLUMN,
            values: sources.map(source => source.scope)
        },
        {
            column: MONTH_COLUMN,
            values: months.map(Number)
        }
    ];

    if (years.length > 0) {
        filters.push({ column: schema.yearColumn, values: years });
    }

    const rows = await fetchAllRowsFast(MONTH_VIEW, columns, {
        signal,
        filters
    });

    const rtoByScope = new Map(
        sources.map(source => [source.scope, source.rto])
    );

    return rows.map(row => ({
        rto: rtoByScope.get(row[SCOPE_COLUMN]) || null,
        scope: row[SCOPE_COLUMN],
        year: normalizeString(row[schema.yearColumn]),
        month: toNumber(row[MONTH_COLUMN]),
        maker: normalizeString(row[schema.entityColumn]),
        raw: row
    }));
}


/*
 * Card 2 always reads all four RTO sources - whatever Scope says,
 * and whatever the RTO checklist says too. That checklist chooses
 * which RTO rows buildRtoTable() displays, not which are fetched:
 * an RTO's market share needs every RTO's total in hand to measure
 * against, the same reason buildMakerTable() reads every maker
 * regardless of the Maker checklist. Narrowing the fetch itself is
 * how a filtered-down RTO used to show 100% market share of
 * nothing but itself.
 */
async function loadRtoRecords(grain, years, months, signal) {

    const sources = rtoSources([], grain);

    return loadRecords(sources, grain, years, months, signal);
}


/* ============================================================
   19. SELECTION HELPERS
   ============================================================ */

function selectedYears() {

    const available = availableYears(state.grain);
    const chosen = state.filters.years;

    const wanted = chosen.length > 0
        ? available.filter(year => chosen.includes(year))
        : available.slice();

    /* Ascending, so the year columns read left to right. */
    return wanted.sort((a, b) => Number(a) - Number(b));
}


function selectedMonthNumbers() {

    const chosen = state.filters.months;

    return chosen.length > 0
        ? MONTHS
            .filter(month => chosen.includes(String(month.number)))
            .map(month => month.number)
        : MONTHS.map(month => month.number);
}


function makerFilterSet() {

    const chosen = state.filters.makers;

    return chosen.length === 0
        ? null
        : new Set(chosen.map(normalizeKey));
}


/*
 * RTO codes need no normalizeKey the way maker names do - they are
 * short, fixed, already-consistent strings (rtoByCode() and
 * state.filters.rtos both use the exact same "GJ01" form).
 */
function rtoFilterSet() {

    const chosen = state.filters.rtos;

    return chosen.length === 0
        ? null
        : new Set(chosen);
}


function activeClassColumns(classColumns) {

    return resolveClassColumns(state.filters.classes, classColumns);
}


function growthBetween(from, to) {

    if (!Number.isFinite(from) || from <= 0) {
        return null;
    }

    return ((to - from) / from) * 100;
}


/* ============================================================
   20. CARD 1 - MAKER COMPARISON (YEAR WISE)
   ============================================================ */

function buildMakerTable() {

    const years = selectedYears();
    const yearSet = new Set(years);
    const columns = activeClassColumns(state.main.classColumns);
    const allowed = makerFilterSet();

    const byMaker = new Map();

    /*
     * The industry total - every record in the current Scope / Year
     * / RTO / Class selection, regardless of which makers the Maker
     * checklist has chosen to display. Share is measured against
     * this, not against the rows on screen: narrowing which makers
     * you're looking at must not inflate their share of a market
     * that hasn't actually shrunk. This is the same principle the
     * KPI strip's own Market Share figure already follows - see
     * measureYear()'s "industry" - card 1 just wasn't following it.
     */
    const industryByYear = {};
    let industryTotal = 0;

    state.main.records.forEach(record => {

        if (!yearSet.has(record.year)) {
            return;
        }

        const value = sumColumns(record.raw, columns);

        industryByYear[record.year] = (industryByYear[record.year] || 0) + value;
        industryTotal += value;

        if (allowed && !allowed.has(normalizeKey(record.maker))) {
            return;
        }

        let row = byMaker.get(record.maker);

        if (!row) {
            row = { maker: record.maker, byYear: {}, total: 0 };
            byMaker.set(record.maker, row);
        }

        row.byYear[record.year] = (row.byYear[record.year] || 0) + value;
        row.total += value;
    });

    const rows = [...byMaker.values()].filter(row => row.total > 0);

    const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

    const first = years[0];
    const last = years[years.length - 1];

    rows.forEach(row => {

        row.share = industryTotal > 0 ? (row.total / industryTotal) * 100 : null;

        row.growth = years.length > 1
            ? growthBetween(row.byYear[first] || 0, row.byYear[last] || 0)
            : null;
    });

    const totals = {
        maker: `Total (${formatIndianNumber(rows.length)})`,
        byYear: {},
        total: grandTotal,
        /*
         * 100% only when every maker is on screen (no Maker filter).
         * Filtered down to a handful of makers, this is genuinely
         * their combined share of the whole market - not a
         * restatement of the arithmetic, so it is no longer
         * suppressed the way it used to be (see makerColumns()).
         */
        share: industryTotal > 0 ? (grandTotal / industryTotal) * 100 : null,
        growth: null,
        isTotals: true
    };

    years.forEach(year => {
        totals.byYear[year] = rows.reduce(
            (sum, row) => sum + (row.byYear[year] || 0),
            0
        );
    });

    if (years.length > 1) {
        totals.growth = growthBetween(totals.byYear[first], totals.byYear[last]);
    }

    state.makerTable = { rows, years, totals, first, last, industryByYear, industryTotal };
}


/* ============================================================
   21. CARD 2 - RTO COMPARISON (MAKER WISE)
   ============================================================ */

function buildRtoTable() {

    const years = new Set(selectedYears());
    const columns = activeClassColumns(state.rto.classColumns);
    const allowed = makerFilterSet();

    /*
     * The RTO checklist chooses which RTO ROWS this card displays -
     * it plays the same role here that the Maker checklist plays in
     * Maker Comparison, choosing which of the thing being compared
     * to show. state.rto.records now always holds all four RTOs
     * (see loadRtoRecords()), so this filter is applied here, at
     * display time, rather than by never having fetched the rest.
     */
    const rtoAllowed = rtoFilterSet();

    /* code -> { code, name, total, byMaker: Map } */
    const byRto = new Map();
    const makerTotals = new Map();

    state.rto.records.forEach(record => {

        if (!record.rto || !years.has(record.year)) {
            return;
        }

        const value = sumColumns(record.raw, columns);

        if (value === 0) {
            return;
        }

        let row = byRto.get(record.rto);

        if (!row) {

            const rto = rtoByCode(record.rto);

            row = {
                code: record.rto,
                name: rto ? rto.name : record.rto,
                total: 0,
                byMaker: new Map()
            };

            byRto.set(record.rto, row);
        }

        /*
         * Every maker at this RTO matching Scope / Year / Class,
         * regardless of the Maker checklist AND regardless of the
         * RTO checklist - the denominator for both this row's own
         * share of the whole market and for each maker cell's share
         * of this RTO. Neither filter should be able to shrink it
         * (same principle as buildMakerTable()'s industry total).
         */
        row.total += value;

        if (allowed && !allowed.has(normalizeKey(record.maker))) {
            return;
        }

        if (rtoAllowed && !rtoAllowed.has(record.rto)) {
            return;
        }

        row.byMaker.set(
            record.maker,
            (row.byMaker.get(record.maker) || 0) + value
        );

        makerTotals.set(
            record.maker,
            (makerTotals.get(record.maker) || 0) + value
        );
    });

    const makerColumns = [...makerTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, CONFIG.RTO_MAKER_COLUMNS)
        .map(entry => entry[0]);

    /*
     * marketTotal is every RTO the fetch holds, whatever the RTO
     * checklist says - the true whole-market denominator. displayed
     * is just the RTOs the checklist chose to show; its own total is
     * what the footer's "Total Registration" sums (what's on
     * screen), kept separate from marketTotal (what a share is
     * measured against) exactly as buildMakerTable() keeps its
     * displayed grandTotal separate from its industryTotal.
     */
    const marketTotal = [...byRto.values()]
        .reduce((sum, row) => sum + row.total, 0);

    const displayed = [...byRto.values()]
        .filter(row => !rtoAllowed || rtoAllowed.has(row.code))
        .sort((a, b) => b.total - a.total);

    const grandTotal = displayed.reduce((sum, row) => sum + row.total, 0);

    displayed.forEach(row => {

        row.values = {};

        let named = 0;

        makerColumns.forEach(maker => {

            const value = row.byMaker.get(maker) || 0;

            row.values[maker] = value;
            named += value;
        });

        /*
         * row.total is the whole market at this RTO; named is only
         * the shown top-N maker columns, still narrowed by the
         * Maker checklist. Others is everyone else - minor makers
         * and any the checklist excluded alike - never negative,
         * never hidden by a filter that only changes which columns
         * are broken out.
         */
        row.others = row.total - named;
        row.share = marketTotal > 0 ? (row.total / marketTotal) * 100 : null;
    });

    const totals = {
        code: "TOTAL",
        name: `${displayed.length} RTO${displayed.length === 1 ? "" : "s"}`,
        values: {},
        others: displayed.reduce((sum, row) => sum + row.others, 0),
        total: grandTotal,
        share: marketTotal > 0 ? (grandTotal / marketTotal) * 100 : null
    };

    makerColumns.forEach(maker => {
        totals.values[maker] = displayed.reduce(
            (sum, row) => sum + row.values[maker],
            0
        );
    });

    state.rtoTable = { rows: displayed, makerColumns, totals };
}


/* ============================================================
   22. CARD 3 - DETAILED REGISTRATION DATA

   One row per year, month, RTO, maker and vehicle class, which
   means unpivoting maker x class. Most of that grid is zero - a
   maker builds one kind of vehicle and nothing else - so only
   the cells that carry a figure become rows.
   ============================================================ */

/*
 * The year is part of the key, so the same cell one year earlier is
 * found by looking up the key built with year - 1. Leaving the year
 * out looked simpler but broke as soon as the earlier year was
 * itself selected: 2025 would then be both a row and its own
 * comparison, and the index could hold only one of the two.
 */
function detailKey(year, record, column) {

    /*
     * JSON rather than a joined string: a maker name carrying the
     * separator would otherwise collide with a different cell.
     */
    return JSON.stringify([
        year,
        record.month,
        record.rto || "",
        normalizeKey(record.maker),
        column
    ]);
}


function buildDetailTable() {

    const years = selectedYears();
    const yearSet = new Set(years);
    const columns = activeClassColumns(state.main.classColumns);
    const allowed = makerFilterSet();

    /*
     * Every record matching Year/Scope/RTO/Class, regardless of the
     * Maker checklist - the same industry-total principle already
     * applied to Maker Comparison and RTO Comparison. Every Market
     * Share % in this card is measured against this, including the
     * "TOTAL (Selected Data)" footer row (see detailTotalsRow()) -
     * one consistent meaning for the column, top to bottom: share
     * of the true whole market, never of just what a filter or a
     * search happens to be showing right now.
     */
    let industryTotal = 0;

    state.main.records.forEach(record => {

        if (!yearSet.has(record.year)) {
            return;
        }

        industryTotal += sumColumns(record.raw, columns);
    });

    /*
     * The year before each selected one. A year can be both a row
     * and another year's comparison - selecting 2025 and 2026
     * together is the ordinary case - so this is not narrowed to
     * years outside the selection.
     */
    const priorYears = new Set(
        years.map(year => String(Number(year) - 1))
    );

    const prior = new Map();

    state.main.records.forEach(record => {

        if (!priorYears.has(record.year)) {
            return;
        }

        if (allowed && !allowed.has(normalizeKey(record.maker))) {
            return;
        }

        columns.forEach(column => {

            const value = toNumber(record.raw[column]);

            if (value > 0) {
                prior.set(detailKey(record.year, record, column), value);
            }
        });
    });

    const rows = [];
    const makerTotals = new Map();

    let truncated = false;

    for (const record of state.main.records) {

        if (!yearSet.has(record.year)) {
            continue;
        }

        if (allowed && !allowed.has(normalizeKey(record.maker))) {
            continue;
        }

        const rto = record.rto ? rtoByCode(record.rto) : null;

        for (const column of columns) {

            const value = toNumber(record.raw[column]);

            if (value <= 0) {
                continue;
            }

            if (rows.length >= CONFIG.MAX_DETAIL_ROWS) {
                truncated = true;
                break;
            }

            const before = prior.get(
                detailKey(String(Number(record.year) - 1), record, column)
            );

            rows.push({
                year: record.year,
                month: record.month,
                rtoCode: record.rto || "—",
                rtoName: rto ? rto.name : "—",
                maker: record.maker,
                vehicleClass: column,
                registration: value,
                yoy: before === undefined
                    ? null
                    : growthBetween(before, value)
            });

            makerTotals.set(
                record.maker,
                (makerTotals.get(record.maker) || 0) + value
            );
        }

        if (truncated) {
            break;
        }
    }

    const grandTotal = rows.reduce((sum, row) => sum + row.registration, 0);

    /*
     * Rank is the maker's standing in the whole selection, not the
     * row's - so the same maker carries the same rank on each of
     * its rows, which is what the column is for.
     */
    const ranks = new Map(
        [...makerTotals.entries()]
            .sort((a, b) => b[1] - a[1])
            .map((entry, index) => [entry[0], index + 1])
    );

    rows.forEach(row => {
        row.share = industryTotal > 0 ? (row.registration / industryTotal) * 100 : null;
        row.rank = ranks.get(row.maker) || null;
    });

    state.detailTable = {
        rows,
        truncated,
        totals: {
            registration: grandTotal,
            industryTotal,
            share: industryTotal > 0 ? (grandTotal / industryTotal) * 100 : null,
            rows: rows.length
        }
    };
}


/* ============================================================
   23. KPIs

   Each card is the same measure taken twice: once over the
   selected years, once over the year before the latest of them,
   which is what "vs Previous Year" compares.
   ============================================================ */

/*
 * One year at a time, cached for the life of a render. The strip
 * asks for three overlapping measures - the whole selection, its
 * latest year and the year before - and a per-year figure serves
 * all three by union rather than by three sweeps of the records.
 */
const measureCache = new Map();


function measureYear(year) {

    if (measureCache.has(year)) {
        return measureCache.get(year);
    }

    const columns = activeClassColumns(state.main.classColumns);
    const rtoColumns = activeClassColumns(state.rto.classColumns);
    const allowed = makerFilterSet();
    const rtoAllowed = rtoFilterSet();

    const makers = new Set();
    const classes = new Set();
    const rtos = new Set();

    let registrations = 0;
    let industry = 0;

    state.main.records.forEach(record => {

        if (record.year !== year) {
            return;
        }

        /*
         * The total and the classes that carry a figure come out
         * of the same pass - a second sweep over 75 columns per
         * row is the difference between a fast render and a
         * noticeable one on the All India table.
         */
        let value = 0;
        const present = [];

        columns.forEach(column => {

            const amount = toNumber(record.raw[column]);

            if (amount > 0) {
                value += amount;
                present.push(column);
            }
        });

        industry += value;

        if (allowed && !allowed.has(normalizeKey(record.maker))) {
            return;
        }

        registrations += value;

        if (value > 0) {
            makers.add(normalizeKey(record.maker));
            present.forEach(column => classes.add(column));
        }
    });

    state.rto.records.forEach(record => {

        if (!record.rto || record.year !== year) {
            return;
        }

        /*
         * state.rto.records now always holds all four RTOs (see
         * loadRtoRecords()), so this KPI - unlike buildRtoTable()'s
         * own count of RTOs it displays - needs its own explicit
         * check to keep respecting the RTO checklist.
         */
        if (rtoAllowed && !rtoAllowed.has(record.rto)) {
            return;
        }

        if (allowed && !allowed.has(normalizeKey(record.maker))) {
            return;
        }

        if (sumColumns(record.raw, rtoColumns) > 0) {
            rtos.add(record.rto);
        }
    });

    const result = { registrations, industry, makers, classes, rtos };

    measureCache.set(year, result);

    return result;
}


function measure(years) {

    const makers = new Set();
    const classes = new Set();
    const rtos = new Set();

    let registrations = 0;
    let industry = 0;

    years.forEach(year => {

        const yearly = measureYear(year);

        registrations += yearly.registrations;
        industry += yearly.industry;

        yearly.makers.forEach(value => makers.add(value));
        yearly.classes.forEach(value => classes.add(value));
        yearly.rtos.forEach(value => rtos.add(value));
    });

    return {
        registrations,
        makers: makers.size,
        rtos: rtos.size,
        classes: classes.size,
        share: industry > 0 ? (registrations / industry) * 100 : null
    };
}


function buildKpis() {

    const years = selectedYears();
    const current = measure(years);

    const latest = years[years.length - 1];
    const previousYear = String(Number(latest) - 1);

    const hasPrevious =
        latest !== undefined &&
        availableYears(state.grain).includes(previousYear);

    const previous = hasPrevious ? measure([previousYear]) : null;
    const latestOnly = hasPrevious ? measure([latest]) : null;

    const delta = key => {

        if (!previous || !latestOnly) {
            return null;
        }

        const from = previous[key];
        const to = latestOnly[key];

        if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) {
            return null;
        }

        return ((to - from) / from) * 100;
    };

    state.kpis = {
        registrations: current.registrations,
        makers: current.makers,
        rtos: current.rtos,
        classes: current.classes,
        share: current.share,

        yearsLabel: years.length === 0
            ? "—"
            : years.length === 1
                ? years[0]
                : `${years[0]} - ${years[years.length - 1]}`,

        yearsMeta: years.length === 0
            ? ""
            : `(${years.length} Year${years.length === 1 ? "" : "s"} Selected)`,

        comparedWith: hasPrevious ? previousYear : null,

        deltas: {
            registrations: delta("registrations"),
            makers: delta("makers"),
            rtos: delta("rtos"),
            classes: delta("classes"),
            share: delta("share")
        }
    };
}


/* ============================================================
   24. QUICK SUMMARY
   ============================================================ */

function buildSummary() {

    const maker = state.makerTable;
    const rto = state.rtoTable;

    const makers = maker.rows
        .slice()
        .sort((a, b) => b.total - a.total)
        .map(row => ({
            name: row.maker,
            value: formatPercentage(row.share)
        }));

    const rtos = rto.rows.map(row => ({
        name: `${row.code} — ${row.name}`,
        value: formatIndianNumber(row.total)
    }));

    /*
     * Growth is only worth ranking off a base that means
     * something. Without the floor this panel fills with makers
     * that went from two units to nine.
     */
    const growth = maker.rows
        .filter(row =>
            row.growth !== null &&
            (row.byYear[maker.first] || 0) >= CONFIG.GROWTH_MIN_BASE)
        .sort((a, b) => b.growth - a.growth)
        .map(row => ({
            name: row.maker,
            value: formatPercentage(row.growth),
            positive: row.growth >= 0
        }));

    const filters = state.filters;

    state.summary = {
        makers,
        rtos,
        growth,
        growthTitle: maker.years.length > 1
            ? `HIGHEST GROWTH (${String(maker.first).slice(-2)}-` +
              `${String(maker.last).slice(-2)})`
            : "HIGHEST GROWTH",

        facts: [
            ["Total Years Selected", maker.years.length],
            ["Total Months Selected", filters.months.length || MONTHS.length],
            ["Total RTOs Selected", state.kpis.rtos || 0],
            ["Total Makers Selected", state.kpis.makers || 0],
            ["Total Classes Selected", state.kpis.classes || 0]
        ]
    };
}


/* ============================================================
   25. DERIVE EVERYTHING

   One entry point, so the three cards, the KPI strip and the
   summary rail can never be looking at different selections.
   ============================================================ */

function deriveAll() {

    measureCache.clear();

    buildMakerTable();
    buildRtoTable();
    buildDetailTable();
    buildKpis();
    buildSummary();
}


/* ============================================================
   26. TABLE RENDERING

   All three cards share one painter. A column descriptor
   carries three functions, and may carry a fourth:

       raw(row)   the value to sort and to write into a sheet
       text(row)  what the cell shows
       cls(row)   an optional class, for growth arrows and zeros
       sub(row)   an optional second reading, set to the right of
                  text(row) inside the same cell and in a lighter
                  ink - the share that one cell holds

   The totals row is an ordinary row shaped to answer the same
   four, so the head, the body, the foot and the exports can
   never drift apart.
   ============================================================ */

function numberText(value) {

    return formatIndianNumber(value);
}


/*
 * The share one cell holds of its own market, for the lighter
 * figure printed beside the count. Zero is left without one:
 * "0" next to "0.00%" says nothing twice, and the empty cells
 * read better quiet.
 */
function cellShareText(value, denominator) {

    if (toNumber(value) === 0 || toNumber(denominator) <= 0) {
        return "";
    }

    return formatShare(value, denominator);
}


function growthText(value) {

    if (value === null || value === undefined) {
        return "—";
    }

    return `${formatPercentage(Math.abs(value))} ${value >= 0 ? "▲" : "▼"}`;
}


function growthClass(value) {

    if (value === null || value === undefined) {
        return "";
    }

    return value >= 0 ? "col-growth is-up" : "col-growth is-down";
}


function sortIconFor(column, sort) {

    if (!column.sortable || sort.sortKey !== column.key) {
        return "↕";
    }

    return sort.sortDir === "asc" ? "▲" : "▼";
}


function paintHead(headEl, columns, sort, sortGroup) {

    headEl.innerHTML = "";

    const tr = document.createElement("tr");

    columns.forEach(column => {

        const th = document.createElement("th");

        th.scope = "col";
        th.className = headClassFor(column);

        if (!column.sortable || !sortGroup) {
            th.textContent = column.label;
            tr.appendChild(th);
            return;
        }

        th.setAttribute(
            "aria-sort",
            sort.sortKey === column.key
                ? sort.sortDir === "asc" ? "ascending" : "descending"
                : "none"
        );

        const button = document.createElement("button");

        button.type = "button";
        button.className = "table-sort-button";
        button.setAttribute("data-sort-group", sortGroup);
        button.setAttribute("data-sort-key", column.key);
        button.setAttribute("aria-label", `Sort by ${column.label}`);

        const label = document.createElement("span");
        label.textContent = column.label;

        const icon = document.createElement("span");
        icon.className = "sort-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = sortIconFor(column, sort);

        button.appendChild(label);
        button.appendChild(icon);
        th.appendChild(button);

        tr.appendChild(th);
    });

    headEl.appendChild(tr);
}


function headClassFor(column) {

    return [
        column.numeric ? "numeric" : "",
        column.sticky ? "sticky-left" : ""
    ].filter(Boolean).join(" ");
}


/*
 * A cell is plain text unless the column offers a share, in
 * which case it becomes two readings side by side: the count
 * against the left edge of the cell, the share against the
 * right. Both are written as text nodes, never as markup.
 *
 * The flex layout lives on an inner wrapper, not the td itself -
 * a table cell with its own display overridden to flex stops
 * taking part in the table's column layout, which is what left
 * every share cell stacked under its neighbour instead of lined
 * up with its header.
 */
function fillCell(cell, column, row) {

    const text = column.text(row);
    const share = column.sub ? column.sub(row) : "";

    if (!share) {

        cell.textContent = text;
        return;
    }

    cell.classList.add("has-share");

    const wrap = document.createElement("span");
    wrap.className = "cell-share-wrap";

    const value = document.createElement("span");
    value.className = "cell-value";
    value.textContent = text;

    const note = document.createElement("span");
    note.className = "cell-share";
    note.textContent = share;

    wrap.appendChild(value);
    wrap.appendChild(note);
    cell.appendChild(wrap);
    cell.title = `${text}  ·  ${share} of ${column.shareOf || "the total"}`;
}


function cellClassFor(column, row) {

    return [
        column.numeric ? "numeric" : "",
        column.sticky ? "sticky-left" : "",
        column.emphasis ? "col-emphasis" : "",
        column.label === "Maker" || column.key === "maker" ? "col-label" : "",
        column.cls ? column.cls(row) : ""
    ].filter(Boolean).join(" ");
}


function paintRows(bodyEl, columns, rows) {

    bodyEl.innerHTML = "";

    const fragment = document.createDocumentFragment();

    rows.forEach(row => {

        const tr = document.createElement("tr");

        columns.forEach(column => {

            const td = document.createElement("td");

            td.className = cellClassFor(column, row);

            fillCell(td, column, row);

            if (!column.numeric) {
                td.title = td.textContent;
            }

            tr.appendChild(td);
        });

        fragment.appendChild(tr);
    });

    bodyEl.appendChild(fragment);
}


function paintFoot(footEl, columns, totals) {

    footEl.innerHTML = "";

    if (!totals) {
        return;
    }

    const tr = document.createElement("tr");

    columns.forEach(column => {

        const cell = document.createElement("td");

        cell.className = cellClassFor(column, totals);

        fillCell(cell, column, totals);

        tr.appendChild(cell);
    });

    footEl.appendChild(tr);
}


/*
 * Loading, empty and error all replace the table rather than
 * sitting above it, so a stale grid is never left on screen
 * under a message saying it could not be loaded.
 */
function setCardState(card, mode, message) {

    const stateEl = dom[`${card}CardState`];
    const wrapper = dom[`${card}Table`]?.closest(".table-wrapper");

    if (!stateEl) {
        return;
    }

    if (mode === "data") {

        stateEl.hidden = true;
        stateEl.className = "table-state";

        if (wrapper) {
            wrapper.hidden = false;
        }

        return;
    }

    stateEl.hidden = false;
    stateEl.className = `table-state table-state--${mode}`;
    stateEl.innerHTML = "";

    if (mode === "loading") {

        const spinner = document.createElement("span");

        spinner.className = "loading-spinner loading-spinner--small";
        spinner.setAttribute("aria-hidden", "true");

        stateEl.appendChild(spinner);
    }

    const text = document.createElement("span");
    text.textContent = message || "";
    stateEl.appendChild(text);

    if (wrapper) {
        wrapper.hidden = true;
    }
}


function sortRows(rows, columns, sort) {

    const column = columns.find(entry => entry.key === sort.sortKey);

    if (!column) {
        return rows;
    }

    const direction = sort.sortDir === "asc" ? 1 : -1;

    return rows.slice().sort((a, b) => {

        const left = column.raw(a);
        const right = column.raw(b);

        if (typeof left === "number" && typeof right === "number") {
            return (left - right) * direction;
        }

        return String(left).localeCompare(
            String(right),
            undefined,
            { numeric: true, sensitivity: "base" }
        ) * direction;
    });
}


function pageOf(rows, view) {

    const start = (view.page - 1) * view.pageSize;

    return rows.slice(start, start + view.pageSize);
}


function paintPagination(card, total, view) {

    const pages = Math.max(1, Math.ceil(total / view.pageSize));

    if (view.page > pages) {
        view.page = pages;
    }

    const indicator = dom[`${card}PageIndicator`];

    if (indicator) {
        indicator.textContent = `Page ${view.page} of ${pages}`;
    }

    const previous = document.querySelector(`[data-page="${card}-prev"]`);
    const next = document.querySelector(`[data-page="${card}-next"]`);

    if (previous) {
        previous.disabled = view.page <= 1;
    }

    if (next) {
        next.disabled = view.page >= pages;
    }

    return pages;
}


/* ============================================================
   27. CARD 1 - COLUMNS + RENDER
   ============================================================ */

function makerColumns() {

    const { years, first, last, industryByYear } = state.makerTable;

    const columns = [
        {
            key: "maker",
            label: "Maker",
            sticky: true,
            sortable: true,
            raw: row => row.maker,
            text: row => row.maker
        }
    ];

    /*
     * Each year cell carries the maker's share of that year's whole
     * market - value over industryByYear, every maker matching
     * Scope/Year/RTO/Class for that year, whether or not the Maker
     * checklist has chosen to display it. Selecting fewer makers to
     * look at must not inflate the shares of the ones still shown,
     * so this denominator does not move when only the Maker filter
     * changes - see buildMakerTable(). The totals row gets a share
     * too now: with the Maker filter narrowing which rows appear,
     * it is no longer always 100% - it is what the displayed makers
     * cover of the whole market, which is worth printing.
     */
    years.forEach(year => {
        columns.push({
            key: `year:${year}`,
            label: year,
            numeric: true,
            sortable: true,
            shareOf: String(year),
            raw: row => row.byYear[year] || 0,
            text: row => numberText(row.byYear[year] || 0),
            sub: row => cellShareText(
                row.byYear[year] || 0,
                industryByYear ? industryByYear[year] : 0
            ),
            cls: row => (row.byYear[year] ? "" : "is-zero")
        });
    });

    columns.push(
        {
            key: "__total",
            label: "Total Registration",
            numeric: true,
            emphasis: true,
            sortable: true,
            raw: row => row.total,
            text: row => numberText(row.total)
        },
        {
            key: "__share",
            label: "Market Share %",
            numeric: true,
            sortable: true,
            raw: row => row.share || 0,
            text: row => formatPercentage(row.share)
        },
        {
            key: "__growth",
            label: years.length > 1
                ? `Growth % (${String(first).slice(-2)}-${String(last).slice(-2)})`
                : "Growth %",
            numeric: true,
            sortable: true,
            raw: row => (row.growth === null ? -Infinity : row.growth),
            text: row => growthText(row.growth),
            cls: row => growthClass(row.growth)
        }
    );

    return columns;
}


function renderMakerCard() {

    const { rows, totals, years } = state.makerTable;
    const columns = makerColumns();
    const view = state.view.maker;

    if (dom.makerCardMeta) {
        dom.makerCardMeta.textContent =
            `${formatIndianNumber(rows.length)} makers · ` +
            `${years.length} year${years.length === 1 ? "" : "s"}`;
    }

    setExportEnabled(["maker-xlsx", "maker-pdf"], rows.length > 0);

    if (rows.length === 0) {
        setCardState("maker", "empty", "No registrations for this selection.");
        paintHead(dom.makerTableHead, columns, view, null);
        dom.makerTableBody.innerHTML = "";
        dom.makerTableFoot.innerHTML = "";
        paintPagination("maker", 0, view);
        return;
    }

    setCardState("maker", "data");

    const sorted = sortRows(rows, columns, view);

    state.makerTable.sorted = sorted;

    paintPagination("maker", sorted.length, view);

    paintHead(dom.makerTableHead, columns, view, "maker");
    paintRows(dom.makerTableBody, columns, pageOf(sorted, view));
    paintFoot(dom.makerTableFoot, columns, totals);
}


/* ============================================================
   28. CARD 2 - COLUMNS + RENDER
   ============================================================ */

function rtoColumns() {

    const { makerColumns: makers } = state.rtoTable;

    const columns = [
        {
            key: "code",
            label: "RTO Code",
            sticky: true,
            raw: row => row.code,
            text: row => row.code
        },
        {
            key: "name",
            label: "RTO Name",
            raw: row => row.name,
            text: row => row.name
        }
    ];

    /*
     * Each maker cell carries that maker's share of the RTO on
     * the row - value over the row's own total, so a row of
     * shares, Others included, sums to 100%.
     */
    makers.forEach(maker => {
        columns.push({
            key: `maker:${maker}`,
            label: maker,
            numeric: true,
            shareOf: "this RTO",
            raw: row => row.values[maker] || 0,
            text: row => numberText(row.values[maker] || 0),
            sub: row => cellShareText(row.values[maker] || 0, row.total),
            cls: row => (row.values[maker] ? "" : "is-zero")
        });
    });

    columns.push(
        {
            key: "__others",
            label: "Others",
            numeric: true,
            shareOf: "this RTO",
            raw: row => row.others,
            text: row => numberText(row.others),
            sub: row => cellShareText(row.others, row.total),
            cls: row => (row.others ? "" : "is-zero")
        },
        {
            key: "__total",
            label: "Total Registration",
            numeric: true,
            emphasis: true,
            raw: row => row.total,
            text: row => numberText(row.total)
        },
        {
            key: "__share",
            label: "Market Share %",
            numeric: true,
            raw: row => row.share || 0,
            text: row => formatPercentage(row.share)
        }
    );

    return columns;
}


function renderRtoCard() {

    const { rows, totals } = state.rtoTable;
    const columns = rtoColumns();

    if (dom.rtoCardMeta) {
        dom.rtoCardMeta.textContent =
            `${rows.length} of ${RTOS.length} RTOs`;
    }

    if (dom.rtoCardNote) {

        dom.rtoCardNote.hidden = state.notices.rto === "";
        dom.rtoCardNote.textContent = state.notices.rto;
    }

    setExportEnabled(["rto-xlsx", "rto-pdf"], rows.length > 0);

    if (rows.length === 0) {

        setCardState(
            "rto",
            "empty",
            "No RTO registrations for this selection."
        );

        paintHead(dom.rtoTableHead, columns, {}, null);
        dom.rtoTableBody.innerHTML = "";
        dom.rtoTableFoot.innerHTML = "";

        return;
    }

    setCardState("rto", "data");

    paintHead(dom.rtoTableHead, columns, {}, null);
    paintRows(dom.rtoTableBody, columns, rows);
    paintFoot(dom.rtoTableFoot, columns, totals);
}


/* ============================================================
   29. CARD 3 - COLUMNS + RENDER
   ============================================================ */

function detailColumns() {

    return [
        {
            key: "year",
            label: "Year",
            sortable: true,
            raw: row => row.year,
            text: row => row.year
        },
        {
            key: "month",
            label: "Month",
            sortable: true,
            raw: row => (row.month === null ? 0 : row.month),
            text: row => (row.month === null ? "All" : monthShort(row.month))
        },
        {
            key: "rtoCode",
            label: "RTO Code",
            sortable: true,
            raw: row => row.rtoCode,
            text: row => row.rtoCode
        },
        {
            key: "rtoName",
            label: "RTO Name",
            sortable: true,
            raw: row => row.rtoName,
            text: row => row.rtoName
        },
        {
            key: "maker",
            label: "Maker",
            sortable: true,
            raw: row => row.maker,
            text: row => row.maker
        },
        {
            key: "vehicleClass",
            label: "Vehicle Class",
            sortable: true,
            raw: row => row.vehicleClass,
            text: row => row.vehicleClass
        },
        {
            key: "registration",
            label: "Registration",
            numeric: true,
            emphasis: true,
            sortable: true,
            raw: row => row.registration,
            text: row => numberText(row.registration)
        },
        {
            key: "share",
            label: "Market Share %",
            numeric: true,
            sortable: true,
            raw: row => row.share || 0,
            text: row => formatPercentage(row.share)
        },
        {
            key: "yoy",
            label: "YoY Growth %",
            numeric: true,
            sortable: true,
            raw: row => (row.yoy === null ? -Infinity : row.yoy),
            text: row => growthText(row.yoy),
            cls: row => growthClass(row.yoy)
        },
        {
            key: "rank",
            label: "Rank (Maker)",
            numeric: true,
            sortable: true,
            raw: row => row.rank || Infinity,
            text: row => (row.rank === null ? "—" : String(row.rank))
        }
    ];
}


function monthShort(number) {

    const month = MONTHS.find(entry => entry.number === Number(number));

    return month ? month.key : String(number);
}


function detailSearchRows(rows) {

    const query = normalizeKey(state.view.detail.search);

    if (query === "") {
        return rows;
    }

    return rows.filter(row =>
        normalizeKey(row.maker).includes(query) ||
        normalizeKey(row.vehicleClass).includes(query)
    );
}


function detailTotalsRow(rows) {

    const registration = rows.reduce(
        (sum, row) => sum + row.registration,
        0
    );

    return {
        year: "",
        /* "" rather than null: null is the year-grain "All". */
        month: "",
        rtoCode: "",
        rtoName: "",
        maker: `TOTAL (Selected Data)`,
        vehicleClass: `${formatIndianNumber(rows.length)} rows`,
        registration,
        /*
         * Against the true whole-market total, same as every row
         * above it - not against totals.registration (the maker
         * filter's own sum), which used to make this read a flat,
         * meaningless 100% no matter how narrow the Maker filter
         * was. Typing a search still narrows the numerator exactly
         * as before; only the denominator changed.
         */
        share: state.detailTable.totals.industryTotal > 0
            ? (registration / state.detailTable.totals.industryTotal) * 100
            : null,
        yoy: null,
        rank: null
    };
}


function renderDetailCard() {

    const columns = detailColumns();
    const view = state.view.detail;

    const searched = detailSearchRows(state.detailTable.rows);
    const sorted = sortRows(searched, columns, view);

    state.detailTable.visible = sorted;

    if (dom.detailCardMeta) {

        dom.detailCardMeta.textContent =
            sorted.length === state.detailTable.rows.length
                ? `${formatIndianNumber(sorted.length)} rows`
                : `${formatIndianNumber(sorted.length)} of ` +
                  `${formatIndianNumber(state.detailTable.rows.length)} rows`;
    }

    if (dom.detailCardNote) {

        const notes = [];

        if (state.detailTable.truncated) {
            notes.push(
                `Capped at ${formatIndianNumber(CONFIG.MAX_DETAIL_ROWS)} ` +
                "rows — narrow the maker or class filter to see the rest."
            );
        }

        if (state.notices.detail) {
            notes.push(state.notices.detail);
        }

        dom.detailCardNote.hidden = notes.length === 0;
        dom.detailCardNote.textContent = notes.join(" ");
    }

    setExportEnabled(["detail-xlsx", "detail-pdf"], sorted.length > 0);

    if (sorted.length === 0) {

        setCardState(
            "detail",
            "empty",
            state.view.detail.search
                ? `Nothing matches "${state.view.detail.search}".`
                : "No registrations for this selection."
        );

        paintHead(dom.detailTableHead, columns, view, null);
        dom.detailTableBody.innerHTML = "";
        dom.detailTableFoot.innerHTML = "";
        paintPagination("detail", 0, view);

        return;
    }

    setCardState("detail", "data");

    paintPagination("detail", sorted.length, view);

    paintHead(dom.detailTableHead, columns, view, "detail");
    paintRows(dom.detailTableBody, columns, pageOf(sorted, view));
    paintFoot(dom.detailTableFoot, columns, detailTotalsRow(sorted));
}


/* ============================================================
   30. KPI STRIP + SUMMARY RAIL
   ============================================================ */

function renderDelta(element, value, comparedWith) {

    if (!element) {
        return;
    }

    element.innerHTML = "";

    if (value === null || value === undefined) {

        element.textContent = comparedWith
            ? "No comparable previous year"
            : "";

        return;
    }

    const up = value >= 0;

    element.appendChild(
        document.createTextNode(`vs ${comparedWith} : `)
    );

    const figure = document.createElement("strong");

    figure.className = up ? "is-up" : "is-down";
    figure.textContent = `${up ? "▲" : "▼"} ${formatPercentage(Math.abs(value))}`;

    element.appendChild(figure);
}


function renderKpis() {

    const kpis = state.kpis;
    const against = kpis.comparedWith;

    const set = (id, value) => {
        if (dom[id]) {
            dom[id].textContent = value;
        }
    };

    set("kpiRegistrations", formatIndianNumber(kpis.registrations));
    set("kpiMakers", formatIndianNumber(kpis.makers));
    set("kpiRtos", formatIndianNumber(kpis.rtos));
    set("kpiClasses", formatIndianNumber(kpis.classes));
    set("kpiShare", formatPercentage(kpis.share));
    set("kpiYears", kpis.yearsLabel);

    renderDelta(dom.kpiRegistrationsDelta, kpis.deltas.registrations, against);
    renderDelta(dom.kpiMakersDelta, kpis.deltas.makers, against);
    renderDelta(dom.kpiRtosDelta, kpis.deltas.rtos, against);
    renderDelta(dom.kpiClassesDelta, kpis.deltas.classes, against);
    renderDelta(dom.kpiShareDelta, kpis.deltas.share, against);

    if (dom.kpiYearsDelta) {
        dom.kpiYearsDelta.textContent = kpis.yearsMeta;
    }
}


function paintSummaryList(element, entries) {

    if (!element) {
        return;
    }

    element.innerHTML = "";

    if (entries.length === 0) {

        const empty = document.createElement("li");

        empty.className = "summary-list__empty";
        empty.textContent = "Nothing to show yet.";

        element.appendChild(empty);

        return;
    }

    const fragment = document.createDocumentFragment();

    entries.forEach(entry => {

        const item = document.createElement("li");

        const name = document.createElement("span");
        name.className = "summary-list__name";
        name.textContent = entry.name;
        name.title = entry.name;

        const value = document.createElement("span");

        value.className = "summary-list__value";

        if (entry.positive !== undefined) {
            value.classList.add(entry.positive ? "is-up" : "is-down");
        }

        value.textContent = entry.value;

        item.appendChild(name);
        item.appendChild(value);

        fragment.appendChild(item);
    });

    element.appendChild(fragment);
}


function renderSummary() {

    const summary = state.summary;

    paintSummaryList(
        dom.topMakersList,
        summary.makers.slice(0, CONFIG.SUMMARY_ROWS)
    );

    paintSummaryList(
        dom.topRtosList,
        summary.rtos.slice(0, CONFIG.SUMMARY_ROWS)
    );

    paintSummaryList(
        dom.topGrowthList,
        summary.growth.slice(0, CONFIG.SUMMARY_ROWS)
    );

    if (dom.growthPanelTitle) {
        dom.growthPanelTitle.textContent = summary.growthTitle;
    }

    if (dom.dataSummaryList) {

        dom.dataSummaryList.innerHTML = "";

        summary.facts.forEach(([label, value]) => {

            const item = document.createElement("li");

            const name = document.createElement("span");
            name.textContent = label;

            const figure = document.createElement("strong");
            figure.textContent = formatIndianNumber(value);

            item.appendChild(name);
            item.appendChild(figure);

            dom.dataSummaryList.appendChild(item);
        });
    }
}


const VIEW_ALL_TITLES = {
    makers: "All makers by market share",
    rtos: "All RTOs by registration",
    growth: "All makers by growth"
};


function openViewAll(kind) {

    const entries = state.summary[kind] || [];

    if (dom.viewAllTitle) {
        dom.viewAllTitle.textContent = VIEW_ALL_TITLES[kind] || "All";
    }

    paintSummaryList(dom.viewAllList, entries);

    if (dom.viewAllOverlay) {
        dom.viewAllOverlay.hidden = false;
    }
}


function closeViewAll() {

    if (dom.viewAllOverlay) {
        dom.viewAllOverlay.hidden = true;
    }
}


/* ============================================================
   31. HEADER + SHELL CHROME
   ============================================================ */

function renderHeader() {

    if (dom.dashboardTitle) {

        dom.dashboardTitle.textContent =
            `${scopeLabel(state.filters).toUpperCase()} ` +
            "VEHICLE REGISTRATION DASHBOARD";
    }

    if (dom.dataRefreshedOn) {

        dom.dataRefreshedOn.textContent = state.grain === "month"
            ? "31-Aug-2026 (monthly tables)"
            : `${DATA_AS_OF.label} (yearly tables)`;
    }
}


function renderAll() {

    renderHeader();
    renderKpis();
    renderMakerCard();
    renderRtoCard();
    renderDetailCard();
    renderSummary();
}


/* ============================================================
   32. XLSX EXPORT

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


/* ============================================================
   33. PDF

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


/* ============================================================
   34. EXPORTS

   Every card writes from the same column descriptors it renders
   from, so a sheet is the table it was taken from: same
   columns, same order, same totals row - and every filtered
   row, not the page that happened to be on screen.
   ============================================================ */

/*
 * Spelled into the file so a downloaded sheet can be read months
 * later without having to remember what was on screen.
 */
function activeFilterSummary() {

    const filters = state.filters;

    const list = (values, all) =>
        values.length === 0 ? all : values.join(", ");

    const parts = [
        `Scope: ${scopeLabel(filters)}`,
        `Grain: ${state.grain === "month" ? "monthly" : "yearly"}`,
        `Year: ${list(selectedYears(), "all")}`,
        `Month: ${filters.months.length === 0
            ? "all"
            : filters.months.map(monthLabel).join(", ")}`
    ];

    if (filters.makers.length > 0) {
        parts.push(`Maker: ${filters.makers.join(", ")}`);
    }

    if (filters.classes.length > 0) {
        parts.push(
            `Class: ${filters.classes.map(classOptionLabel).join(", ")}`
        );
    }

    if (state.view.detail.search) {
        parts.push(`Search: ${state.view.detail.search}`);
    }

    return parts.join("  ·  ");
}


function exportFileName(prefix, extension) {

    const stamp = new Date().toISOString().slice(0, 10);

    const scope = scopeLabel(state.filters)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    return `${prefix}-${scope}-${stamp}.${extension}`;
}


/*
 * A sheet wants the number, not the rendering of it. raw() gives
 * that for every column except the growth pair, whose sentinel
 * for "no comparable year" is not a figure anyone should see in
 * a spreadsheet.
 */
function exportValue(column, row) {

    const value = column.raw(row);

    if (typeof value === "string") {
        return value;
    }

    return Number.isFinite(value) ? value : null;
}


/*
 * The three cards, each resolved at the moment of export so a
 * menu item and the button beside the table write the same file.
 */
function exportSpecFor(kind) {

    if (kind === "maker") {

        const columns = makerColumns();

        return {
            title: "Maker Comparison (Year Wise)",
            sheet: "Maker Comparison",
            prefix: "maker-comparison",
            columns,
            rows: state.makerTable.sorted || state.makerTable.rows,
            totals: state.makerTable.totals,
            labelWidth: 42
        };
    }

    if (kind === "rto") {

        const columns = rtoColumns();

        return {
            title: "RTO Comparison (Maker Wise)",
            sheet: "RTO Comparison",
            prefix: "rto-comparison",
            columns,
            rows: state.rtoTable.rows,
            totals: state.rtoTable.totals,
            labelWidth: 30
        };
    }

    const columns = detailColumns();
    const rows = state.detailTable.visible || state.detailTable.rows;

    return {
        title: "Detailed Registration Data",
        sheet: "Detailed Data",
        prefix: "detailed-data",
        columns,
        rows,
        totals: detailTotalsRow(rows),
        labelWidth: 34
    };
}


function sheetFor(spec, { heading = true } = {}) {

    const rows = [];

    if (heading) {
        rows.push([{ value: spec.title, style: 1 }]);
        rows.push([activeFilterSummary()]);
        rows.push([
            `${formatIndianNumber(spec.rows.length)} rows · every filtered ` +
            "row, not just the page on screen"
        ]);
        rows.push([]);
    }

    rows.push(spec.columns.map(column => ({ value: column.label, style: 1 })));

    spec.rows.forEach(row => {
        rows.push(spec.columns.map(column => exportValue(column, row)));
    });

    if (spec.totals) {
        rows.push(spec.columns.map(column => ({
            value: exportValue(column, spec.totals),
            style: 2
        })));
    }

    return rows;
}


function widthsFor(spec) {

    return spec.columns.map((column, index) => {

        if (index === 0) {
            return spec.labelWidth;
        }

        return Math.max(11, Math.min(34, column.label.length + 3));
    });
}


async function exportCardXlsx(kind) {

    const spec = exportSpecFor(kind);

    if (spec.rows.length === 0) {
        return;
    }

    await downloadWorkbook(
        exportFileName(spec.prefix, "xlsx"),
        spec.sheet.slice(0, 31),
        sheetFor(spec),
        { widths: widthsFor(spec) }
    );
}


/*
 * All three on one sheet, stacked with a blank line between, so
 * the whole dashboard travels as a single file.
 */
async function exportEverythingXlsx() {

    const specs = ["maker", "rto", "detail"]
        .map(exportSpecFor)
        .filter(spec => spec.rows.length > 0);

    if (specs.length === 0) {
        return;
    }

    const rows = [
        [{ value: "Vehicle Registration Dashboard", style: 1 }],
        [activeFilterSummary()],
        []
    ];

    specs.forEach((spec, index) => {

        if (index > 0) {
            rows.push([], []);
        }

        rows.push([{ value: spec.title, style: 1 }]);

        sheetFor(spec, { heading: false }).forEach(row => rows.push(row));
    });

    await downloadWorkbook(
        exportFileName("dashboard", "xlsx"),
        "Dashboard",
        rows,
        {}
    );
}


async function exportCardPdf(kind) {

    const spec = exportSpecFor(kind);

    if (spec.rows.length === 0) {
        return;
    }

    const sheet = [spec.columns.map(column => column.label)];

    spec.rows.forEach(row => {
        sheet.push(spec.columns.map(column => column.text(row)));
    });

    if (spec.totals) {
        sheet.push(spec.columns.map(column => column.text(spec.totals)));
    }

    /*
     * The label column is given room for a real maker name; the
     * rest are sized to their heading, which is what decides how
     * many fit in a band.
     */
    const widths = spec.columns.map((column, index) => {

        if (index === 0 && !column.numeric) {
            return 150;
        }

        return Math.min(
            130,
            Math.max(46, pdfTextWidth(column.label, PDF_HEAD_SIZE) + 12)
        );
    });

    await downloadPdf(
        exportFileName(spec.prefix, "pdf"),
        spec.title,
        `${activeFilterSummary()}  ·  ${spec.rows.length} rows`,
        sheet,
        widths,
        { lead: 1, footRows: spec.totals ? [sheet.length - 1] : [] }
    );
}


function setExportEnabled(kinds, enabled) {

    kinds.forEach(kind => {

        document.querySelectorAll(`[data-export="${kind}"]`).forEach(button => {

            /* Menu items are always clickable; only buttons disable. */
            if (button.classList.contains("download-button")) {
                button.disabled = !enabled;
            }
        });
    });
}


async function runExport(action) {

    const [kind, format] = action.split("-");

    try {

        if (kind === "all") {
            await exportEverythingXlsx();
            return;
        }

        if (format === "pdf") {
            await exportCardPdf(kind);
        } else {
            await exportCardXlsx(kind);
        }

    } catch (error) {
        console.error("Export failed:", error);
        displayError(error, "The download could not be built.");
    }
}


/* ============================================================
   35. ERROR + LOADING
   ============================================================ */

function isAbortError(error) {

    return (
        error &&
        (error.name === "AbortError" || /abort/i.test(error.message || ""))
    );
}


function displayError(error, fallback) {

    if (!dom.errorMessage) {
        return;
    }

    dom.errorMessage.hidden = false;

    dom.errorMessageText.textContent =
        (error && error.message) || fallback || "Something went wrong.";
}


function clearError() {

    if (dom.errorMessage) {
        dom.errorMessage.hidden = true;
    }
}


function showLoading({ global = false } = {}) {

    if (global && dom.globalLoading) {
        dom.globalLoading.hidden = false;
    }

    ["maker", "rto", "detail"].forEach(card => {
        setCardState(card, "loading", "Loading…");
    });
}


function hideLoading() {

    if (dom.globalLoading) {
        dom.globalLoading.hidden = true;
    }
}


/* ============================================================
   36. APPLY

   Copies the sidebar's selection into the live one, reads both
   sources, then derives and renders everything from them.
   ============================================================ */

function cloneFilters(filters) {

    return {
        scope: filters.scope,
        years: filters.years.slice(),
        months: filters.months.slice(),
        rtos: filters.rtos.slice(),
        makers: filters.makers.slice(),
        classes: filters.classes.slice()
    };
}


function buildNotices(grain, sources) {

    const dropped = rtosWithoutGrain(state.filters.rtos, grain);

    state.notices.rto = dropped.length > 0
        ? `${dropped.join(", ")} has no monthly tables, so it is absent ` +
          "while a month is selected."
        : "";

    state.notices.detail = sources.some(source => source.rto === null)
        ? "RTO Code and RTO Name read “—” because the selection is a " +
          "scope rather than an RTO. Tick an RTO to fill them."
        : "";
}


async function applyFilters({ global = false } = {}) {

    const requestId = ++state.requestId;

    if (state.activeController) {
        state.activeController.abort();
    }

    const controller = new AbortController();
    state.activeController = controller;

    clearError();

    state.filters = cloneFilters(state.pending);
    state.grain = grainFor(state.filters);

    state.view.maker.page = 1;
    state.view.detail.page = 1;

    markDirty();
    renderHeader();

    const grain = state.grain;
    const sources = mainSources(state.filters, grain);
    const years = yearsToLoad(state.filters.years, grain);
    const months = selectedMonthNumbers();

    buildNotices(grain, sources);

    showLoading({ global });

    try {

        const [main, rto] = await Promise.all([
            loadRecords(sources, grain, years, months, controller.signal),
            loadRtoRecords(grain, years, months, controller.signal)
        ]);

        if (requestId !== state.requestId) {
            return false;
        }

        state.main = main;
        state.rto = rto;

        deriveAll();
        renderAll();

        return true;

    } catch (error) {

        if (isAbortError(error) || requestId !== state.requestId) {
            return false;
        }

        console.error("Dashboard data error:", error);

        state.main = { records: [], classColumns: [] };
        state.rto = { records: [], classColumns: [] };

        deriveAll();
        renderAll();

        ["maker", "rto", "detail"].forEach(card => {
            setCardState(card, "error", error.message);
        });

        displayError(error, "Unable to load dashboard data.");

        return false;

    } finally {

        if (requestId === state.requestId) {
            hideLoading();
            state.activeController = null;
        }
    }
}


async function resetFilters() {

    state.pending = emptyFilters();

    state.view.detail.search = "";

    if (dom.detailSearch) {
        dom.detailSearch.value = "";
    }

    if (dom.scopeFilter) {
        dom.scopeFilter.value = DEFAULT_SCOPE;
    }

    checklists.forEach(checklist => {

        checklist.query = "";

        if (checklist.search) {
            checklist.search.value = "";
        }
    });

    await loadFilterOptions();

    renderAllChecklists();
    updateFilterNotice();

    await applyFilters();
}


/* ============================================================
   37. EVENT WIRING
   ============================================================ */

function setupFilterListeners() {

    if (dom.scopeFilter) {

        dom.scopeFilter.addEventListener("change", async () => {
            state.pending.scope = dom.scopeFilter.value;
            await onPendingChanged("scope");
        });
    }

    if (dom.dashboardFilters) {

        dom.dashboardFilters.addEventListener("submit", async event => {
            event.preventDefault();
            await applyFilters();
        });
    }

    if (dom.resetFiltersButton) {

        dom.resetFiltersButton.addEventListener("click", async () => {
            await resetFilters();
        });
    }

    if (dom.collapseFiltersButton) {

        dom.collapseFiltersButton.addEventListener("click", () => {

            const collapsed = dom.appShell.classList.toggle("is-collapsed");

            dom.collapseFiltersButton.setAttribute(
                "aria-expanded",
                String(!collapsed)
            );

            dom.collapseFiltersButton.title = collapsed
                ? "Expand filters"
                : "Collapse filters";
        });
    }
}


function setupTableListeners() {

    /*
     * Sorting, paging and page size are all delegated: the heads
     * are rebuilt on every render, so a listener bound to a
     * button would not survive the next one.
     */
    document.addEventListener("click", event => {

        const sort = event.target.closest("[data-sort-group]");

        if (sort) {

            const group = sort.getAttribute("data-sort-group");
            const key = sort.getAttribute("data-sort-key");
            const view = state.view[group];

            if (!view) {
                return;
            }

            if (view.sortKey === key) {
                view.sortDir = view.sortDir === "asc" ? "desc" : "asc";
            } else {
                view.sortKey = key;
                view.sortDir = "desc";
            }

            view.page = 1;

            if (group === "maker") {
                renderMakerCard();
            } else {
                renderDetailCard();
            }

            return;
        }

        const page = event.target.closest("[data-page]");

        if (page) {

            const [card, direction] = page.getAttribute("data-page").split("-");
            const view = state.view[card];

            if (!view) {
                return;
            }

            view.page = Math.max(
                1,
                view.page + (direction === "next" ? 1 : -1)
            );

            if (card === "maker") {
                renderMakerCard();
            } else {
                renderDetailCard();
            }
        }
    });

    [["makerPageSize", "maker"], ["detailPageSize", "detail"]]
        .forEach(([id, card]) => {

            if (!dom[id]) {
                return;
            }

            dom[id].addEventListener("change", () => {

                state.view[card].pageSize = Number(dom[id].value) || 25;
                state.view[card].page = 1;

                if (card === "maker") {
                    renderMakerCard();
                } else {
                    renderDetailCard();
                }
            });
        });

    if (dom.detailSearch) {

        dom.detailSearch.addEventListener("input", () => {

            clearTimeout(state.searchTimer);

            state.searchTimer = setTimeout(() => {
                state.view.detail.search = dom.detailSearch.value;
                state.view.detail.page = 1;
                renderDetailCard();
            }, CONFIG.SEARCH_DELAY);
        });
    }
}


function setupExportListeners() {

    if (dom.exportMenuButton) {

        dom.exportMenuButton.addEventListener("click", event => {

            event.stopPropagation();

            const open = dom.exportMenuList.hidden;

            dom.exportMenuList.hidden = !open;
            dom.exportMenuButton.setAttribute("aria-expanded", String(open));
        });
    }

    document.addEventListener("click", async event => {

        const trigger = event.target.closest("[data-export]");

        if (trigger) {

            if (dom.exportMenuList) {
                dom.exportMenuList.hidden = true;
                dom.exportMenuButton.setAttribute("aria-expanded", "false");
            }

            await runExport(trigger.getAttribute("data-export"));

            return;
        }

        if (
            dom.exportMenuList &&
            !dom.exportMenuList.hidden &&
            !event.target.closest(".export-menu")
        ) {
            dom.exportMenuList.hidden = true;
            dom.exportMenuButton.setAttribute("aria-expanded", "false");
        }
    });
}


function setupSummaryListeners() {

    document.addEventListener("click", event => {

        const trigger = event.target.closest("[data-view-all]");

        if (trigger) {
            openViewAll(trigger.getAttribute("data-view-all"));
            return;
        }

        if (event.target === dom.viewAllOverlay) {
            closeViewAll();
        }
    });

    if (dom.viewAllClose) {
        dom.viewAllClose.addEventListener("click", closeViewAll);
    }

    document.addEventListener("keydown", event => {

        if (event.key === "Escape") {
            closeViewAll();
        }
    });
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
   38. IMPORT (UPLOAD)

   The one card in this file that writes rather than reads. The
   two-step shape mirrors the Edge Function on the other end:
   "Check File" only ever asks it to parse and validate a
   workbook - nothing is written yet. "Confirm & Import" re-sends
   the exact same File object a second time, and only then can
   anything reach the database. See supabase/functions/
   import-workbook/index.ts for the server side of this contract,
   and tools/IMPORT-CHECKS.md for what every check does.
   ============================================================ */

const AUTH_STORAGE_KEY = "vad_import_auth";


/* sessionStorage, not localStorage - see state.auth's own comment. */
function loadStoredAuth() {

    let raw;

    try {
        raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    } catch {
        return;
    }

    if (!raw) {
        return;
    }

    try {

        const parsed = JSON.parse(raw);

        state.auth.user = parsed.user || null;
        state.auth.pass = parsed.pass || null;

    } catch {
        /* Corrupt entry - treat as logged out rather than throwing. */
    }
}


function saveAuth(user, pass) {

    state.auth.user = user;
    state.auth.pass = pass;

    try {
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user, pass }));
    } catch {
        /* Private browsing, storage full, etc. - the login still
           works for this page load, it just will not survive a
           refresh. Not worth surfacing to the user. */
    }
}


function clearAuth() {

    state.auth.user = null;
    state.auth.pass = null;

    try {
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
        /* Nothing to do if storage is unavailable. */
    }
}


function isLoggedIn() {
    return Boolean(state.auth.user);
}


const LOGIN_NOTICE_KEY = "vad_login_notice";


/* Survives the reload logoutAndReload() below does, so the login
   screen can say why it is showing again instead of an empty form. */
function setLoginNotice(message) {

    try {
        sessionStorage.setItem(LOGIN_NOTICE_KEY, message);
    } catch {
        /* Nothing to do if storage is unavailable - the reload still
           happens, it just lands on a plain login screen. */
    }
}


function consumeLoginNotice() {

    let message = null;

    try {
        message = sessionStorage.getItem(LOGIN_NOTICE_KEY);
        sessionStorage.removeItem(LOGIN_NOTICE_KEY);
    } catch {
        /* Nothing stored, or storage unavailable - either way, no notice. */
    }

    return message;
}


/*
 * The one call that can actually confirm a username/password without
 * uploading anything - mode=ping short-circuits in import-workbook's
 * handle() right after requireAuth(), before any file is required.
 * This is what login (not just Import) checks credentials against.
 */
async function verifyCredentials(user, pass) {

    const form = new FormData();
    form.append("mode", "ping");

    let response;

    try {

        response = await fetch(IMPORT_FUNCTION_URL, {
            method: "POST",
            headers: { Authorization: `Basic ${btoa(`${user}:${pass}`)}` },
            body: form
        });

    } catch (error) {
        throw new Error(`Could not reach the login service: ${error.message}`);
    }

    if (response.status === 401) {
        return false;
    }

    if (!response.ok) {
        throw new Error(`Login service returned an unexpected error (HTTP ${response.status}).`);
    }

    return true;
}


/*
 * Full reload rather than resetting state by hand - login gates
 * everything now (see bootstrapApp()), so "logged out" and "freshly
 * loaded, not yet logged in" are the same state. `message`, if
 * given, survives the reload via sessionStorage and greets the user
 * on the login screen that comes back.
 */
function logoutAndReload(message) {

    clearAuth();

    if (message) {
        setLoginNotice(message);
    }

    location.reload();
}


function importFormData(mode, file) {

    const form = new FormData();

    form.append("mode", mode);
    form.append("file", file, file.name);

    return form;
}


async function callImportFunction(mode, file) {

    const headers = {};

    if (isLoggedIn()) {
        headers.Authorization = `Basic ${btoa(`${state.auth.user}:${state.auth.pass}`)}`;
    }

    let response;

    try {

        response = await fetch(IMPORT_FUNCTION_URL, {
            method: "POST",
            headers,
            body: importFormData(mode, file)
        });

    } catch (error) {
        throw new Error(`Could not reach the import service: ${error.message}`);
    }

    if (response.status === 401) {
        logoutAndReload("Your session ended - please log in again.");
        throw new Error("Your session ended - please log in again.");
    }

    let body;

    try {
        body = await response.json();
    } catch (error) {
        throw new Error(
            `Import service sent back something unreadable (HTTP ${response.status}).`
        );
    }

    if (!response.ok || body.ok === false) {

        const failure = new Error(body.error || `Import failed (HTTP ${response.status}).`);
        failure.report = body.report || null;

        throw failure;
    }

    return body;
}


/* Mirrors setCardState()'s table-state classes and markup exactly,
   so the Import card's status line looks like every other card's. */
function setImportState(mode, message) {

    if (!dom.importState) {
        return;
    }

    if (mode === "data") {
        dom.importState.hidden = true;
        dom.importState.className = "table-state";
        return;
    }

    dom.importState.hidden = false;
    dom.importState.className = `table-state table-state--${mode}`;
    dom.importState.innerHTML = "";

    if (mode === "loading") {

        const spinner = document.createElement("span");

        spinner.className = "loading-spinner loading-spinner--small";
        spinner.setAttribute("aria-hidden", "true");

        dom.importState.appendChild(spinner);
    }

    const text = document.createElement("span");
    text.textContent = message || "";
    dom.importState.appendChild(text);
}


function resetImportOutcome() {

    if (dom.importReport) {
        dom.importReport.hidden = true;
        dom.importReport.innerHTML = "";
    }

    if (dom.importResult) {
        dom.importResult.hidden = true;
        dom.importResult.innerHTML = "";
    }

    if (dom.importCommitButton) {
        dom.importCommitButton.hidden = true;
    }

    state.import.report = null;
}


function renderImportReport(report) {

    if (!dom.importReport) {
        return;
    }

    const coverage = report.partialMonth
        ? ` &middot; partial month, through day ${report.coverageEndDay}`
        : "";

    const parts = [
        `<div class="import-report__head">
            <strong>${escapeHtml(report.fileName)}</strong>
            <span>${escapeHtml(report.month)} ${report.year}${coverage}</span>
        </div>`,
        `<ul class="import-report__stats">
            <li><strong>${formatIndianNumber(report.rowCount)}</strong> makers</li>
            <li><strong>${formatIndianNumber(report.units)}</strong> total registrations</li>
            <li>${formatIndianNumber(report.blankRowsSkipped)} blank row(s) skipped</li>
        </ul>`
    ];

    if (report.structuralProblems.length > 0) {

        parts.push(
            `<div class="import-report__problems">
                <strong>${report.structuralProblems.length} problem(s) - ` +
                    `this file cannot be imported:</strong>
                <ul>${report.structuralProblems.map(
                    problem => `<li>${escapeHtml(problem)}</li>`
                ).join("")}</ul>
            </div>`
        );

    } else {
        parts.push(`<p class="import-report__ok">No blocking problems found.</p>`);
    }

    if (report.sumMismatches.shown.length > 0) {

        const rows = report.sumMismatches.shown.map(mismatch =>
            `<li>${escapeHtml(mismatch.maker)}: Total is ` +
            `${formatIndianNumber(mismatch.total)}, class columns sum to ` +
            `${formatIndianNumber(mismatch.summed)}</li>`
        ).join("");

        const omitted = report.sumMismatches.omitted > 0
            ? `<li>&hellip; and ${formatIndianNumber(report.sumMismatches.omitted)} more</li>`
            : "";

        parts.push(
            `<div class="import-report__warnings">
                <strong>Total doesn't match its own class columns for these ` +
                    `makers - not blocked, but worth a look:</strong>
                <ul>${rows}${omitted}</ul>
            </div>`
        );
    }

    dom.importReport.innerHTML = parts.join("");
    dom.importReport.hidden = false;
}


function renderImportResult(write) {

    if (!dom.importResult) {
        return;
    }

    dom.importResult.innerHTML = `
        <div class="import-result__ok">
            <strong>Imported.</strong>
            ${escapeHtml(write.table || "")} now holds
            ${formatIndianNumber(write.inserted || 0)} maker(s) for ${write.year},
            ${formatIndianNumber(write.units || 0)} total registrations
            (replacing ${formatIndianNumber(write.deleted || 0)} previous row(s) for that year).
        </div>
    `;

    dom.importResult.hidden = false;
}


function importErrorMessage(error) {
    return error && error.message ? error.message : "Something went wrong.";
}


async function runImportCheck() {

    const file = state.import.file;

    if (!file || state.import.busy) {
        return;
    }

    state.import.busy = true;
    resetImportOutcome();
    setImportState("loading", `Checking ${file.name}...`);

    if (dom.importValidateButton) {
        dom.importValidateButton.disabled = true;
    }

    try {

        const body = await callImportFunction("preview", file);

        setImportState("data");
        renderImportReport(body.report);
        state.import.report = body.report;

        if (dom.importCommitButton) {
            dom.importCommitButton.hidden = body.report.structuralProblems.length > 0;
        }

    } catch (error) {

        setImportState("error", importErrorMessage(error));

        if (error.report) {
            renderImportReport(error.report);
        }

    } finally {

        state.import.busy = false;

        if (dom.importValidateButton) {
            dom.importValidateButton.disabled = false;
        }
    }
}


async function runImportCommit() {

    const file = state.import.file;
    const report = state.import.report;

    if (!file || state.import.busy || !report) {
        return;
    }

    const monthYear = `${report.month} ${report.year}`;

    if (!window.confirm(
        `This replaces every existing row for ${monthYear} in ` +
        `Maker_Class_Wise_${report.month}. Continue?`
    )) {
        return;
    }

    state.import.busy = true;
    setImportState("loading", `Importing ${monthYear}...`);

    if (dom.importCommitButton) {
        dom.importCommitButton.disabled = true;
    }

    try {

        const body = await callImportFunction("commit", file);

        setImportState("data");
        renderImportResult(body.write || {});

        /* Done - clear the form so a stale file can't be re-confirmed. */
        state.import.file = null;
        state.import.report = null;

        if (dom.importFileInput) {
            dom.importFileInput.value = "";
        }

        if (dom.importFileLabel) {
            dom.importFileLabel.textContent = "Choose a workbook, or drop it here";
        }

        if (dom.importValidateButton) {
            dom.importValidateButton.disabled = true;
        }

        if (dom.importCommitButton) {
            dom.importCommitButton.hidden = true;
        }

    } catch (error) {

        setImportState("error", importErrorMessage(error));

    } finally {

        state.import.busy = false;

        if (dom.importCommitButton) {
            dom.importCommitButton.disabled = false;
        }
    }
}


function handleImportFileChosen(file) {

    state.import.file = file || null;

    resetImportOutcome();
    setImportState("data");

    if (dom.importFileLabel) {
        dom.importFileLabel.textContent = file
            ? file.name
            : "Choose a workbook, or drop it here";
    }

    if (dom.importValidateButton) {
        dom.importValidateButton.disabled = !file;
    }
}


/*
 * The dialog itself: identical open/hide mechanics to
 * openViewAll()/closeViewAll(), a separate pair rather than a
 * shared one because closing never needs to clear the file/report
 * the way switching between view-all lists needs to swap content -
 * reopening picks up exactly where the last check or import left
 * off.
 *
 * The login gate now sits in front of the whole dashboard (see
 * bootstrapApp()), so by the time this can be clicked state.auth is
 * already populated - the isLoggedIn() check is just a defensive
 * fallback, not the normal path in here.
 */
function openImportModal() {

    if (!isLoggedIn()) {
        requireLogin();
        return;
    }

    if (dom.importOverlay) {
        dom.importOverlay.hidden = false;
    }
}


function closeImportModal() {

    if (dom.importOverlay) {
        dom.importOverlay.hidden = true;
    }
}


/*
 * Shows the login screen with nothing to dismiss it - there is no
 * "cancel" once the dashboard itself is gated, only "log in" or
 * "leave the page". See bootstrapApp() for the one legitimate caller
 * (nothing was ever logged in) and logoutAndReload() (a fresh page
 * load lands here again after Log Out).
 */
function requireLogin() {

    if (dom.loginOverlay) {
        dom.loginOverlay.hidden = false;
    }

    if (dom.loginUser) {
        dom.loginUser.focus();
    }
}


/*
 * verifyCredentials() is the only thing that can actually confirm a
 * username/password - this just relays what it found onto the form.
 */
async function handleLoginSubmit(event) {

    event.preventDefault();

    const user = dom.loginUser ? dom.loginUser.value.trim() : "";
    const pass = dom.loginPass ? dom.loginPass.value : "";

    if (!user || !pass) {
        return;
    }

    if (dom.loginError) {
        dom.loginError.hidden = true;
    }

    if (dom.loginSubmit) {
        dom.loginSubmit.disabled = true;
        dom.loginSubmit.textContent = "Logging in...";
    }

    try {

        const accepted = await verifyCredentials(user, pass);

        if (!accepted) {

            if (dom.loginError) {
                dom.loginError.textContent = "Incorrect username or password.";
                dom.loginError.hidden = false;
            }

            return;
        }

        saveAuth(user, pass);

        if (dom.loginOverlay) {
            dom.loginOverlay.hidden = true;
        }

        if (dom.logoutButton) {
            dom.logoutButton.hidden = false;
        }

        await initializeDashboard();

    } catch (error) {

        if (dom.loginError) {
            dom.loginError.textContent = error.message || "Could not log in - try again.";
            dom.loginError.hidden = false;
        }

    } finally {

        if (dom.loginSubmit) {
            dom.loginSubmit.disabled = false;
            dom.loginSubmit.textContent = "Log In";
        }
    }
}


function setupLoginListeners() {

    if (dom.loginForm) {
        dom.loginForm.addEventListener("submit", handleLoginSubmit);
    }

    if (dom.logoutButton) {

        dom.logoutButton.addEventListener("click", () => {
            logoutAndReload();
        });
    }
}


function setupImportListeners() {

    if (dom.importOpenButton) {
        dom.importOpenButton.addEventListener("click", openImportModal);
    }

    if (dom.importClose) {
        dom.importClose.addEventListener("click", closeImportModal);
    }

    if (dom.importOverlay) {

        dom.importOverlay.addEventListener("click", event => {

            if (event.target === dom.importOverlay) {
                closeImportModal();
            }
        });
    }

    document.addEventListener("keydown", event => {

        if (event.key === "Escape" && dom.importOverlay && !dom.importOverlay.hidden) {
            closeImportModal();
        }
    });

    if (dom.importChecksToggle && dom.importChecksPanel) {

        dom.importChecksToggle.addEventListener("click", () => {

            const open = dom.importChecksPanel.hidden;

            dom.importChecksPanel.hidden = !open;
            dom.importChecksToggle.setAttribute("aria-expanded", String(open));
        });
    }

    if (dom.importFileInput) {

        dom.importFileInput.addEventListener("change", () => {
            handleImportFileChosen(dom.importFileInput.files[0] || null);
        });
    }

    if (dom.importForm) {

        /* The whole card is a drop target, not just the dropzone label. */
        ["dragover", "dragleave", "drop"].forEach(name => {
            dom.importForm.addEventListener(name, event => event.preventDefault());
        });

        dom.importForm.addEventListener("drop", event => {

            const file = event.dataTransfer?.files?.[0];

            if (file) {
                handleImportFileChosen(file);
            }
        });
    }

    if (dom.importValidateButton) {
        dom.importValidateButton.addEventListener("click", runImportCheck);
    }

    if (dom.importCommitButton) {
        dom.importCommitButton.addEventListener("click", runImportCommit);
    }
}


/* ============================================================
   39. INITIALIZATION
   ============================================================ */

async function initializeDashboard({ force = false } = {}) {

    if (state.initialized && !force) {
        return;
    }

    cacheDOM();
    setupRetry();

    state.tableCache = new Map();

    if (dom.globalLoading) {
        dom.globalLoading.hidden = false;
    }

    try {

        await initializeApi();

        buildChecklists();

        await loadFilterOptions();

        renderAllChecklists();
        updateFilterNotice();

        if (!state.wired) {
            setupFilterListeners();
            setupTableListeners();
            setupExportListeners();
            setupSummaryListeners();
            setupImportListeners();
            state.wired = true;
        }

        await applyFilters({ global: true });

    } catch (error) {

        console.error("Dashboard initialization failed:", error);

        displayError(error, "Dashboard initialization failed.");

        ["maker", "rto", "detail"].forEach(card => {
            setCardState(card, "error", error.message);
        });

    } finally {

        state.initialized = true;

        hideLoading();
    }
}


/*
 * The dashboard's actual front door. Every card here reads with the
 * publishable key and has no login of its own to check - the login
 * screen is the only thing standing between a fresh page load and
 * initializeDashboard() ever running at all. A session already
 * holding credentials (this page's own earlier login, still in
 * sessionStorage) skips straight past it; nothing re-verifies them
 * against the server until the first real import-workbook call
 * (Import), which is what 401-triggers logoutAndReload() for.
 */
function bootstrapApp() {

    cacheDOM();
    loadStoredAuth();
    setupLoginListeners();

    const notice = consumeLoginNotice();

    if (notice && dom.loginError) {
        dom.loginError.textContent = notice;
        dom.loginError.hidden = false;
    }

    if (!isLoggedIn()) {
        requireLogin();
        return;
    }

    if (dom.logoutButton) {
        dom.logoutButton.hidden = false;
    }

    initializeDashboard();
}


/* ============================================================
   40. GLOBAL API
   ============================================================ */

window.vehicleDashboard = {
    initializeDashboard,
    applyFilters,
    resetFilters,
    loadFilterOptions,
    state
};


/* ============================================================
   41. DOM READY
   ============================================================ */

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        bootstrapApp();
    });
} else {
    bootstrapApp();
}
