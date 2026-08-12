/* ============================================================
   VEHICLE REGISTRATION ANALYTICS DASHBOARD
   File: /script.js

   Vanilla JavaScript + Supabase JS Client
   NO RPC FUNCTIONS

   ------------------------------------------------------------
   SCHEMA (verified against the live project)

   maker_rtoname_2026_all_records   94,122 rows   LONG
       maker | rto | registrations | year
       1,931 makers x 1,412 RTOs.  Sum 1,93,14,842

   maker_month_wise_2026_all_records  1,932 rows  WIDE
       SR_NO | Maker | 2026-Jan .. 2026-Aug | Total
       Sum 1,93,14,842

   state_wise_month_wise_2026            36 rows  WIDE
       SR_NO | State | 2026-Jan .. 2026-Aug | Total
       Sum 1,93,14,823

   state_wise_class_wise                 36 rows  WIDE
       SR_NO | State | <76 vehicle classes> | Total
       Sum 1,93,14,823

   MAKER_WISE                           904 rows  WIDE
       SR_NO | MAKER | <33 vehicle classes> | TOTAL
       Sum 20,26,329  --  ELECTRIC VEHICLES ONLY

   maker_calendar_year_2026_all_records   5 rows
       A truncated export (5 makers x 539 RTOs). Not used.

   ------------------------------------------------------------
   WHAT THE DATA CAN AND CANNOT DO

   maker x rto     yes      maker x month   yes
   state x month   yes      state x class   yes  (national)
   maker x class   yes      but ELECTRIC ONLY
   maker x state   NO TABLE EXISTS
   national maker x class   NO TABLE EXISTS

   Because there is no maker x state table, State cannot be a
   filter on a maker listing. It is a separate breakdown -
   hence the Breakdown control, which swaps the row entity and
   re-points every filter at a table that can actually answer.

   PostgREST caps responses at 1,000 rows on this project
   (verified: asked for 5,000, received 1,000), so every read
   pages with .range().
   ============================================================ */


/* ============================================================
   1. SUPABASE CONFIGURATION
   ============================================================ */

const SUPABASE_URL =
    "https://yifnagndjbeqszexzaem.supabase.co";

/*
 * Publishable key - safe to ship in client code, but it makes
 * every table it can reach world-readable. Keep RLS enabled
 * with read-only policies on this project.
 */
const SUPABASE_ANON_KEY =
    "sb_publishable_HOBG1-ykEePfvvoJdm4X9w_3DU0itBG";


/* ============================================================
   2. TABLE CONFIGURATION
   ============================================================ */

const TABLES = {
    MAKER_MONTH: "maker_month_wise_2026_all_records",
    MAKER_RTO: "maker_rtoname_2026_all_records",
    MAKER_CLASS: "MAKER_WISE",
    STATE_MONTH: "state_wise_month_wise_2026",
    STATE_CLASS: "state_wise_class_wise"
};


/* ============================================================
   3. APPLICATION CONFIGURATION
   ============================================================ */

const CONFIG = {

    ALL: "all",

    DATA_YEAR: "2026",

    PAGE_SIZE: 25,

    PAGE_SIZES: [25, 50, 100],

    SEARCH_DELAY: 150,

    MAX_SEARCH_ROWS: 5,

    /*
     * Server row cap. Reads page in these chunks.
     */
    FETCH_PAGE_SIZE: 1000,

    MAX_FETCH_PAGES: 200,

    /*
     * Concurrent page requests when sweeping a large table
     * (the RTO list needs ~95 pages).
     */
    FETCH_CONCURRENCY: 8
};


/*
 * Each view is one physical table, rendered with its own
 * columns. The default is MAKER_WISE.
 */
const VIEWS = {

    maker_class: {
        id: "maker_class",
        schemaKey: "makerClass",
        entityKind: "maker",
        entity: "Maker",
        entityPlural: "Makers",
        columnKind: "class",
        title: "Maker × Vehicle Class",
        searchPlaceholder: "Search maker..."
    },

    maker_month: {
        id: "maker_month",
        schemaKey: "makerMonth",
        entityKind: "maker",
        entity: "Maker",
        entityPlural: "Makers",
        columnKind: "month",
        title: "Maker × Month",
        searchPlaceholder: "Search maker..."
    },

    state_class: {
        id: "state_class",
        schemaKey: "stateClass",
        entityKind: "state",
        entity: "State",
        entityPlural: "States",
        columnKind: "class",
        title: "State × Vehicle Class",
        searchPlaceholder: "Search state..."
    },

    state_month: {
        id: "state_month",
        schemaKey: "stateMonth",
        entityKind: "state",
        entity: "State",
        entityPlural: "States",
        columnKind: "month",
        title: "State × Month",
        searchPlaceholder: "Search state..."
    }
};


const DEFAULT_VIEW = "maker_class";


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
   4. SUPABASE CLIENT
   ============================================================ */

let supabaseClient = null;


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
   9. SUPABASE INITIALIZATION
   ============================================================ */

async function initializeSupabase() {

    if (
        typeof window.supabase === "undefined" ||
        typeof window.supabase.createClient !== "function"
    ) {

        throw new Error(
            "Supabase library failed to load. Check your network " +
            "connection or any content blocker, then retry."
        );
    }

    supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );

    return supabaseClient;
}


/* ============================================================
   10. FETCH HELPERS
   ============================================================ */

function buildSelect(columns) {

    return Array.isArray(columns) && columns.length > 0
        ? columns.map(quoteColumn).join(",")
        : "*";
}


async function fetchPage(table, select, from, to, options = {}) {

    const { filters = [], signal = null } = options;

    let query = supabaseClient.from(table).select(select).range(from, to);

    filters.forEach(filter => {
        query = query.in(filter.column, filter.values);
    });

    if (signal) {
        query = query.abortSignal(signal);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`${table}: ${error.message}`);
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


/*
 * Concurrent paging for the 94k-row RTO table, where 95
 * sequential round trips would be painfully slow.
 */
async function fetchAllRowsConcurrent(table, columns, totalRows, options = {}) {

    const select = buildSelect(columns);

    const pageCount = Math.min(
        Math.ceil(totalRows / CONFIG.FETCH_PAGE_SIZE),
        CONFIG.MAX_FETCH_PAGES
    );

    const rows = [];

    for (
        let start = 0;
        start < pageCount;
        start += CONFIG.FETCH_CONCURRENCY
    ) {

        const batch = [];

        for (
            let page = start;
            page < Math.min(start + CONFIG.FETCH_CONCURRENCY, pageCount);
            page += 1
        ) {

            const from = page * CONFIG.FETCH_PAGE_SIZE;

            batch.push(
                fetchPage(
                    table,
                    select,
                    from,
                    from + CONFIG.FETCH_PAGE_SIZE - 1,
                    options
                )
            );
        }

        const results = await Promise.all(batch);

        results.forEach(data => rows.push(...data));
    }

    return rows;
}


async function fetchSampleRow(table) {

    const { data, error } = await supabaseClient
        .from(table)
        .select("*")
        .limit(1);

    if (error) {
        throw new Error(`${table}: ${error.message}`);
    }

    return Array.isArray(data) && data.length > 0 ? data[0] : null;
}


async function fetchRowCount(table) {

    const { count, error } = await supabaseClient
        .from(table)
        .select("*", { count: "exact", head: true });

    if (error) {
        throw new Error(`${table}: ${error.message}`);
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


async function discoverSchema() {

    const [makerMonth, makerClass, stateMonth, stateClass] =
        await Promise.all([
            describeWideTable(TABLES.MAKER_MONTH, "maker"),
            describeWideTable(TABLES.MAKER_CLASS, "maker"),
            describeWideTable(TABLES.STATE_MONTH, "state"),
            describeWideTable(TABLES.STATE_CLASS, "state")
        ]);

    if (!makerMonth) {
        throw new Error(
            `${TABLES.MAKER_MONTH} is unavailable, so maker totals ` +
            "cannot be loaded."
        );
    }

    state.schema.makerMonth = makerMonth;
    state.schema.makerClass = makerClass;
    state.schema.stateMonth = stateMonth;
    state.schema.stateClass = stateClass;

    /*
     * The RTO table is long, not wide, so it is described by
     * hand rather than by column sniffing.
     */
    try {

        const sample = await fetchSampleRow(TABLES.MAKER_RTO);

        if (sample) {

            state.schema.makerRto = {
                table: TABLES.MAKER_RTO,
                makerColumn: findColumn(sample, ["maker", "Maker", "MAKER"]),
                regionColumn: findColumn(sample, ["rto", "RTO", "rto_name"]),
                valueColumn: findColumn(sample, [
                    "registrations", "Registrations", "REGISTRATIONS", "count"
                ]),
                yearColumn: findColumn(sample, ["year", "Year", "YEAR"])
            };
        }

    } catch (error) {

        console.info(
            `Region dimension unavailable (${TABLES.MAKER_RTO}):`,
            error.message
        );

        state.schema.makerRto = null;
    }

    state.availableYears = [CONFIG.DATA_YEAR];
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

    return state.classSource === TABLES.MAKER_CLASS;
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


/*
 * The RTO list is a full sweep of a 94k-row table, so it runs
 * after first paint and the control reports its own progress.
 */
async function loadRegionsInBackground() {

    const schema = state.schema.makerRto;

    if (!schema || state.regionsLoaded || state.regionsLoading) {
        return;
    }

    state.regionsLoading = true;

    if (dom.regionFilter) {
        dom.regionFilter.disabled = true;
        populateSelect(dom.regionFilter, [], "Loading regions...");
    }

    updateFilterNotice();

    try {

        const total = await fetchRowCount(schema.table);

        const rows = await fetchAllRowsConcurrent(
            schema.table,
            [schema.regionColumn],
            total
        );

        const slugs = uniqueSorted(rows.map(row => row[schema.regionColumn]));

        state.regions = slugs.map(slug => ({
            value: slug,
            label: prettifyRegion(slug)
        }));

        state.regionsLoaded = true;

        populateSelect(dom.regionFilter, state.regions, "All Regions");

    } catch (error) {

        console.warn("Region list failed to load:", error);

        state.regions = [];
        populateSelect(dom.regionFilter, [], "Regions unavailable");

    } finally {

        state.regionsLoading = false;

        if (dom.regionFilter) {
            dom.regionFilter.disabled = false;
        }

        applyViewVisibility();
        updateFilterNotice();
    }
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

    populateSelect(dom.fromYearFilter, state.availableYears, "All");
    populateSelect(dom.toYearFilter, state.availableYears, "All");

    updateYearRangeHeader();
}


function getYearRange() {

    const years = state.availableYears;

    if (years.length === 0) {
        return { from: null, to: null };
    }

    const { fromYear, toYear } = state.filters;

    return {
        from: isAll(fromYear) ? years[0] : fromYear,
        to: isAll(toYear) ? years[years.length - 1] : toYear
    };
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

    state.filters = {

        fromYear: normalizeFilter(dom.fromYearFilter?.value),
        toYear: normalizeFilter(dom.toYearFilter?.value),

        makers: isStateView() ? [] : getSelectedMakersFromUI(),

        state: isStateView()
            ? normalizeFilter(dom.stateFilter?.value)
            : CONFIG.ALL,

        region: isStateView()
            ? CONFIG.ALL
            : normalizeFilter(dom.regionFilter?.value),

        month: normalizeFilter(dom.monthFilter?.value),

        category: normalizeFilter(dom.categoryFilter?.value),

        subcategory: normalizeFilter(dom.subcategoryFilter?.value)
    };

    return state.filters;
}


function validateYearFilters() {

    const { fromYear, toYear } = state.filters;

    if (
        !isAll(fromYear) &&
        !isAll(toYear) &&
        Number(fromYear) > Number(toYear)
    ) {

        return {
            valid: false,
            message: "From Year cannot be later than To Year."
        };
    }

    return { valid: true, message: "" };
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

function applyViewVisibility() {

    const isState = isStateView();

    setGroupVisible(dom.stateFilterGroup, isState);

    setGroupVisible(
        dom.regionFilterGroup,
        !isState && Boolean(state.schema.makerRto)
    );

    const makerGroup = dom.makerFilter?.closest(".filter-group");

    if (makerGroup) {
        makerGroup.hidden = isState;
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

    if (state.regionsLoading) {
        messages.push("Loading the RTO list in the background...");
    }

    if (!isStateView() && !state.schema.makerRto) {
        messages.push(
            "Region / RTO filtering is unavailable in this project."
        );
    }

    if (isStateView()) {
        messages.push(
            "State tables carry no maker or RTO detail — no table " +
            "crosses state with either."
        );
    }

    if (regionIsActive()) {
        messages.push(
            "Showing RTO data, so the month and class columns are " +
            "unavailable — no table combines them."
        );
    }

    if (state.view === "maker_class") {
        messages.push(
            "MAKER_WISE covers electric vehicles only. Switch to " +
            "Maker × Month for national totals."
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
        classSchema.table !== TABLES.MAKER_CLASS;

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


function renderTableFoot(rows, columnTotals) {

    if (!dom.makerSummaryTableFoot) {
        return;
    }

    dom.makerSummaryTableFoot.innerHTML = "";

    const totals =
        columnTotals || calculateColumnTotals(rows, state.columns);

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
             * The column total is its own denominator, so the
             * foot reads 100% and names what the shares above
             * are measured against.
             */
            fillNumericCell(cell, totals[column.key], totals[column.key]);
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
     * Computed once and shared: the foot prints these and every
     * body cell divides by them for its share.
     */
    const columnTotals = calculateColumnTotals(rows, state.columns);

    dom.makerSummaryTableBody.innerHTML = "";

    renderTableHead();
    renderTableFoot(rows, columnTotals);

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
                    columnTotals[column.key]
                );

            } else {

                fillNumericCell(
                    td,
                    row.values[column.key],
                    columnTotals[column.key]
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

    addFilter("Breakdown", currentView().entity);

    if (
        !isAll(state.filters.fromYear) ||
        !isAll(state.filters.toYear)
    ) {
        const { from, to } = getYearRange();
        addFilter("Years", from === to ? from : `${from} – ${to}`);
    }

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
    if (count <= 1) {

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

    const { from, to } = getYearRange();

    element.textContent = !from || !to
        ? "—"
        : from === to
            ? String(from)
            : `${from}–${to}`;
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

    let text =
        `Source: ${source} · calendar year ${CONFIG.DATA_YEAR} · ` +
        `${formatIndianNumber(state.dimensionTotal)} registrations ` +
        `across ${formatIndianNumber(state.rows.length)} ` +
        `${view.entityPlural.toLowerCase()} and ` +
        `${formatIndianNumber(valueColumnCount)} columns.`;

    if (source === TABLES.MAKER_CLASS) {
        text += " Electric vehicles only.";
    }

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


function displayError(message) {

    console.error(message);

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

    readFiltersFromUI();

    /*
     * Switching breakdown re-points the class taxonomy at a
     * different table, so the class filters must be rebuilt.
     */
    if (state.view !== previousView) {

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

    const yearValidation = validateYearFilters();

    if (!yearValidation.valid) {
        displayYearError(yearValidation.message);
        hideLoading();
        return false;
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

        displayError(error.message || "Unable to load dashboard data.");

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

    [
        dom.fromYearFilter,
        dom.toYearFilter,
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
        dom.fromYearFilter,
        dom.toYearFilter,
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

        await initializeSupabase();
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

        /*
         * Deliberately not awaited - the dashboard is usable
         * while the RTO list streams in behind it.
         */
        loadRegionsInBackground();

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

        displayError(error.message || "Dashboard initialization failed.");

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
    loadRegionsInBackground,
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
