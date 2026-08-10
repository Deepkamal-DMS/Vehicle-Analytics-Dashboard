/* ============================================================
   VEHICLE REGISTRATION ANALYTICS DASHBOARD
   File: /js/script.js

   Vanilla JavaScript
   Supabase JavaScript client
   ES6+
   async/await
   try/catch/finally

   No frontend framework.
   No fake data.
   ============================================================ */


/* ============================================================
   1. CONFIGURATION
   ============================================================ */

/*
 * IMPORTANT:
 *
 * Replace these with your actual Supabase project values.
 *
 * Use ONLY:
 * - Supabase project URL
 * - public anon/publishable key
 *
 * NEVER put a service-role key in this file.
 */

const SUPABASE_URL = 'https://yifnagndjbeqszexzaem.supabase.co';

const SUPABASE_ANON_KEY = 'sb_publishable_HOBG1-ykEePfvvoJdm4X9w_3DU0itBG';


/*
 * Central analytical data source.
 *
 * RPC mode is the recommended architecture.
 *
 * These function names are placeholders until the
 * PostgreSQL RPC layer has been created.
 */

const DATA_SOURCE = {

    mode: 'rpc',

    summaryRpc:
        'get_vehicle_registration_summary',

    filterOptionsRpc:
        'get_vehicle_registration_filter_options',

    kpiRpc:
        'get_vehicle_registration_kpis',

    /*
     * Optional future VIEW mode.
     */

    viewName:
        'vehicle_registration_fact',

    viewColumns: {

        year:
            'year',

        region:
            'rto',

        maker:
            'maker',

        category:
            'category',

        subcategory:
            'subcategory',

        registrations:
            'registrations'
    }

};


/*
 * RPC parameter names.
 *
 * If your actual PostgreSQL function uses different
 * parameter names, change them here only.
 */

const RPC_PARAMS = {

    year:
        'p_year',

    fromYear:
        'p_from_year',

    toYear:
        'p_to_year',

    maker:
        'p_maker',

    region:
        'p_rto',

    category:
        'p_category',

    subcategory:
        'p_subcategory',

    ignoreDimension:
        'p_ignore_dimension'

};


/*
 * Application configuration.
 */

const APP_CONFIG = {

    allValue:
        'all',

    defaultPageSize:
        25,

    pageSizes: [
        25,
        50,
        100
    ],

    searchDebounceMs:
        150
};


/* ============================================================
   2. SUPABASE CLIENT
   ============================================================ */

let supabaseClient = null;


/* ============================================================
   3. CENTRAL FILTER STATE
   ============================================================ */

const filterState = {

    year:
        APP_CONFIG.allValue,

    fromYear:
        APP_CONFIG.allValue,

    toYear:
        APP_CONFIG.allValue,

    maker:
        APP_CONFIG.allValue,

    region:
        APP_CONFIG.allValue,

    category:
        APP_CONFIG.allValue,

    subcategory:
        APP_CONFIG.allValue

};


/* ============================================================
   4. APPLICATION STATE
   ============================================================ */

const applicationState = {

    initialized:
        false,

    initializing:
        false,

    /*
     * Available database years.
     */

    availableYears:
        [],

    /*
     * Current cascading filter options.
     */

    filterOptions: {

        makers:
            [],

        regions:
            [],

        categories:
            [],

        subcategories:
            []
    },

    /*
     * Current maker summary.
     */

    makerRows:
        [],

    /*
     * Current KPI values.
     */

    kpis: {

        totalRegistrations:
            0,

        totalMakers:
            0,

        twoWRegistrations:
            null,

        threeWRegistrations:
            null,

        twoWPercentage:
            null,

        threeWPercentage:
            null
    },

    /*
     * Client-side table state.
     */

    searchTerm:
        '',

    sortKey:
        'registrations',

    sortDirection:
        'desc',

    currentPage:
        1,

    pageSize:
        APP_CONFIG.defaultPageSize,

    /*
     * Request generation.
     *
     * Only the newest request may update the UI.
     */

    requestId:
        0,

    /*
     * Search debounce timer.
     */

    searchTimer:
        null,

    /*
     * Prevent filter-option refresh loops.
     */

    updatingFilterOptions:
        false

};


/* ============================================================
   5. DOM REFERENCES
   ============================================================ */

const dom = {};


/*
 * Cache DOM elements once.
 */

function cacheDOMElements() {

    const ids = [

        /* Filters */

        'yearFilter',
        'fromYearFilter',
        'toYearFilter',
        'makerFilter',
        'regionFilter',
        'categoryFilter',
        'subcategoryFilter',
        'clearFiltersButton',

        /* Table */

        'makerSummaryTable',
        'makerSummaryTableBody',
        'makerSummaryTotal',
        'makerSummaryMarketShare',
        'makerSearch',

        /* Pagination */

        'previousPageButton',
        'nextPageButton',
        'pageIndicator',
        'pageSizeSelect',

        /* KPIs */

        'totalRegistrations',
        'totalMakers',
        'twoWRegistrations',
        'threeWRegistrations',
        'twoWPercentage',
        'threeWPercentage',

        /* Header */

        'data-year-range',
        'activeFilters',

        /* Loading / state */

        'globalLoading',
        'tableLoading',
        'tableEmpty',
        'tableError',
        'tableContent'
    ];


    ids.forEach(id => {

        const key =
            id.replace(
                /-([a-z])/g,
                (_, letter) =>
                    letter.toUpperCase()
            );


        dom[key] =
            document.getElementById(id);

    });

}


/*
 * Verify important DOM elements.
 */

function validateRequiredDOM() {

    const requiredIds = [

        'yearFilter',
        'fromYearFilter',
        'toYearFilter',
        'makerFilter',
        'regionFilter',
        'categoryFilter',
        'subcategoryFilter',
        'clearFiltersButton',

        'makerSummaryTable',
        'makerSummaryTableBody',

        'makerSearch',

        'previousPageButton',
        'nextPageButton',
        'pageIndicator',
        'pageSizeSelect',

        'totalRegistrations',
        'totalMakers',
        'twoWRegistrations',
        'threeWRegistrations',

        'twoWPercentage',
        'threeWPercentage',

        'data-year-range',
        'activeFilters',

        'globalLoading',
        'tableLoading',
        'tableEmpty',
        'tableError',
        'tableContent'
    ];


    const missing =
        requiredIds.filter(
            id =>
                !document.getElementById(id)
        );


    if (missing.length > 0) {

        console.warn(
            'Dashboard DOM elements missing:',
            missing
        );

    }

}


/* ============================================================
   6. SUPABASE INITIALIZATION
   ============================================================ */


/*
 * Initialize the browser Supabase client.
 */

function initializeSupabase() {

    if (
        !window.supabase ||
        typeof window.supabase.createClient !==
            'function'
    ) {

        throw new Error(
            'Supabase JavaScript client is not loaded.'
        );

    }


    if (
        !SUPABASE_URL ||
        SUPABASE_URL ===
            'YOUR_SUPABASE_URL'
    ) {

        throw new Error(
            'SUPABASE_URL has not been configured.'
        );

    }


    if (
        !SUPABASE_ANON_KEY ||
        SUPABASE_ANON_KEY ===
            'YOUR_SUPABASE_ANON_KEY'
    ) {

        throw new Error(
            'SUPABASE_ANON_KEY has not been configured.'
        );

    }


    supabaseClient =
        window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY
        );

}


/* ============================================================
   7. INITIALIZATION
   ============================================================ */

async function initializeDashboard() {

    if (
        applicationState.initialized ||
        applicationState.initializing
    ) {

        return;

    }


    applicationState.initializing =
        true;


    cacheDOMElements();

    validateRequiredDOM();

    initializePageSize();

    attachEventListeners();

    showLoading();


    try {

        initializeSupabase();


        /*
         * Years are global metadata.
         */

        await loadAvailableYears();


        /*
         * Initial filter options.
         */

        await loadFilterOptions(
            createAllFilters()
        );


        /*
         * Initial dashboard.
         */

        await applyFilters({
            skipOptionRefresh: true
        });


        applicationState.initialized =
            true;


    } catch (error) {

        console.error(
            'Dashboard initialization failed:',
            error
        );


        displayError(
            'Unable to load data. Please try again.'
        );


    } finally {

        applicationState.initializing =
            false;

        hideLoading();

    }

}


/* ============================================================
   8. FILTER STATE
   ============================================================ */


/*
 * Read current UI values.
 */

function getSelectedFilters() {

    return {

        year:
            normalizeFilterValue(
                dom.yearFilter?.value
            ),

        fromYear:
            normalizeFilterValue(
                dom.fromYearFilter?.value
            ),

        toYear:
            normalizeFilterValue(
                dom.toYearFilter?.value
            ),

        maker:
            normalizeFilterValue(
                dom.makerFilter?.value
            ),

        region:
            normalizeFilterValue(
                dom.regionFilter?.value
            ),

        category:
            normalizeFilterValue(
                dom.categoryFilter?.value
            ),

        subcategory:
            normalizeFilterValue(
                dom.subcategoryFilter?.value
            )

    };

}


/*
 * Create a clean all-filter object.
 */

function createAllFilters() {

    return {

        year:
            APP_CONFIG.allValue,

        fromYear:
            APP_CONFIG.allValue,

        toYear:
            APP_CONFIG.allValue,

        maker:
            APP_CONFIG.allValue,

        region:
            APP_CONFIG.allValue,

        category:
            APP_CONFIG.allValue,

        subcategory:
            APP_CONFIG.allValue

    };

}


/*
 * Keep "all" semantics consistent.
 */

function normalizeFilterValue(value) {

    const normalized =
        String(
            value ?? APP_CONFIG.allValue
        ).trim();


    if (
        normalized === '' ||
        normalized.toLowerCase() === 'all'
    ) {

        return APP_CONFIG.allValue;

    }


    return normalized;

}


/*
 * Update centralized state.
 */

function updateFilterState(filters) {

    Object.assign(
        filterState,
        filters
    );

}


/* ============================================================
   9. YEAR VALIDATION
   ============================================================ */


/*
 * Validate selected year/range.
 */

function validateFilters(filters) {

    const fromYear =
        filters.fromYear !== APP_CONFIG.allValue
            ? Number(filters.fromYear)
            : null;


    const toYear =
        filters.toYear !== APP_CONFIG.allValue
            ? Number(filters.toYear)
            : null;


    const selectedYear =
        filters.year !== APP_CONFIG.allValue
            ? Number(filters.year)
            : null;


    if (
        selectedYear !== null &&
        !Number.isFinite(selectedYear)
    ) {

        return {
            valid: false,
            message: 'Please select a valid year.'
        };

    }


    if (
        fromYear !== null &&
        !Number.isFinite(fromYear)
    ) {

        return {
            valid: false,
            message: 'Please select a valid From Year.'
        };

    }


    if (
        toYear !== null &&
        !Number.isFinite(toYear)
    ) {

        return {
            valid: false,
            message: 'Please select a valid To Year.'
        };

    }


    if (
        fromYear !== null &&
        toYear !== null &&
        fromYear > toYear
    ) {

        return {
            valid: false,
            message:
                'From Year cannot be greater than To Year.'
        };

    }


    return {
        valid: true,
        message: ''
    };

}


/*
 * Keep single year and range logically consistent.
 *
 * Range takes precedence.
 */

function normalizeYearUIState() {

    if (
        !dom.yearFilter ||
        !dom.fromYearFilter ||
        !dom.toYearFilter
    ) {

        return;

    }


    const from =
        normalizeFilterValue(
            dom.fromYearFilter.value
        );


    const to =
        normalizeFilterValue(
            dom.toYearFilter.value
        );


    if (
        from !== APP_CONFIG.allValue ||
        to !== APP_CONFIG.allValue
    ) {

        dom.yearFilter.value =
            APP_CONFIG.allValue;

    }

}


/* ============================================================
   10. DATA ACCESS - GENERIC FILTER PAYLOAD
   ============================================================ */


/*
 * Build only selected RPC parameters.
 *
 * "all" is never sent as a restriction.
 */

function buildRpcFilterPayload(filters) {

    const payload = {};


    if (
        filters.year !==
        APP_CONFIG.allValue
    ) {

        payload[
            RPC_PARAMS.year
        ] = Number(filters.year);

    }


    if (
        filters.fromYear !==
        APP_CONFIG.allValue
    ) {

        payload[
            RPC_PARAMS.fromYear
        ] = Number(filters.fromYear);

    }


    if (
        filters.toYear !==
        APP_CONFIG.allValue
    ) {

        payload[
            RPC_PARAMS.toYear
        ] = Number(filters.toYear);

    }


    if (
        filters.maker !==
        APP_CONFIG.allValue
    ) {

        payload[
            RPC_PARAMS.maker
        ] = filters.maker;

    }


    if (
        filters.region !==
        APP_CONFIG.allValue
    ) {

        payload[
            RPC_PARAMS.region
        ] = filters.region;

    }


    if (
        filters.category !==
        APP_CONFIG.allValue
    ) {

        payload[
            RPC_PARAMS.category
        ] = filters.category;

    }


    if (
        filters.subcategory !==
        APP_CONFIG.allValue
    ) {

        payload[
            RPC_PARAMS.subcategory
        ] = filters.subcategory;

    }


    return payload;

}


/* ============================================================
   11. DASHBOARD DATA ACCESS
   ============================================================ */


/*
 * Fetch maker summary data.
 */

async function fetchDashboardData(filters) {

    if (!supabaseClient) {

        throw new Error(
            'Supabase client has not been initialized.'
        );

    }


    if (
        DATA_SOURCE.mode === 'rpc'
    ) {

        const payload =
            buildRpcFilterPayload(
                filters
            );


        const {
            data,
            error
        } =
            await supabaseClient.rpc(
                DATA_SOURCE.summaryRpc,
                payload
            );


        if (error) {

            throw error;

        }


        return Array.isArray(data)
            ? data
            : [];

    }


    if (
        DATA_SOURCE.mode === 'view'
    ) {

        let query =
            supabaseClient
                .from(
                    DATA_SOURCE.viewName
                )
                .select(
                    [
                        DATA_SOURCE.viewColumns.year,
                        DATA_SOURCE.viewColumns.region,
                        DATA_SOURCE.viewColumns.maker,
                        DATA_SOURCE.viewColumns.category,
                        DATA_SOURCE.viewColumns.subcategory,
                        DATA_SOURCE.viewColumns.registrations
                    ].join(',')
                );


        if (
            filters.year !==
            APP_CONFIG.allValue
        ) {

            query =
                query.eq(
                    DATA_SOURCE.viewColumns.year,
                    Number(filters.year)
                );

        }


        if (
            filters.fromYear !==
            APP_CONFIG.allValue
        ) {

            query =
                query.gte(
                    DATA_SOURCE.viewColumns.year,
                    Number(filters.fromYear)
                );

        }


        if (
            filters.toYear !==
            APP_CONFIG.allValue
        ) {

            query =
                query.lte(
                    DATA_SOURCE.viewColumns.year,
                    Number(filters.toYear)
                );

        }


        if (
            filters.maker !==
            APP_CONFIG.allValue
        ) {

            query =
                query.eq(
                    DATA_SOURCE.viewColumns.maker,
                    filters.maker
                );

        }


        if (
            filters.region !==
            APP_CONFIG.allValue
        ) {

            query =
                query.eq(
                    DATA_SOURCE.viewColumns.region,
                    filters.region
                );

        }


        if (
            filters.category !==
            APP_CONFIG.allValue
        ) {

            query =
                query.eq(
                    DATA_SOURCE.viewColumns.category,
                    filters.category
                );

        }


        if (
            filters.subcategory !==
            APP_CONFIG.allValue
        ) {

            query =
                query.eq(
                    DATA_SOURCE.viewColumns.subcategory,
                    filters.subcategory
                );

        }


        const {
            data,
            error
        } =
            await query;


        if (error) {

            throw error;

        }


        return Array.isArray(data)
            ? aggregateViewRows(
                data
            )
            : [];

    }


    throw new Error(
        `Unsupported DATA_SOURCE.mode: ${DATA_SOURCE.mode}`
    );

}


/*
 * Fetch KPI data.
 */

async function fetchKPIData(filters) {

    if (!supabaseClient) {

        throw new Error(
            'Supabase client has not been initialized.'
        );

    }


    if (
        DATA_SOURCE.mode !== 'rpc'
    ) {

        return null;

    }


    const payload =
        buildRpcFilterPayload(
            filters
        );


    try {

        const {
            data,
            error
        } =
            await supabaseClient.rpc(
                DATA_SOURCE.kpiRpc,
                payload
            );


        if (error) {

            /*
             * KPI RPC is optional from the frontend
             * perspective.
             *
             * Do not fabricate 2W/3W values.
             */

            console.warn(
                'KPI RPC unavailable:',
                error
            );

            return null;

        }


        return normalizeKpiResponse(
            data
        );

    } catch (error) {

        console.warn(
            'KPI request failed:',
            error
        );

        return null;

    }

}


/* ============================================================
   12. FILTER OPTIONS
   ============================================================ */


/*
 * Fetch available years.
 */

async function loadAvailableYears() {

    try {

        let years = [];


        if (
            DATA_SOURCE.mode === 'rpc'
        ) {

            /*
             * Expected filter-option RPC response can contain
             * a years field.
             */

            const response =
                await fetchFilterOptionsRpc(
                    createAllFilters(),
                    'year'
                );


            years =
                extractOptionArray(
                    response,
                    [
                        'years',
                        'year',
                        'available_years',
                        'availableYears'
                    ]
                );

        } else {

            const {
                data,
                error
            } =
                await supabaseClient
                    .from(
                        DATA_SOURCE.viewName
                    )
                    .select(
                        DATA_SOURCE.viewColumns.year
                    );


            if (error) {

                throw error;

            }


            years =
                Array.isArray(data)
                    ? data.map(
                        row =>
                            row[
                                DATA_SOURCE
                                    .viewColumns
                                    .year
                            ]
                    )
                    : [];

        }


        applicationState.availableYears =
            normalizeYearValues(
                years
            );


        populateSelect(
            dom.yearFilter,
            applicationState.availableYears,
            'All'
        );


        populateSelect(
            dom.fromYearFilter,
            applicationState.availableYears,
            'All'
        );


        populateSelect(
            dom.toYearFilter,
            applicationState.availableYears,
            'All'
        );


        updateDataYearRange();


    } catch (error) {

        console.error(
            'Failed to load available years:',
            error
        );

        throw error;

    }

}


/*
 * Load all cascading filter options.
 */

async function loadFilterOptions(
    filters
) {

    try {

        applicationState.updatingFilterOptions =
            true;


        const options =
            await fetchFilterOptions(
                filters
            );


        applicationState.filterOptions =
            options;


        const selected =
            getSelectedFilters();


        populateSelect(
            dom.makerFilter,
            options.makers,
            'All',
            selected.maker
        );


        populateSelect(
            dom.regionFilter,
            options.regions,
            'All',
            selected.region
        );


        populateSelect(
            dom.categoryFilter,
            options.categories,
            'All',
            selected.category
        );


        populateSelect(
            dom.subcategoryFilter,
            options.subcategories,
            'All',
            selected.subcategory
        );


    } finally {

        applicationState.updatingFilterOptions =
            false;

    }

}


/*
 * Public-style filter option functions.
 */

async function loadAvailableMakers(filters = getSelectedFilters()) {

    const options =
        await fetchFilterOptions(
            filters,
            'maker'
        );

    applicationState.filterOptions.makers =
        options.makers;

    populateSelect(
        dom.makerFilter,
        options.makers,
        'All',
        filters.maker
    );

}


async function loadAvailableRegions(filters = getSelectedFilters()) {

    const options =
        await fetchFilterOptions(
            filters,
            'region'
        );

    applicationState.filterOptions.regions =
        options.regions;

    populateSelect(
        dom.regionFilter,
        options.regions,
        'All',
        filters.region
    );

}


async function loadAvailableCategories(filters = getSelectedFilters()) {

    const options =
        await fetchFilterOptions(
            filters,
            'category'
        );

    applicationState.filterOptions.categories =
        options.categories;

    populateSelect(
        dom.categoryFilter,
        options.categories,
        'All',
        filters.category
    );

}


async function loadAvailableSubcategories(filters = getSelectedFilters()) {

    const options =
        await fetchFilterOptions(
            filters,
            'subcategory'
        );

    applicationState.filterOptions.subcategories =
        options.subcategories;

    populateSelect(
        dom.subcategoryFilter,
        options.subcategories,
        'All',
        filters.subcategory
    );

}


/*
 * Central filter-options access.
 */

async function fetchFilterOptions(
    filters,
    ignoreDimension = 'all'
) {

    if (
        DATA_SOURCE.mode !== 'rpc'
    ) {

        return fetchFilterOptionsFromView(
            filters
        );

    }


    const response =
        await fetchFilterOptionsRpc(
            filters,
            ignoreDimension
        );


    return normalizeFilterOptionsResponse(
        response
    );

}


/*
 * RPC filter-options request.
 */

async function fetchFilterOptionsRpc(
    filters,
    ignoreDimension = 'all'
) {

    if (!supabaseClient) {

        throw new Error(
            'Supabase client has not been initialized.'
        );

    }


    const payload =
        buildRpcFilterPayload(
            filters
        );


    /*
     * The PostgreSQL RPC can use this parameter to avoid
     * filtering the dimension whose values it is returning.
     *
     * If your SQL function uses a different contract,
     * change RPC_PARAMS.ignoreDimension.
     */

    payload[
        RPC_PARAMS.ignoreDimension
    ] =
        ignoreDimension;


    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            DATA_SOURCE.filterOptionsRpc,
            payload
        );


    if (error) {

        throw error;

    }


    return data;

}


/*
 * VIEW-mode filter metadata.
 */

async function fetchFilterOptionsFromView(
    filters
) {

    const columns =
        DATA_SOURCE.viewColumns;


    let query =
        supabaseClient
            .from(
                DATA_SOURCE.viewName
            )
            .select(
                [
                    columns.year,
                    columns.region,
                    columns.maker,
                    columns.category,
                    columns.subcategory
                ].join(',')
            );


    if (
        filters.year !==
        APP_CONFIG.allValue
    ) {

        query =
            query.eq(
                columns.year,
                Number(filters.year)
            );

    }


    if (
        filters.fromYear !==
        APP_CONFIG.allValue
    ) {

        query =
            query.gte(
                columns.year,
                Number(filters.fromYear)
            );

    }


    if (
        filters.toYear !==
        APP_CONFIG.allValue
    ) {

        query =
            query.lte(
                columns.year,
                Number(filters.toYear)
            );

    }


    if (
        filters.maker !==
        APP_CONFIG.allValue
    ) {

        query =
            query.eq(
                columns.maker,
                filters.maker
            );

    }


    if (
        filters.region !==
        APP_CONFIG.allValue
    ) {

        query =
            query.eq(
                columns.region,
                filters.region
            );

    }


    if (
        filters.category !==
        APP_CONFIG.allValue
    ) {

        query =
            query.eq(
                columns.category,
                filters.category
            );

    }


    if (
        filters.subcategory !==
        APP_CONFIG.allValue
    ) {

        query =
            query.eq(
                columns.subcategory,
                filters.subcategory
            );

    }


    const {
        data,
        error
    } =
        await query;


    if (error) {

        throw error;

    }


    const rows =
        Array.isArray(data)
            ? data
            : [];


    return {

        years:
            uniqueSortedValues(
                rows.map(
                    row =>
                        row[
                            columns.year
                        ]
                )
            ),

        makers:
            uniqueSortedValues(
                rows.map(
                    row =>
                        row[
                            columns.maker
                        ]
                )
            ),

        regions:
            uniqueSortedValues(
                rows.map(
                    row =>
                        row[
                            columns.region
                        ]
                )
            ),

        categories:
            uniqueSortedValues(
                rows.map(
                    row =>
                        row[
                            columns.category
                        ]
                )
            ),

        subcategories:
            uniqueSortedValues(
                rows.map(
                    row =>
                        row[
                            columns.subcategory
                        ]
                )
            )

    };

}


/* ============================================================
   13. APPLY FILTERS
   ============================================================ */


/*
 * Main filter application function.
 */

async function applyFilters(
    options = {}
) {

    const requestId =
        ++applicationState.requestId;


    const filters =
        getSelectedFilters();


    normalizeYearUIState();


    const normalizedFilters =
        getSelectedFilters();


    const validation =
        validateFilters(
            normalizedFilters
        );


    if (!validation.valid) {

        displayError(
            validation.message
        );

        return;

    }


    updateFilterState(
        normalizedFilters
    );


    applicationState.currentPage =
        1;


    clearError();

    updateActiveFilters();


    showTableLoading();


    try {

        /*
         * Refresh cascading options first.
         */

        if (
            !options.skipOptionRefresh
        ) {

            await loadFilterOptions(
                normalizedFilters
            );

        }


        /*
         * Run summary and KPI requests in parallel.
         */

        const [
            dashboardRows,
            kpiData
        ] =
            await Promise.all([
                fetchDashboardData(
                    normalizedFilters
                ),

                fetchKPIData(
                    normalizedFilters
                )
            ]);


        /*
         * Ignore stale response.
         */

        if (
            requestId !==
            applicationState.requestId
        ) {

            return;

        }


        const normalizedRows =
            normalizeMakerRows(
                dashboardRows
            );


        applicationState.makerRows =
            normalizedRows;


        applicationState.kpis =
            buildKpis(
                normalizedRows,
                kpiData
            );


        updateKPIs();

        updateMakerTable();

        updateActiveFilters();

        updateDataYearRange();


    } catch (error) {

        if (
            requestId !==
            applicationState.requestId
        ) {

            return;

        }


        console.error(
            'Dashboard data request failed:',
            error
        );


        applicationState.makerRows =
            [];


        applicationState.kpis =
            buildKpis(
                [],
                null
            );


        updateKPIs();

        updateMakerTable();

        displayError(
            'Unable to load data. Please try again.'
        );


    } finally {

        if (
            requestId ===
            applicationState.requestId
        ) {

            hideTableLoading();

        }

    }

}


/* ============================================================
   14. RESET FILTERS
   ============================================================ */

async function resetFilters() {

    const requestId =
        ++applicationState.requestId;


    setSelectValue(
        dom.yearFilter,
        APP_CONFIG.allValue
    );

    setSelectValue(
        dom.fromYearFilter,
        APP_CONFIG.allValue
    );

    setSelectValue(
        dom.toYearFilter,
        APP_CONFIG.allValue
    );

    setSelectValue(
        dom.makerFilter,
        APP_CONFIG.allValue
    );

    setSelectValue(
        dom.regionFilter,
        APP_CONFIG.allValue
    );

    setSelectValue(
        dom.categoryFilter,
        APP_CONFIG.allValue
    );

    setSelectValue(
        dom.subcategoryFilter,
        APP_CONFIG.allValue
    );


    if (dom.makerSearch) {

        dom.makerSearch.value =
            '';

    }


    applicationState.searchTerm =
        '';

    applicationState.currentPage =
        1;


    updateFilterState(
        createAllFilters()
    );


    clearError();

    updateActiveFilters();

    showLoading();


    try {

        await loadFilterOptions(
            createAllFilters()
        );


        if (
            requestId !==
            applicationState.requestId
        ) {

            return;

        }


        const [
            dashboardRows,
            kpiData
        ] =
            await Promise.all([
                fetchDashboardData(
                    createAllFilters()
                ),

                fetchKPIData(
                    createAllFilters()
                )
            ]);


        if (
            requestId !==
            applicationState.requestId
        ) {

            return;

        }


        const normalizedRows =
            normalizeMakerRows(
                dashboardRows
            );


        applicationState.makerRows =
            normalizedRows;


        applicationState.kpis =
            buildKpis(
                normalizedRows,
                kpiData
            );


        updateKPIs();

        updateMakerTable();

        updateActiveFilters();


    } catch (error) {

        if (
            requestId !==
            applicationState.requestId
        ) {

            return;

        }


        console.error(
            'Reset failed:',
            error
        );


        displayError(
            'Unable to load data. Please try again.'
        );


    } finally {

        if (
            requestId ===
            applicationState.requestId
        ) {

            hideLoading();

        }

    }

}


/* ============================================================
   15. DATA NORMALIZATION
   ============================================================ */


/*
 * Normalize all maker rows.
 *
 * Multiple common database field names are supported.
 */

function normalizeMakerRows(rows) {

    if (!Array.isArray(rows)) {

        return [];

    }


    const makerMap =
        new Map();


    for (
        const row of rows
    ) {

        const normalized =
            normalizeMakerRow(row);


        if (!normalized) {

            continue;

        }


        const key =
            normalized.maker.toLowerCase();


        if (
            makerMap.has(key)
        ) {

            const existing =
                makerMap.get(key);


            existing.registrations +=
                normalized.registrations;

        } else {

            makerMap.set(
                key,
                {
                    maker:
                        normalized.maker,

                    registrations:
                        normalized.registrations
                }
            );

        }

    }


    const total =
        Array.from(
            makerMap.values()
        ).reduce(
            (
                sum,
                row
            ) =>
                sum +
                safeNumber(
                    row.registrations
                ),
            0
        );


    return Array.from(
        makerMap.values()
    ).map(
        row => ({

            maker:
                row.maker,

            registrations:
                safeNumber(
                    row.registrations
                ),

            marketShare:
                calculateMarketShare(
                    row.registrations,
                    total
                )

        })
    );

}


/*
 * Normalize one maker row.
 */

function normalizeMakerRow(row) {

    if (
        !row ||
        typeof row !== 'object'
    ) {

        return null;

    }


    const maker =
        firstExistingValue(
            row,
            [
                'maker',
                'MAKER',
                'maker_name',
                'makerName',
                'manufacturer',
                'manufacturer_name'
            ]
        );


    const registrations =
        firstExistingValue(
            row,
            [
                'registrations',
                'registration',
                'total_registrations',
                'totalRegistrations',
                'total',
                'TOTAL',
                'count',
                'vehicle_count'
            ]
        );


    if (
        maker === null ||
        maker === undefined ||
        String(maker).trim() === ''
    ) {

        return null;

    }


    return {

        maker:
            String(maker).trim(),

        registrations:
            safeNumber(
                registrations
            )

    };

}


/*
 * VIEW mode aggregation.
 */

function aggregateViewRows(
    rows
) {

    const map =
        new Map();


    const columns =
        DATA_SOURCE.viewColumns;


    for (
        const row of rows
    ) {

        const maker =
            normalizeString(
                row?.[
                    columns.maker
                ]
            );


        if (!maker) {

            continue;

        }


        const registrations =
            safeNumber(
                row?.[
                    columns.registrations
                ]
            );


        const key =
            maker.toLowerCase();


        map.set(
            key,
            {
                maker:
                    maker,

                registrations:
                    (
                        map.get(key)?.registrations ||
                        0
                    ) +
                    registrations
            }
        );

    }


    return Array.from(
        map.values()
    );

}


/* ============================================================
   16. KPI CALCULATIONS
   ============================================================ */


/*
 * Build KPI state.
 *
 * Total registrations and total makers can be calculated
 * from maker summary.
 *
 * 2W and 3W must come from the KPI analytical layer.
 * We intentionally do not fabricate them.
 */

function buildKpis(
    makerRows,
    kpiData
) {

    const totalRegistrations =
        makerRows.reduce(
            (
                sum,
                row
            ) =>
                sum +
                safeNumber(
                    row.registrations
                ),
            0
        );


    const totalMakers =
        makerRows.length;


    const twoW =
        extractKpiValue(
            kpiData,
            [
                'twoWRegistrations',
                'two_w_registrations',
                'registrations2W',
                'registrations_2w',
                'two_w'
            ]
        );


    const threeW =
        extractKpiValue(
            kpiData,
            [
                'threeWRegistrations',
                'three_w_registrations',
                'registrations3W',
                'registrations_3w',
                'three_w'
            ]
        );


    return {

        totalRegistrations,

        totalMakers,

        twoWRegistrations:
            twoW,

        threeWRegistrations:
            threeW,

        twoWPercentage:
            calculateNullablePercentage(
                twoW,
                totalRegistrations
            ),

        threeWPercentage:
            calculateNullablePercentage(
                threeW,
                totalRegistrations
            )

    };

}


/*
 * Market share.
 */

function calculateMarketShare(
    makerRegistrations,
    totalRegistrations
) {

    const makerTotal =
        safeNumber(
            makerRegistrations
        );


    const total =
        safeNumber(
            totalRegistrations
        );


    if (total <= 0) {

        return 0;

    }


    return (
        makerTotal /
        total *
        100
    );

}


/*
 * Percentage where source value can be null.
 */

function calculateNullablePercentage(
    value,
    total
) {

    if (
        value === null ||
        value === undefined
    ) {

        return null;

    }


    const numericValue =
        safeNumber(value);


    const numericTotal =
        safeNumber(total);


    if (
        numericTotal <= 0
    ) {

        return 0;

    }


    return (
        numericValue /
        numericTotal *
        100
    );

}


/*
 * Normalize KPI response.
 */

function normalizeKpiResponse(data) {

    if (!data) {

        return null;

    }


    if (Array.isArray(data)) {

        return data.length
            ? normalizeKpiResponse(
                data[0]
            )
            : null;

    }


    if (
        typeof data !== 'object'
    ) {

        return null;

    }


    return data;

}


/*
 * Extract KPI value.
 */

function extractKpiValue(
    data,
    keys
) {

    if (!data) {

        return null;

    }


    const value =
        firstExistingValue(
            data,
            keys
        );


    if (
        value === null ||
        value === undefined
    ) {

        return null;

    }


    return safeNumber(value);

}


/* ============================================================
   17. KPI RENDERING
   ============================================================ */

function updateKPIs() {

    const kpis =
        applicationState.kpis;


    setText(
        dom.totalRegistrations,
        formatIndianNumber(
            kpis.totalRegistrations
        )
    );


    setText(
        dom.totalMakers,
        formatIndianNumber(
            kpis.totalMakers
        )
    );


    setText(
        dom.twoWRegistrations,
        kpis.twoWRegistrations === null
            ? '—'
            : formatIndianNumber(
                kpis.twoWRegistrations
            )
    );


    setText(
        dom.threeWRegistrations,
        kpis.threeWRegistrations === null
            ? '—'
            : formatIndianNumber(
                kpis.threeWRegistrations
            )
    );


    setText(
        dom.twoWPercentage,
        kpis.twoWPercentage === null
            ? '—'
            : formatPercentage(
                kpis.twoWPercentage
            )
    );


    setText(
        dom.threeWPercentage,
        kpis.threeWPercentage === null
            ? '—'
            : formatPercentage(
                kpis.threeWPercentage
            )
    );

}


/* ============================================================
   18. MAKER TABLE
   ============================================================ */

function updateMakerTable() {

    const tbody =
        dom.makerSummaryTableBody;


    if (!tbody) {

        return;

    }


    const filteredRows =
        filterTableData(
            applicationState.makerRows
        );


    const sortedRows =
        sortTableData(
            filteredRows
        );


    const pagination =
        getPaginationState(
            sortedRows.length
        );


    tbody.replaceChildren();


    const pageRows =
        sortedRows.slice(
            pagination.startIndex,
            pagination.endIndex
        );


    if (
        pageRows.length === 0
    ) {

        showEmptyState();

    } else {

        hideEmptyState();


        const fragment =
            document.createDocumentFragment();


        for (
            const row of pageRows
        ) {

            const tr =
                document.createElement(
                    'tr'
                );


            const makerCell =
                document.createElement(
                    'td'
                );


            makerCell.textContent =
                row.maker;


            const registrationsCell =
                document.createElement(
                    'td'
                );


            registrationsCell.textContent =
                formatIndianNumber(
                    row.registrations
                );


            const shareCell =
                document.createElement(
                    'td'
                );


            shareCell.textContent =
                formatPercentage(
                    row.marketShare
                );


            tr.append(
                makerCell,
                registrationsCell,
                shareCell
            );


            fragment.appendChild(tr);

        }


        tbody.appendChild(
            fragment
        );

    }


    /*
     * Footer is based on the currently filtered maker result,
     * not just the visible page.
     */

    const filteredTotal =
        filteredRows.reduce(
            (
                sum,
                row
            ) =>
                sum +
                safeNumber(
                    row.registrations
                ),
            0
        );


    setText(
        dom.makerSummaryTotal,
        formatIndianNumber(
            filteredTotal
        )
    );


    setText(
        dom.makerSummaryMarketShare,
        filteredTotal > 0
            ? '100.00%'
            : '0.00%'
    );


    updatePagination(
        pagination
    );

}


/* ============================================================
   19. TABLE SEARCH
   ============================================================ */

function filterTableData(rows) {

    const searchTerm =
        String(
            applicationState.searchTerm ||
            ''
        )
            .trim()
            .toLowerCase();


    if (!searchTerm) {

        return [...rows];

    }


    return rows.filter(
        row =>
            String(
                row.maker
            )
                .toLowerCase()
                .includes(
                    searchTerm
                )
    );

}


/* ============================================================
   20. TABLE SORTING
   ============================================================ */

function sortTableData(rows) {

    const sorted =
        [...rows];


    const {
        sortKey,
        sortDirection
    } =
        applicationState;


    sorted.sort(
        (
            a,
            b
        ) => {

            let result = 0;


            if (
                sortKey ===
                'maker'
            ) {

                result =
                    String(a.maker)
                        .localeCompare(
                            String(b.maker),
                            undefined,
                            {
                                sensitivity:
                                    'base'
                            }
                        );

            } else {

                const aValue =
                    safeNumber(
                        a[
                            sortKey
                        ]
                    );


                const bValue =
                    safeNumber(
                        b[
                            sortKey
                        ]
                    );


                result =
                    aValue -
                    bValue;

            }


            return sortDirection === 'asc'
                ? result
                : -result;

        }
    );


    return sorted;

}


/*
 * Handle table sort.
 */

function handleSort(
    key
) {

    const validKeys = [
        'maker',
        'registrations',
        'marketShare'
    ];


    if (
        !validKeys.includes(key)
    ) {

        return;

    }


    if (
        applicationState.sortKey ===
        key
    ) {

        applicationState.sortDirection =
            applicationState.sortDirection ===
                'asc'
                ? 'desc'
                : 'asc';

    } else {

        applicationState.sortKey =
            key;

        applicationState.sortDirection =
            key === 'maker'
                ? 'asc'
                : 'desc';

    }


    applicationState.currentPage =
        1;


    updateMakerTable();

}


/* ============================================================
   21. PAGINATION
   ============================================================ */

function getPaginationState(
    totalRows
) {

    const pageSize =
        applicationState.pageSize;


    const totalPages =
        Math.max(
            1,
            Math.ceil(
                totalRows /
                pageSize
            )
        );


    if (
        applicationState.currentPage >
        totalPages
    ) {

        applicationState.currentPage =
            totalPages;

    }


    const startIndex =
        (
            applicationState.currentPage -
            1
        ) *
        pageSize;


    const endIndex =
        Math.min(
            startIndex +
            pageSize,
            totalRows
        );


    return {

        currentPage:
            applicationState.currentPage,

        pageSize,

        totalPages,

        totalRows,

        startIndex,

        endIndex

    };

}


function updatePagination(
    pagination
) {

    if (!dom.pageIndicator) {

        return;

    }


    setText(
        dom.pageIndicator,
        `Page ${pagination.currentPage} of ${pagination.totalPages}`
    );


    if (dom.previousPageButton) {

        dom.previousPageButton.disabled =
            pagination.currentPage <= 1;

    }


    if (dom.nextPageButton) {

        dom.nextPageButton.disabled =
            pagination.currentPage >=
            pagination.totalPages;

    }

}


function goToPreviousPage() {

    if (
        applicationState.currentPage <=
        1
    ) {

        return;

    }


    applicationState.currentPage--;

    updateMakerTable();

}


function goToNextPage() {

    const filteredRows =
        filterTableData(
            applicationState.makerRows
        );


    const totalPages =
        Math.max(
            1,
            Math.ceil(
                filteredRows.length /
                applicationState.pageSize
            )
        );


    if (
        applicationState.currentPage >=
        totalPages
    ) {

        return;

    }


    applicationState.currentPage++;

    updateMakerTable();

}


function handlePageSizeChange(
    event
) {

    const pageSize =
        Number(
            event.target.value
        );


    if (
        !APP_CONFIG.pageSizes.includes(
            pageSize
        )
    ) {

        return;

    }


    applicationState.pageSize =
        pageSize;


    applicationState.currentPage =
        1;


    updateMakerTable();

}


/* ============================================================
   22. ACTIVE FILTER DISPLAY
   ============================================================ */

function updateActiveFilters() {

    if (!dom.activeFilters) {

        return;

    }


    dom.activeFilters.replaceChildren();


    const label =
        document.createElement(
            'span'
        );


    label.className =
        'active-filters__label';


    label.textContent =
        'Active Filters:';


    dom.activeFilters.appendChild(
        label
    );


    const filters =
        getSelectedFilters();


    const active = [

        {
            key: 'year',
            label: 'Year',
            value:
                filters.year
        },

        {
            key: 'fromYear',
            label: 'From',
            value:
                filters.fromYear
        },

        {
            key: 'toYear',
            label: 'To',
            value:
                filters.toYear
        },

        {
            key: 'maker',
            label: 'Maker',
            value:
                filters.maker
        },

        {
            key: 'region',
            label: 'Region',
            value:
                filters.region
        },

        {
            key: 'category',
            label: 'Category',
            value:
                filters.category
        },

        {
            key: 'subcategory',
            label: 'Subcategory',
            value:
                filters.subcategory
        }

    ].filter(
        item =>
            item.value !==
            APP_CONFIG.allValue
    );


    if (
        active.length === 0
    ) {

        const empty =
            document.createElement(
                'span'
            );


        empty.className =
            'active-filter active-filter--empty';


        empty.textContent =
            'No active filters';


        dom.activeFilters.appendChild(
            empty
        );


        return;

    }


    active.forEach(
        item => {

            const chip =
                document.createElement(
                    'span'
                );


            chip.className =
                'active-filter';


            const strong =
                document.createElement(
                    'strong'
                );


            strong.textContent =
                `${item.label}:`;


            const value =
                document.createTextNode(
                    ` ${item.value}`
                );


            chip.append(
                strong,
                value
            );


            dom.activeFilters.appendChild(
                chip
            );

        }
    );

}


/* ============================================================
   23. DATA YEAR RANGE
   ============================================================ */

function updateDataYearRange() {

    if (!dom.dataYearRange) {

        return;

    }


    const years =
        applicationState.availableYears;


    if (
        years.length === 0
    ) {

        dom.dataYearRange.textContent =
            '—';

        return;

    }


    if (
        years.length === 1
    ) {

        dom.dataYearRange.textContent =
            String(years[0]);

        return;

    }


    const min =
        years[0];


    const max =
        years[
            years.length - 1
        ];


    dom.dataYearRange.textContent =
        `${min}–${max}`;

}


/* ============================================================
   24. LOADING / ERROR / EMPTY STATES
   ============================================================ */


/*
 * IMPORTANT:
 *
 * Native hidden attribute is used.
 *
 * No .hidden CSS class is required.
 */

function showLoading() {

    if (dom.globalLoading) {

        dom.globalLoading.hidden =
            false;

    }

}


function hideLoading() {

    if (dom.globalLoading) {

        dom.globalLoading.hidden =
            true;

    }

}


function showTableLoading() {

    if (dom.tableLoading) {

        dom.tableLoading.hidden =
            false;

    }


    if (dom.tableEmpty) {

        dom.tableEmpty.hidden =
            true;

    }


    if (dom.tableError) {

        dom.tableError.hidden =
            true;

    }


    if (dom.tableContent) {

        dom.tableContent.hidden =
            true;

    }

}


function hideTableLoading() {

    if (dom.tableLoading) {

        dom.tableLoading.hidden =
            true;

    }


    if (dom.tableContent) {

        dom.tableContent.hidden =
            false;

    }

}


function showEmptyState() {

    if (dom.tableEmpty) {

        dom.tableEmpty.hidden =
            false;

    }


    if (dom.tableError) {

        dom.tableError.hidden =
            true;

    }


    if (dom.tableContent) {

        dom.tableContent.hidden =
            false;

    }

}


function hideEmptyState() {

    if (dom.tableEmpty) {

        dom.tableEmpty.hidden =
            true;

    }

}


function displayError(
    message
) {

    /*
     * Keep the user-facing message safe and generic.
     */

    const safeMessage =
        message ||
        'Unable to load data. Please try again.';


    if (dom.tableError) {

        const paragraph =
            dom.tableError.querySelector(
                'p'
            );


        if (paragraph) {

            paragraph.textContent =
                safeMessage;

        }


        dom.tableError.hidden =
            false;

    }


    if (dom.tableLoading) {

        dom.tableLoading.hidden =
            true;

    }


    if (dom.tableContent) {

        dom.tableContent.hidden =
            true;

    }

}


function clearError() {

    if (dom.tableError) {

        dom.tableError.hidden =
            true;

    }


    if (dom.tableContent) {

        dom.tableContent.hidden =
            false;

    }

}


/* ============================================================
   25. EVENT LISTENERS
   ============================================================ */

function attachEventListeners() {

    const filters = [

        dom.yearFilter,
        dom.fromYearFilter,
        dom.toYearFilter,
        dom.makerFilter,
        dom.regionFilter,
        dom.categoryFilter,
        dom.subcategoryFilter

    ];


    filters.forEach(
        element => {

            element?.addEventListener(
                'change',
                handleFilterChange
            );

        }
    );


    dom.clearFiltersButton?.addEventListener(
        'click',
        resetFilters
    );


    dom.makerSearch?.addEventListener(
        'input',
        handleMakerSearch
    );


    dom.previousPageButton?.addEventListener(
        'click',
        goToPreviousPage
    );


    dom.nextPageButton?.addEventListener(
        'click',
        goToNextPage
    );


    dom.pageSizeSelect?.addEventListener(
        'change',
        handlePageSizeChange
    );


    document
        .querySelectorAll(
            '[data-sort]'
        )
        .forEach(
            button => {

                button.addEventListener(
                    'click',
                    () =>
                        handleSort(
                            button.dataset.sort
                        )
                );

            }
        );


    /*
     * Prevent filter form from submitting/reloading page.
     */

    const form =
        document.getElementById(
            'dashboardFilters'
        );


    form?.addEventListener(
        'submit',
        event => {

            event.preventDefault();

        }
    );

}


/*
 * Handle filter changes.
 */

async function handleFilterChange(
    event
) {

    if (
        applicationState.updatingFilterOptions
    ) {

        return;

    }


    /*
     * If a range value is changed,
     * the single year selection is cleared.
     */

    if (
        event.target ===
            dom.fromYearFilter ||
        event.target ===
            dom.toYearFilter
    ) {

        normalizeYearUIState();

    }


    /*
     * If single year is selected,
     * clear the range.
     */

    if (
        event.target ===
        dom.yearFilter
    ) {

        const selected =
            normalizeFilterValue(
                dom.yearFilter.value
            );


        if (
            selected !==
            APP_CONFIG.allValue
        ) {

            setSelectValue(
                dom.fromYearFilter,
                APP_CONFIG.allValue
            );


            setSelectValue(
                dom.toYearFilter,
                APP_CONFIG.allValue
            );

        }

    }


    await applyFilters();

}


/*
 * Maker search is client-side only.
 */

function handleMakerSearch(
    event
) {

    const value =
        String(
            event.target.value ||
            ''
        );


    clearTimeout(
        applicationState.searchTimer
    );


    applicationState.searchTimer =
        setTimeout(
            () => {

                applicationState.searchTerm =
                    value;


                applicationState.currentPage =
                    1;


                updateMakerTable();

            },
            APP_CONFIG.searchDebounceMs
        );

}


/* ============================================================
   26. PAGE SIZE
   ============================================================ */

function initializePageSize() {

    if (!dom.pageSizeSelect) {

        return;

    }


    const configuredValue =
        String(
            APP_CONFIG.defaultPageSize
        );


    const optionExists =
        Array.from(
            dom.pageSizeSelect.options
        ).some(
            option =>
                option.value ===
                configuredValue
        );


    if (
        !optionExists
    ) {

        dom.pageSizeSelect.value =
            String(
                APP_CONFIG.defaultPageSize
            );

    } else {

        dom.pageSizeSelect.value =
            configuredValue;

    }


    applicationState.pageSize =
        Number(
            dom.pageSizeSelect.value
        );

}


/* ============================================================
   27. DROPDOWN HELPERS
   ============================================================ */

function populateSelect(
    selectElement,
    values,
    allLabel = 'All',
    selectedValue = APP_CONFIG.allValue
) {

    if (!selectElement) {

        return;

    }


    const normalizedValues =
        uniqueSortedValues(
            values
        );


    const fragment =
        document.createDocumentFragment();


    const allOption =
        document.createElement(
            'option'
        );


    allOption.value =
        APP_CONFIG.allValue;


    allOption.textContent =
        allLabel;


    fragment.appendChild(
        allOption
    );


    normalizedValues.forEach(
        value => {

            const option =
                document.createElement(
                    'option'
                );


            option.value =
                String(value);


            option.textContent =
                String(value);


            fragment.appendChild(
                option
            );

        }
    );


    selectElement.replaceChildren(
        fragment
    );


    const normalizedSelected =
        normalizeFilterValue(
            selectedValue
        );


    if (
        normalizedSelected ===
        APP_CONFIG.allValue
    ) {

        selectElement.value =
            APP_CONFIG.allValue;

        return;

    }


    const exists =
        normalizedValues.some(
            value =>
                String(value) ===
                normalizedSelected
        );


    selectElement.value =
        exists
            ? normalizedSelected
            : APP_CONFIG.allValue;

}


function setSelectValue(
    selectElement,
    value
) {

    if (!selectElement) {

        return;

    }


    const normalized =
        normalizeFilterValue(
            value
        );


    const exists =
        Array.from(
            selectElement.options
        ).some(
            option =>
                option.value ===
                normalized
        );


    selectElement.value =
        exists
            ? normalized
            : APP_CONFIG.allValue;

}


/* ============================================================
   28. RESPONSE NORMALIZATION
   ============================================================ */


/*
 * Normalize filter-options RPC responses.
 *
 * Supports common response shapes:
 *
 * {
 *   years: [],
 *   makers: [],
 *   regions: [],
 *   categories: [],
 *   subcategories: []
 * }
 *
 * or a single row / array of rows.
 */

function normalizeFilterOptionsResponse(
    response
) {

    if (!response) {

        return {

            years: [],
            makers: [],
            regions: [],
            categories: [],
            subcategories: []

        };

    }


    if (
        Array.isArray(response)
    ) {

        return normalizeFilterOptionRows(
            response
        );

    }


    if (
        typeof response !==
        'object'
    ) {

        return {

            years: [],
            makers: [],
            regions: [],
            categories: [],
            subcategories: []

        };

    }


    return {

        years:
            uniqueSortedValues(
                extractOptionArray(
                    response,
                    [
                        'years',
                        'year',
                        'available_years',
                        'availableYears'
                    ]
                )
            ),

        makers:
            uniqueSortedValues(
                extractOptionArray(
                    response,
                    [
                        'makers',
                        'maker',
                        'maker_names',
                        'makerNames'
                    ]
                )
            ),

        regions:
            uniqueSortedValues(
                extractOptionArray(
                    response,
                    [
                        'regions',
                        'region',
                        'rtos',
                        'rto',
                        'rto_names'
                    ]
                )
            ),

        categories:
            uniqueSortedValues(
                extractOptionArray(
                    response,
                    [
                        'categories',
                        'category'
                    ]
                )
            ),

        subcategories:
            uniqueSortedValues(
                extractOptionArray(
                    response,
                    [
                        'subcategories',
                        'subcategory'
                    ]
                )
            )

    };

}


/*
 * Normalize an array of option rows.
 */

function normalizeFilterOptionRows(
    rows
) {

    const result = {

        years: [],
        makers: [],
        regions: [],
        categories: [],
        subcategories: []

    };


    rows.forEach(
        row => {

            if (
                !row ||
                typeof row !== 'object'
            ) {

                return;

            }


            result.years.push(
                firstExistingValue(
                    row,
                    [
                        'year',
                        'years'
                    ]
                )
            );


            result.makers.push(
                firstExistingValue(
                    row,
                    [
                        'maker',
                        'makers',
                        'maker_name',
                        'makerName'
                    ]
                )
            );


            result.regions.push(
                firstExistingValue(
                    row,
                    [
                        'region',
                        'regions',
                        'rto',
                        'rto_name'
                    ]
                )
            );


            result.categories.push(
                firstExistingValue(
                    row,
                    [
                        'category',
                        'categories'
                    ]
                )
            );


            result.subcategories.push(
                firstExistingValue(
                    row,
                    [
                        'subcategory',
                        'subcategories'
                    ]
                )
            );

        }
    );


    return {

        years:
            uniqueSortedValues(
                result.years
            ),

        makers:
            uniqueSortedValues(
                result.makers
            ),

        regions:
            uniqueSortedValues(
                result.regions
            ),

        categories:
            uniqueSortedValues(
                result.categories
            ),

        subcategories:
            uniqueSortedValues(
                result.subcategories
            )

    };

}


/*
 * Extract arrays from object response.
 */

function extractOptionArray(
    source,
    keys
) {

    for (
        const key of keys
    ) {

        if (
            source &&
            Object.prototype.hasOwnProperty.call(
                source,
                key
            )
        ) {

            const value =
                source[key];


            if (
                Array.isArray(value)
            ) {

                return value;

            }


            if (
                value !== null &&
                value !== undefined &&
                value !== ''
            ) {

                return [value];

            }

        }

    }


    return [];

}


/* ============================================================
   29. FORMATTING
   ============================================================ */


/*
 * Indian number formatting.
 */

function formatIndianNumber(
    value
) {

    const number =
        safeNumber(value);


    return new Intl.NumberFormat(
        'en-IN',
        {
            maximumFractionDigits: 0
        }
    ).format(number);

}


/*
 * Percentage formatting.
 */

function formatPercentage(
    value
) {

    const number =
        safeNumber(value);


    return `${number.toFixed(2)}%`;

}


/*
 * Safely normalize a number.
 */

function safeNumber(
    value
) {

    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {

        return 0;

    }


    if (
        typeof value === 'number'
    ) {

        return Number.isFinite(value)
            ? value
            : 0;

    }


    const cleaned =
        String(value)
            .replace(
                /,/g,
                ''
            )
            .trim();


    if (!cleaned) {

        return 0;

    }


    const number =
        Number(cleaned);


    if (
        !Number.isFinite(number)
    ) {

        console.warn(
            'Invalid numeric value:',
            value
        );


        return 0;

    }


    return number;

}


/*
 * Nullable number.
 */

function normalizeNullableNumber(
    value
) {

    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {

        return null;

    }


    return safeNumber(value);

}


/*
 * String normalization.
 */

function normalizeString(
    value
) {

    if (
        value === null ||
        value === undefined
    ) {

        return '';

    }


    return String(value).trim();

}


/*
 * Unique sorted values.
 */

function uniqueSortedValues(
    values
) {

    if (!Array.isArray(values)) {

        return [];

    }


    const cleaned =
        values
            .filter(
                value =>
                    value !== null &&
                    value !== undefined &&
                    String(value).trim() !== ''
            )
            .map(
                value =>
                    String(value).trim()
            );


    return Array.from(
        new Set(cleaned)
    ).sort(
        (
            a,
            b
        ) =>
            a.localeCompare(
                b,
                undefined,
                {
                    numeric: true,
                    sensitivity: 'base'
                }
            )
    );

}


/*
 * Normalize years separately.
 */

function normalizeYearValues(
    values
) {

    if (!Array.isArray(values)) {

        return [];

    }


    const years =
        values
            .map(
                value =>
                    Number(value)
            )
            .filter(
                value =>
                    Number.isFinite(value)
            );


    return Array.from(
        new Set(years)
    ).sort(
        (
            a,
            b
        ) =>
            a - b
    );

}


/* ============================================================
   30. DOM HELPERS
   ============================================================ */

function setText(
    element,
    value
) {

    if (!element) {

        return;

    }


    element.textContent =
        String(value);

}


function firstExistingValue(
    object,
    keys
) {

    if (
        !object ||
        typeof object !== 'object'
    ) {

        return undefined;

    }


    for (
        const key of keys
    ) {

        if (
            Object.prototype.hasOwnProperty.call(
                object,
                key
            )
        ) {

            const value =
                object[key];


            if (
                value !== null &&
                value !== undefined
            ) {

                return value;

            }

        }

    }


    return undefined;

}


/* ============================================================
   31. INITIALIZATION ENTRY POINT
   ============================================================ */

document.addEventListener(
    'DOMContentLoaded',
    () => {

        initializeDashboard();

    }
);