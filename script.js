/* ============================================================
   VEHICLE REGISTRATION ANALYTICS DASHBOARD
   File: script.js

   COMPLETE FRONTEND FIX

   This version:
   - Connects to Supabase
   - Uses the three PostgreSQL RPC functions
   - Loads real data
   - Loads filters
   - Loads KPIs
   - Supports RTO / category filtering
   - Supports maker search
   - Supports sorting
   - Supports pagination
   - Shows real Supabase errors
   - Does not use fake data
   ============================================================ */


/* ============================================================
   1. SUPABASE CONFIGURATION
   ============================================================ */

const SUPABASE_URL =
    'https://yifnagndjbeqszexzaem.supabase.co';

const SUPABASE_ANON_KEY =
    'sb_publishable_HOBG1-ykEePfvvoJdm4X9w_3DU0itBG';


/* ============================================================
   2. RPC FUNCTION NAMES
   ============================================================ */

const RPC = {

    summary:
        'get_vehicle_registration_summary',

    filters:
        'get_vehicle_registration_filter_options',

    kpis:
        'get_vehicle_registration_kpis'

};


/* ============================================================
   3. APPLICATION CONFIG
   ============================================================ */

const CONFIG = {

    allValue: 'all',

    pageSize: 25,

    allowedPageSizes: [
        25,
        50,
        100
    ]

};


/* ============================================================
   4. SUPABASE CLIENT
   ============================================================ */

let supabaseClient = null;


/* ============================================================
   5. APPLICATION STATE
   ============================================================ */

const state = {

    rows: [],

    searchTerm: '',

    sortKey: 'registrations',

    sortDirection: 'desc',

    currentPage: 1,

    pageSize: CONFIG.pageSize,

    requestId: 0,

    filters: {

        year: 'all',

        fromYear: 'all',

        toYear: 'all',

        maker: 'all',

        region: 'all',

        category: 'all',

        subcategory: 'all'

    }

};


/* ============================================================
   6. DOM HELPERS
   ============================================================ */

function getElement(id) {

    return document.getElementById(id);

}


function setText(id, value) {

    const element =
        getElement(id);

    if (!element) {
        return;
    }

    element.textContent =
        value === null ||
        value === undefined
            ? ''
            : String(value);

}


/* ============================================================
   7. NUMBER HELPERS
   ============================================================ */

function toNumber(value) {

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
            .replace(/,/g, '')
            .trim();

    const number =
        Number(cleaned);

    return Number.isFinite(number)
        ? number
        : 0;

}


function formatNumber(value) {

    return new Intl.NumberFormat(
        'en-IN',
        {
            maximumFractionDigits: 0
        }
    ).format(
        toNumber(value)
    );

}


function formatPercentage(value) {

    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return '—';
    }

    const number =
        toNumber(value);

    return `${number.toFixed(2)}%`;

}


/* ============================================================
   8. FILTER HELPERS
   ============================================================ */

function normalizeFilter(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return CONFIG.allValue;
    }

    const normalized =
        String(value).trim();

    if (
        normalized === '' ||
        normalized.toLowerCase() === 'all'
    ) {
        return CONFIG.allValue;
    }

    return normalized;

}


function isAll(value) {

    return normalizeFilter(value) ===
        CONFIG.allValue;

}


/* ============================================================
   9. READ FILTERS FROM HTML
   ============================================================ */

function readFilters() {

    return {

        year:
            normalizeFilter(
                getElement('yearFilter')?.value
            ),

        fromYear:
            normalizeFilter(
                getElement('fromYearFilter')?.value
            ),

        toYear:
            normalizeFilter(
                getElement('toYearFilter')?.value
            ),

        maker:
            normalizeFilter(
                getElement('makerFilter')?.value
            ),

        region:
            normalizeFilter(
                getElement('regionFilter')?.value
            ),

        category:
            normalizeFilter(
                getElement('categoryFilter')?.value
            ),

        subcategory:
            normalizeFilter(
                getElement('subcategoryFilter')?.value
            )

    };

}


/* ============================================================
   10. BUILD RPC PARAMETERS
   ============================================================ */

function buildRpcParameters(filters) {

    const params = {};

    if (!isAll(filters.year)) {

        params.p_year =
            Number(filters.year);

    }

    if (!isAll(filters.fromYear)) {

        params.p_from_year =
            Number(filters.fromYear);

    }

    if (!isAll(filters.toYear)) {

        params.p_to_year =
            Number(filters.toYear);

    }

    if (!isAll(filters.maker)) {

        params.p_maker =
            filters.maker;

    }

    if (!isAll(filters.region)) {

        params.p_rto =
            filters.region;

    }

    if (!isAll(filters.category)) {

        params.p_category =
            filters.category;

    }

    if (!isAll(filters.subcategory)) {

        params.p_subcategory =
            filters.subcategory;

    }

    return params;

}


/* ============================================================
   11. SUPABASE RPC CALL
   ============================================================ */

async function callRpc(
    functionName,
    parameters = {}
) {

    if (!supabaseClient) {

        throw new Error(
            'Supabase client has not been initialized.'
        );

    }

    console.log(
        `[Supabase] Calling ${functionName}`,
        parameters
    );

    const result =
        await supabaseClient.rpc(
            functionName,
            parameters
        );

    if (result.error) {

        console.error(
            `[Supabase] ${functionName} failed`,
            result.error
        );

        throw result.error;

    }

    console.log(
        `[Supabase] ${functionName} response`,
        result.data
    );

    return result.data;

}


/* ============================================================
   12. INITIALIZE SUPABASE
   ============================================================ */

async function initializeSupabase() {

    /*
     * index.html already loads:
     *
     * https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
     *
     * Because that script uses defer, wait until the global
     * Supabase object is available.
     */

    let attempts = 0;

    while (
        (
            !window.supabase ||
            typeof window.supabase.createClient !==
                'function'
        ) &&
        attempts < 100
    ) {

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    50
                )
        );

        attempts++;

    }


    if (
        !window.supabase ||
        typeof window.supabase.createClient !==
            'function'
    ) {

        throw new Error(
            'Supabase browser library could not be loaded. Check the Supabase CDN script in index.html.'
        );

    }


    if (!SUPABASE_URL) {

        throw new Error(
            'Supabase URL is missing.'
        );

    }


    if (!SUPABASE_ANON_KEY) {

        throw new Error(
            'Supabase publishable/anon key is missing.'
        );

    }


    supabaseClient =
        window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY
        );


    console.log(
        '[Supabase] Client initialized.'
    );

}


/* ============================================================
   13. LOADING UI
   ============================================================ */

function showLoading() {

    const globalLoading =
        getElement('globalLoading');

    const tableLoading =
        getElement('tableLoading');

    const tableContent =
        getElement('tableContent');

    const tableEmpty =
        getElement('tableEmpty');

    const tableError =
        getElement('tableError');


    if (globalLoading) {

        globalLoading.hidden =
            false;

    }


    if (tableLoading) {

        tableLoading.hidden =
            false;

    }


    if (tableContent) {

        tableContent.hidden =
            true;

    }


    if (tableEmpty) {

        tableEmpty.hidden =
            true;

    }


    if (tableError) {

        tableError.hidden =
            true;

    }

}


function hideLoading() {

    const globalLoading =
        getElement('globalLoading');

    const tableLoading =
        getElement('tableLoading');


    if (globalLoading) {

        globalLoading.hidden =
            true;

    }


    if (tableLoading) {

        tableLoading.hidden =
            true;

    }

}


/* ============================================================
   14. ERROR DISPLAY
   ============================================================ */

function clearError() {

    const errorBox =
        getElement('tableError');

    if (!errorBox) {
        return;
    }

    errorBox.hidden =
        true;

}


function getErrorMessage(error) {

    if (!error) {

        return 'Unknown error.';

    }

    if (
        typeof error === 'string'
    ) {

        return error;

    }

    const parts = [];

    if (error.message) {

        parts.push(
            `Message: ${error.message}`
        );

    }

    if (error.details) {

        parts.push(
            `Details: ${error.details}`
        );

    }

    if (error.hint) {

        parts.push(
            `Hint: ${error.hint}`
        );

    }

    if (error.code) {

        parts.push(
            `Code: ${error.code}`
        );

    }

    if (parts.length) {

        return parts.join(' | ');

    }

    try {

        return JSON.stringify(
            error
        );

    } catch {

        return String(error);

    }

}


function showError(error) {

    console.error(
        '[Dashboard Error]',
        error
    );


    const errorBox =
        getElement('tableError');

    if (!errorBox) {

        alert(
            getErrorMessage(error)
        );

        return;

    }


    errorBox.hidden =
        false;


    const paragraph =
        errorBox.querySelector('p');


    const message =
        getErrorMessage(error);


    if (paragraph) {

        paragraph.textContent =
            `Unable to load data. ${message}`;

    } else {

        errorBox.textContent =
            `Unable to load data. ${message}`;

    }

}


/* ============================================================
   15. FILTER SELECT HELPERS
   ============================================================ */

function populateSelect(
    element,
    values,
    selectedValue = 'all'
) {

    if (!element) {
        return;
    }


    const cleanedValues =
        Array.from(
            new Set(
                (
                    Array.isArray(values)
                        ? values
                        : []
                )
                    .filter(
                        value =>
                            value !== null &&
                            value !== undefined &&
                            String(value).trim() !== ''
                    )
                    .map(
                        value =>
                            String(value).trim()
                    )
            )
        );


    cleanedValues.sort(
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


    element.replaceChildren();


    const allOption =
        document.createElement(
            'option'
        );

    allOption.value =
        'all';

    allOption.textContent =
        'All';

    element.appendChild(
        allOption
    );


    for (
        const value of cleanedValues
    ) {

        const option =
            document.createElement(
                'option'
            );

        option.value =
            value;

        option.textContent =
            value;

        element.appendChild(
            option
        );

    }


    const normalizedSelected =
        normalizeFilter(
            selectedValue
        );


    const exists =
        Array.from(
            element.options
        ).some(
            option =>
                option.value ===
                normalizedSelected
        );


    element.value =
        exists
            ? normalizedSelected
            : 'all';

}


/* ============================================================
   16. LOAD FILTER OPTIONS
   ============================================================ */

async function loadFilterOptions(
    filters = readFilters()
) {

    const parameters =
        buildRpcParameters(
            filters
        );


    /*
     * Tell the RPC that we want the full set of
     * filter options.
     */

    parameters.p_ignore_dimension =
        'all';


    const data =
        await callRpc(
            RPC.filters,
            parameters
        );


    console.log(
        '[Filters] Received:',
        data
    );


    const options =
        data || {};


    /*
     * The SQL RPC returns:
     *
     * {
     *   years: [],
     *   makers: [],
     *   regions: [],
     *   categories: [],
     *   subcategories: []
     * }
     */


    const current =
        readFilters();


    populateSelect(
        getElement('makerFilter'),
        options.makers || [],
        current.maker
    );


    populateSelect(
        getElement('regionFilter'),
        options.regions || [],
        current.region
    );


    populateSelect(
        getElement('categoryFilter'),
        options.categories || [],
        current.category
    );


    populateSelect(
        getElement('subcategoryFilter'),
        options.subcategories || [],
        current.subcategory
    );


    /*
     * Years are supplied by the RPC.
     */

    if (
        Array.isArray(options.years) &&
        options.years.length > 0
    ) {

        populateSelect(
            getElement('yearFilter'),
            options.years,
            current.year
        );

        populateSelect(
            getElement('fromYearFilter'),
            options.years,
            current.fromYear
        );

        populateSelect(
            getElement('toYearFilter'),
            options.years,
            current.toYear
        );


        updateYearRange(
            options.years
        );

    } else {

        /*
         * The supplied data is 2026 data.
         * Keep the UI usable even if the RPC returns
         * no year array.
         */

        populateSelect(
            getElement('yearFilter'),
            [2026],
            current.year
        );

        populateSelect(
            getElement('fromYearFilter'),
            [2026],
            current.fromYear
        );

        populateSelect(
            getElement('toYearFilter'),
            [2026],
            current.toYear
        );

        updateYearRange(
            [2026]
        );

    }

}


/* ============================================================
   17. YEAR RANGE DISPLAY
   ============================================================ */

function updateYearRange(
    years
) {

    const validYears =
        (
            Array.isArray(years)
                ? years
                : []
        )
            .map(
                value =>
                    Number(value)
            )
            .filter(
                value =>
                    Number.isFinite(value)
            );


    const element =
        getElement('data-year-range');


    if (!element) {
        return;
    }


    if (validYears.length === 0) {

        element.textContent =
            '—';

        return;

    }


    const minimum =
        Math.min(
            ...validYears
        );

    const maximum =
        Math.max(
            ...validYears
        );


    element.textContent =
        minimum === maximum
            ? String(minimum)
            : `${minimum} – ${maximum}`;

}


/* ============================================================
   18. SUMMARY DATA
   ============================================================ */

async function loadSummary(
    filters,
    requestId
) {

    const parameters =
        buildRpcParameters(
            filters
        );


    const data =
        await callRpc(
            RPC.summary,
            parameters
        );


    /*
     * Ignore an old request if the user changed filters
     * while an earlier request was still running.
     */

    if (
        requestId !==
        state.requestId
    ) {

        return;

    }


    const rawRows =
        Array.isArray(data)
            ? data
            : [];


    state.rows =
        rawRows
            .map(
                row => {

                    const maker =
                        row.maker ??
                        row.maker_name ??
                        row.manufacturer ??
                        '';

                    const registrations =
                        row.registrations ??
                        row.total_registrations ??
                        row.total ??
                        0;


                    return {

                        maker:
                            String(
                                maker
                            ).trim(),

                        registrations:
                            toNumber(
                                registrations
                            )

                    };

                }
            )
            .filter(
                row =>
                    row.maker !== ''
            );


    state.currentPage =
        1;


    console.log(
        `[Summary] Loaded ${state.rows.length} makers.`
    );


    renderTable();

}


/* ============================================================
   19. KPI DATA
   ============================================================ */

async function loadKpis(
    filters,
    requestId
) {

    const parameters =
        buildRpcParameters(
            filters
        );


    const data =
        await callRpc(
            RPC.kpis,
            parameters
        );


    if (
        requestId !==
        state.requestId
    ) {

        return;

    }


    if (!data) {

        return;

    }


    console.log(
        '[KPIs] Received:',
        data
    );


    const totalRegistrations =
        data.totalRegistrations ??
        data.total_registrations ??
        data.total ??
        0;


    const totalMakers =
        data.totalMakers ??
        data.total_makers ??
        data.makerCount ??
        0;


    const twoW =
        data.twoWRegistrations ??
        data.two_w_registrations ??
        null;


    const threeW =
        data.threeWRegistrations ??
        data.three_w_registrations ??
        null;


    const twoWPercentage =
        data.twoWPercentage ??
        data.two_w_percentage ??
        null;


    const threeWPercentage =
        data.threeWPercentage ??
        data.three_w_percentage ??
        null;


    setText(
        'totalRegistrations',
        formatNumber(
            totalRegistrations
        )
    );


    setText(
        'totalMakers',
        formatNumber(
            totalMakers
        )
    );


    setText(
        'twoWRegistrations',
        twoW === null
            ? '—'
            : formatNumber(twoW)
    );


    setText(
        'threeWRegistrations',
        threeW === null
            ? '—'
            : formatNumber(threeW)
    );


    setText(
        'twoWPercentage',
        twoWPercentage === null
            ? '—'
            : formatPercentage(
                twoWPercentage
            )
    );


    setText(
        'threeWPercentage',
        threeWPercentage === null
            ? '—'
            : formatPercentage(
                threeWPercentage
            )
    );

}


/* ============================================================
   20. TABLE FILTERING
   ============================================================ */

function getVisibleRows() {

    const search =
        String(
            state.searchTerm || ''
        )
            .trim()
            .toLowerCase();


    let rows =
        [...state.rows];


    if (search) {

        rows =
            rows.filter(
                row =>
                    row.maker
                        .toLowerCase()
                        .includes(
                            search
                        )
            );

    }


    rows.sort(
        (
            a,
            b
        ) => {

            let result = 0;


            if (
                state.sortKey ===
                'maker'
            ) {

                result =
                    a.maker.localeCompare(
                        b.maker,
                        undefined,
                        {
                            sensitivity:
                                'base'
                        }
                    );

            } else {

                const aValue =
                    toNumber(
                        a[
                            state.sortKey
                        ]
                    );

                const bValue =
                    toNumber(
                        b[
                            state.sortKey
                        ]
                    );


                result =
                    aValue -
                    bValue;

            }


            return state.sortDirection ===
                'asc'
                    ? result
                    : -result;

        }
    );


    return rows;

}


/* ============================================================
   21. RENDER TABLE
   ============================================================ */

function renderTable() {

    const body =
        getElement(
            'makerSummaryTableBody'
        );


    if (!body) {
        return;
    }


    const rows =
        getVisibleRows();


    const total =
        rows.reduce(
            (
                sum,
                row
            ) =>
                sum +
                toNumber(
                    row.registrations
                ),
            0
        );


    const totalPages =
        Math.max(
            1,
            Math.ceil(
                rows.length /
                state.pageSize
            )
        );


    if (
        state.currentPage >
        totalPages
    ) {

        state.currentPage =
            totalPages;

    }


    const startIndex =
        (
            state.currentPage -
            1
        ) *
        state.pageSize;


    const pageRows =
        rows.slice(
            startIndex,
            startIndex +
            state.pageSize
        );


    body.replaceChildren();


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


        const registrationCell =
            document.createElement(
                'td'
            );

        registrationCell.textContent =
            formatNumber(
                row.registrations
            );


        const shareCell =
            document.createElement(
                'td'
            );


        const share =
            total > 0
                ? (
                    toNumber(
                        row.registrations
                    ) /
                    total
                ) *
                100
                : 0;


        shareCell.textContent =
            `${share.toFixed(2)}%`;


        tr.appendChild(
            makerCell
        );

        tr.appendChild(
            registrationCell
        );

        tr.appendChild(
            shareCell
        );


        body.appendChild(
            tr
        );

    }


    /*
     * Empty state.
     */

    const tableEmpty =
        getElement('tableEmpty');

    const tableContent =
        getElement('tableContent');


    if (
        rows.length === 0
    ) {

        if (tableEmpty) {

            tableEmpty.hidden =
                false;

        }

        if (tableContent) {

            tableContent.hidden =
                true;

        }

    } else {

        if (tableEmpty) {

            tableEmpty.hidden =
                true;

        }

        if (tableContent) {

            tableContent.hidden =
                false;

        }

    }


    /*
     * Footer.
     */

    setText(
        'makerSummaryTotal',
        formatNumber(total)
    );


    setText(
        'makerSummaryMarketShare',
        rows.length > 0
            ? '100.00%'
            : '0.00%'
    );


    /*
     * Pagination.
     */

    setText(
        'pageIndicator',
        `Page ${state.currentPage} of ${totalPages}`
    );


    const previous =
        getElement(
            'previousPageButton'
        );


    const next =
        getElement(
            'nextPageButton'
        );


    if (previous) {

        previous.disabled =
            state.currentPage <= 1;

    }


    if (next) {

        next.disabled =
            state.currentPage >=
            totalPages;

    }

}


/* ============================================================
   22. TABLE SORTING
   ============================================================ */

function handleSort(
    key
) {

    const allowedKeys = [

        'maker',

        'registrations',

        'marketShare'

    ];


    if (
        !allowedKeys.includes(
            key
        )
    ) {

        return;

    }


    /*
     * Market share is calculated from registrations,
     * so sorting by marketShare is equivalent to sorting
     * by registrations.
     */

    const actualKey =
        key === 'marketShare'
            ? 'registrations'
            : key;


    if (
        state.sortKey ===
        actualKey
    ) {

        state.sortDirection =
            state.sortDirection ===
                'asc'
                    ? 'desc'
                    : 'asc';

    } else {

        state.sortKey =
            actualKey;

        state.sortDirection =
            actualKey === 'maker'
                ? 'asc'
                : 'desc';

    }


    state.currentPage =
        1;


    renderTable();

}


/* ============================================================
   23. ACTIVE FILTER DISPLAY
   ============================================================ */

function renderActiveFilters(
    filters
) {

    const container =
        getElement(
            'activeFilters'
        );


    if (!container) {
        return;
    }


    container.replaceChildren();


    const label =
        document.createElement(
            'span'
        );

    label.className =
        'active-filters__label';

    label.textContent =
        'Active Filters:';


    container.appendChild(
        label
    );


    const active = [

        [
            'Year',
            filters.year
        ],

        [
            'From',
            filters.fromYear
        ],

        [
            'To',
            filters.toYear
        ],

        [
            'Maker',
            filters.maker
        ],

        [
            'Region',
            filters.region
        ],

        [
            'Category',
            filters.category
        ],

        [
            'Subcategory',
            filters.subcategory
        ]

    ].filter(
        item =>
            !isAll(
                item[1]
            )
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

        container.appendChild(
            empty
        );

        return;

    }


    for (
        const [
            labelText,
            value
        ] of active
    ) {

        const chip =
            document.createElement(
                'span'
            );

        chip.className =
            'active-filter';

        chip.textContent =
            `${labelText}: ${value}`;

        container.appendChild(
            chip
        );

    }

}


/* ============================================================
   24. FILTER COMPATIBILITY
   ============================================================ */

function enforceFilterCompatibility(
    changedFilter
) {

    const region =
        getElement(
            'regionFilter'
        );

    const category =
        getElement(
            'categoryFilter'
        );

    const subcategory =
        getElement(
            'subcategoryFilter'
        );


    /*
     * The source data does NOT contain:
     *
     * Maker x RTO x Vehicle Class
     *
     * Therefore RTO and vehicle class cannot be
     * combined.
     */


    if (
        changedFilter ===
            'regionFilter' &&
        !isAll(
            region?.value
        )
    ) {

        if (category) {

            category.value =
                'all';

        }

        if (subcategory) {

            subcategory.value =
                'all';

        }

    }


    if (
        (
            changedFilter ===
                'categoryFilter' ||
            changedFilter ===
                'subcategoryFilter'
        ) &&
        (
            !isAll(
                category?.value
            ) ||
            !isAll(
                subcategory?.value
            )
        )
    ) {

        if (region) {

            region.value =
                'all';

        }

    }


    const rtoSelected =
        !isAll(
            region?.value
        );


    const classSelected =
        !isAll(
            category?.value
        ) ||
        !isAll(
            subcategory?.value
        );


    if (region) {

        region.disabled =
            classSelected;

    }


    if (category) {

        category.disabled =
            rtoSelected;

    }


    if (subcategory) {

        subcategory.disabled =
            rtoSelected;

    }

}


/* ============================================================
   25. VALIDATE FILTERS
   ============================================================ */

function validateFilters(
    filters
) {

    if (
        !isAll(
            filters.fromYear
        ) &&
        !isAll(
            filters.toYear
        )
    ) {

        const from =
            Number(
                filters.fromYear
            );

        const to =
            Number(
                filters.toYear
            );


        if (
            Number.isFinite(from) &&
            Number.isFinite(to) &&
            from > to
        ) {

            throw new Error(
                'From Year cannot be greater than To Year.'
            );

        }

    }


    const rtoSelected =
        !isAll(
            filters.region
        );


    const classSelected =
        !isAll(
            filters.category
        ) ||
        !isAll(
            filters.subcategory
        );


    if (
        rtoSelected &&
        classSelected
    ) {

        throw new Error(
            'Region / RTO and Category / Subcategory cannot be used together because the supplied data does not contain their intersection.'
        );

    }

}


/* ============================================================
   26. REFRESH DASHBOARD
   ============================================================ */

async function refreshDashboard() {

    const filters =
        readFilters();


    validateFilters(
        filters
    );


    state.filters =
        filters;


    renderActiveFilters(
        filters
    );


    enforceFilterCompatibility(
        ''
    );


    const requestId =
        ++state.requestId;


    clearError();

    showLoading();


    try {

        /*
         * Run summary and KPI requests together.
         */

        await Promise.all([

            loadSummary(
                filters,
                requestId
            ),

            loadKpis(
                filters,
                requestId
            )

        ]);


    } catch (error) {

        /*
         * Clear stale table data when the request fails.
         */

        state.rows =
            [];


        renderTable();


        showError(
            error
        );


    } finally {

        if (
            requestId ===
            state.requestId
        ) {

            hideLoading();

        }

    }

}


/* ============================================================
   27. FILTER CHANGE
   ============================================================ */

async function handleFilterChange(
    filterId
) {

    try {

        enforceFilterCompatibility(
            filterId
        );


        const filters =
            readFilters();


        validateFilters(
            filters
        );


        state.currentPage =
            1;


        /*
         * Refresh filter options after a filter changes.
         * This keeps the filter lists synchronized.
         */

        await loadFilterOptions(
            filters
        );


        await refreshDashboard();


    } catch (error) {

        hideLoading();

        showError(
            error
        );

    }

}


/* ============================================================
   28. CLEAR FILTERS
   ============================================================ */

async function clearFilters() {

    const filterIds = [

        'yearFilter',

        'fromYearFilter',

        'toYearFilter',

        'makerFilter',

        'regionFilter',

        'categoryFilter',

        'subcategoryFilter'

    ];


    for (
        const id of filterIds
    ) {

        const element =
            getElement(id);


        if (element) {

            element.value =
                'all';

        }

    }


    const search =
        getElement(
            'makerSearch'
        );


    if (search) {

        search.value =
            '';

    }


    state.searchTerm =
        '';

    state.currentPage =
        1;

    state.sortKey =
        'registrations';

    state.sortDirection =
        'desc';


    enforceFilterCompatibility(
        ''
    );


    try {

        await loadFilterOptions(
            readFilters()
        );

        await refreshDashboard();

    } catch (error) {

        showError(
            error
        );

    }

}


/* ============================================================
   29. SEARCH
   ============================================================ */

function handleSearch(
    event
) {

    state.searchTerm =
        event.target.value || '';


    state.currentPage =
        1;


    renderTable();

}


/* ============================================================
   30. PAGINATION
   ============================================================ */

function previousPage() {

    if (
        state.currentPage <=
        1
    ) {

        return;

    }


    state.currentPage--;

    renderTable();

}


function nextPage() {

    const rows =
        getVisibleRows();


    const totalPages =
        Math.max(
            1,
            Math.ceil(
                rows.length /
                state.pageSize
            )
        );


    if (
        state.currentPage >=
        totalPages
    ) {

        return;

    }


    state.currentPage++;

    renderTable();

}


function changePageSize(
    event
) {

    const value =
        Number(
            event.target.value
        );


    if (
        !CONFIG.allowedPageSizes
            .includes(
                value
            )
    ) {

        return;

    }


    state.pageSize =
        value;


    state.currentPage =
        1;


    renderTable();

}


/* ============================================================
   31. ATTACH EVENTS
   ============================================================ */

function attachEventListeners() {

    const filterIds = [

        'yearFilter',

        'fromYearFilter',

        'toYearFilter',

        'makerFilter',

        'regionFilter',

        'categoryFilter',

        'subcategoryFilter'

    ];


    for (
        const id of filterIds
    ) {

        const element =
            getElement(id);


        if (!element) {
            continue;
        }


        element.addEventListener(
            'change',
            () =>
                handleFilterChange(
                    id
                )
        );

    }


    const clearButton =
        getElement(
            'clearFiltersButton'
        );


    if (clearButton) {

        clearButton.addEventListener(
            'click',
            clearFilters
        );

    }


    const search =
        getElement(
            'makerSearch'
        );


    if (search) {

        search.addEventListener(
            'input',
            handleSearch
        );

    }


    const previous =
        getElement(
            'previousPageButton'
        );


    if (previous) {

        previous.addEventListener(
            'click',
            previousPage
        );

    }


    const next =
        getElement(
            'nextPageButton'
        );


    if (next) {

        next.addEventListener(
            'click',
            nextPage
        );

    }


    const pageSize =
        getElement(
            'pageSizeSelect'
        );


    if (pageSize) {

        pageSize.addEventListener(
            'change',
            changePageSize
        );

    }


    /*
     * Existing HTML has:
     *
     * data-sort="maker"
     * data-sort="registrations"
     * data-sort="marketShare"
     */

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
     * Prevent the filters form from submitting/reloading
     * the page if Enter is pressed.
     */

    const form =
        getElement(
            'dashboardFilters'
        );


    if (form) {

        form.addEventListener(
            'submit',
            event => {

                event.preventDefault();

            }
        );

    }

}


/* ============================================================
   32. INITIALIZE
   ============================================================ */

async function initializeDashboard() {

    console.log(
        '[Dashboard] Initializing...'
    );


    showLoading();


    try {

        await initializeSupabase();


        attachEventListeners();


        /*
         * First load the filter metadata.
         */

        await loadFilterOptions(
            {
                year: 'all',
                fromYear: 'all',
                toYear: 'all',
                maker: 'all',
                region: 'all',
                category: 'all',
                subcategory: 'all'
            }
        );


        /*
         * Then load the actual dashboard.
         */

        await refreshDashboard();


        console.log(
            '[Dashboard] Ready.'
        );


    } catch (error) {

        console.error(
            '[Dashboard] Initialization failed:',
            error
        );


        showError(
            error
        );


    } finally {

        hideLoading();

    }

}


/* ============================================================
   33. START APPLICATION
   ============================================================ */

document.addEventListener(
    'DOMContentLoaded',
    () => {

        initializeDashboard();

    }
);
