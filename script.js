/* ============================================================
   VEHICLE REGISTRATION ANALYTICS DASHBOARD
   File: /js/script.js

   Vanilla JavaScript + Supabase

   MULTI-MAKER SEARCH:
   ------------------------------------------------------------
   The "Registrations by Maker" table supports multiple
   simultaneous maker searches.

   Example:

       Search maker...          [+]
       HERO MOTOCORP

       Search another maker...  [×]
       HONDA

       Search another maker...  [×]
       TVS

   The table will show rows matching ANY of the entered
   maker search terms.
   ============================================================ */


/* ============================================================
   1. CONFIGURATION
   ============================================================ */

const SUPABASE_URL =
    'https://yifnagndjbeqszexzaem.supabase.co';

const SUPABASE_ANON_KEY =
    'sb_publishable_HOBG1-ykEePfvvoJdm4X9w_3DU0itBG';


const DATA_SOURCE = {

    mode: 'rpc',

    summaryRpc:
        'get_vehicle_registration_summary',

    filterOptionsRpc:
        'get_vehicle_registration_filter_options',

    kpiRpc:
        'get_vehicle_registration_kpis',

    viewName:
        'vehicle_registration_fact'

};


const APP_CONFIG = {

    allValue: 'all',

    defaultPageSize: 25,

    pageSizes: [
        25,
        50,
        100
    ],

    searchDebounceMs: 120

};


/* ============================================================
   2. SUPABASE CLIENT
   ============================================================ */

let supabaseClient = null;


/* ============================================================
   3. FILTER STATE
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

    initialized: false,

    initializing: false,

    updatingFilterOptions: false,

    availableYears: [],

    filterOptions: {

        makers: [],

        regions: [],

        categories: [],

        subcategories: []

    },

    makerRows: [],

    kpis: {

        totalRegistrations: 0,

        totalMakers: 0,

        twoWRegistrations: null,

        threeWRegistrations: null,

        twoWPercentage: null,

        threeWPercentage: null

    },

    /*
     * MULTI-MAKER SEARCH
     *
     * Every non-empty term is matched against the maker name.
     * Terms are combined using OR logic.
     */
    makerSearchTerms: [''],

    /*
     * Legacy single search value.
     * Kept for compatibility with existing code.
     */
    searchTerm: '',

    sortKey:
        'registrations',

    sortDirection:
        'desc',

    currentPage: 1,

    pageSize:
        APP_CONFIG.defaultPageSize,

    requestId: 0,

    searchTimer: null

};


/* ============================================================
   5. DOM REFERENCES
   ============================================================ */

const dom = {};


/* ============================================================
   6. BASIC DOM HELPERS
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
   7. CACHE DOM ELEMENTS
   ============================================================ */

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

        /* Loading */
        'globalLoading',
        'tableLoading',

        /* Error / empty */
        'errorMessage',
        'tableEmptyState'

    ];

    ids.forEach((id) => {

        dom[id] =
            getElement(id);

    });

}


/* ============================================================
   8. SUPABASE INITIALIZATION
   ============================================================ */

async function initializeSupabase() {

    if (
        !SUPABASE_URL ||
        SUPABASE_URL ===
            'YOUR_SUPABASE_URL'
    ) {

        throw new Error(
            'Supabase URL is not configured.'
        );

    }


    if (
        !SUPABASE_ANON_KEY ||
        SUPABASE_ANON_KEY ===
            'YOUR_SUPABASE_ANON_KEY'
    ) {

        throw new Error(
            'Supabase key is not configured.'
        );

    }


    /*
     * Preferred:
     * Supabase loaded through CDN.
     */
    if (
        window.supabase &&
        typeof window.supabase.createClient ===
            'function'
    ) {

        supabaseClient =
            window.supabase.createClient(
                SUPABASE_URL,
                SUPABASE_ANON_KEY
            );

        return;

    }


    /*
     * Fallback:
     * Dynamically load Supabase.
     */
    const module =
        await import(
            'https://esm.sh/@supabase/supabase-js@2'
        );


    supabaseClient =
        module.createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY
        );

}


/* ============================================================
   9. NUMBER HELPERS
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


function formatIndianNumber(value) {

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


    return `${toNumber(value).toFixed(2)}%`;

}


/* ============================================================
   10. FILTER HELPERS
   ============================================================ */

function normalizeFilter(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return APP_CONFIG.allValue;

    }


    const normalized =
        String(value).trim();


    if (
        normalized === '' ||
        normalized.toLowerCase() === 'all'
    ) {

        return APP_CONFIG.allValue;

    }


    return normalized;

}


function isAll(value) {

    return normalizeFilter(value) ===
        APP_CONFIG.allValue;

}


/* ============================================================
   11. READ FILTERS
   ============================================================ */

function getSelectedFilters() {

    return {

        year:
            normalizeFilter(
                dom.yearFilter?.value
            ),

        fromYear:
            normalizeFilter(
                dom.fromYearFilter?.value
            ),

        toYear:
            normalizeFilter(
                dom.toYearFilter?.value
            ),

        maker:
            normalizeFilter(
                dom.makerFilter?.value
            ),

        region:
            normalizeFilter(
                dom.regionFilter?.value
            ),

        category:
            normalizeFilter(
                dom.categoryFilter?.value
            ),

        subcategory:
            normalizeFilter(
                dom.subcategoryFilter?.value
            )

    };

}


/* ============================================================
   12. FILTER VALIDATION
   ============================================================ */

function validateFilters(filters) {

    const errors = [];


    const hasFrom =
        !isAll(filters.fromYear);

    const hasTo =
        !isAll(filters.toYear);


    if (hasFrom) {

        if (
            !Number.isFinite(
                Number(filters.fromYear)
            )
        ) {

            errors.push(
                'From Year is invalid.'
            );

        }

    }


    if (hasTo) {

        if (
            !Number.isFinite(
                Number(filters.toYear)
            )
        ) {

            errors.push(
                'To Year is invalid.'
            );

        }

    }


    if (hasFrom && hasTo) {

        const from =
            Number(filters.fromYear);

        const to =
            Number(filters.toYear);


        if (from > to) {

            errors.push(
                'From Year cannot be greater than To Year.'
            );

        }

    }


    return {

        valid:
            errors.length === 0,

        errors

    };

}


/* ============================================================
   13. BUILD RPC PARAMETERS
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
   14. OBJECT / VALUE HELPERS
   ============================================================ */

function extractValue(
    row,
    possibleKeys
) {

    if (
        !row ||
        typeof row !== 'object'
    ) {

        return '';

    }


    for (
        const key of possibleKeys
    ) {

        if (
            Object.prototype.hasOwnProperty.call(
                row,
                key
            )
        ) {

            return row[key];

        }

    }


    return '';

}


function normalizeOption(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return '';

    }


    return String(value).trim();

}


function uniqueSorted(values) {

    const cleaned =
        values
            .map(normalizeOption)
            .filter(Boolean);


    return [
        ...new Set(cleaned)
    ].sort(
        (a, b) =>
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


/* ============================================================
   15. FILTER OPTION NORMALIZATION
   ============================================================ */

function normalizeFilterOptions(data) {

    const rows =
        Array.isArray(data)
            ? data
            : [];


    const makers = [];
    const regions = [];
    const categories = [];
    const subcategories = [];


    rows.forEach((row) => {

        const maker =
            extractValue(
                row,
                [
                    'maker',
                    'Maker',
                    'MAKER',
                    'maker_name',
                    'makerName'
                ]
            );


        const region =
            extractValue(
                row,
                [
                    'rto',
                    'RTO',
                    'rto_name',
                    'rtoName',
                    'region',
                    'Region'
                ]
            );


        const category =
            extractValue(
                row,
                [
                    'category',
                    'Category',
                    'CATEGORY'
                ]
            );


        const subcategory =
            extractValue(
                row,
                [
                    'subcategory',
                    'Subcategory',
                    'SUBCATEGORY',
                    'sub_category'
                ]
            );


        if (maker) {
            makers.push(maker);
        }

        if (region) {
            regions.push(region);
        }

        if (category) {
            categories.push(category);
        }

        if (subcategory) {
            subcategories.push(subcategory);
        }

    });


    return {

        makers:
            uniqueSorted(makers),

        regions:
            uniqueSorted(regions),

        categories:
            uniqueSorted(categories),

        subcategories:
            uniqueSorted(subcategories)

    };

}


/* ============================================================
   16. VIEW FILTERING
   ============================================================ */

function applyViewFilters(
    query,
    filters
) {

    let currentQuery =
        query;


    if (!isAll(filters.year)) {

        currentQuery =
            currentQuery.eq(
                'year',
                Number(filters.year)
            );

    }


    if (!isAll(filters.fromYear)) {

        currentQuery =
            currentQuery.gte(
                'year',
                Number(filters.fromYear)
            );

    }


    if (!isAll(filters.toYear)) {

        currentQuery =
            currentQuery.lte(
                'year',
                Number(filters.toYear)
            );

    }


    if (!isAll(filters.maker)) {

        currentQuery =
            currentQuery.eq(
                'maker',
                filters.maker
            );

    }


    if (!isAll(filters.region)) {

        currentQuery =
            currentQuery.eq(
                'rto',
                filters.region
            );

    }


    if (!isAll(filters.category)) {

        currentQuery =
            currentQuery.eq(
                'category',
                filters.category
            );

    }


    if (!isAll(filters.subcategory)) {

        currentQuery =
            currentQuery.eq(
                'subcategory',
                filters.subcategory
            );

    }


    return currentQuery;

}


/* ============================================================
   17. FETCH FILTER OPTIONS
   ============================================================ */

async function fetchFilterOptions(
    filters = filterState
) {

    if (!supabaseClient) {

        throw new Error(
            'Supabase client has not been initialized.'
        );

    }


    if (
        DATA_SOURCE.mode === 'rpc'
    ) {

        const {
            data,
            error
        } =
            await supabaseClient.rpc(
                DATA_SOURCE.filterOptionsRpc,
                buildRpcParameters(filters)
            );


        if (error) {
            throw error;
        }


        return normalizeFilterOptions(
            data
        );

    }


    if (
        DATA_SOURCE.mode === 'view'
    ) {

        let query =
            supabaseClient
                .from(DATA_SOURCE.viewName)
                .select(
                    'year,maker,rto,category,subcategory'
                );


        query =
            applyViewFilters(
                query,
                filters
            );


        const {
            data,
            error
        } =
            await query;


        if (error) {
            throw error;
        }


        return normalizeFilterOptions(
            data
        );

    }


    throw new Error(
        `Unsupported DATA_SOURCE mode: ${DATA_SOURCE.mode}`
    );

}


/* ============================================================
   18. LOAD AVAILABLE YEARS
   ============================================================ */

async function loadAvailableYears() {

    if (!supabaseClient) {

        throw new Error(
            'Supabase client has not been initialized.'
        );

    }


    let years = [];


    if (
        DATA_SOURCE.mode === 'rpc'
    ) {

        const {
            data,
            error
        } =
            await supabaseClient.rpc(
                DATA_SOURCE.filterOptionsRpc,
                {}
            );


        if (error) {
            throw error;
        }


        (
            Array.isArray(data)
                ? data
                : []
        ).forEach((row) => {

            const year =
                Number(
                    extractValue(
                        row,
                        [
                            'year',
                            'Year',
                            'YEAR'
                        ]
                    )
                );


            if (
                Number.isFinite(year)
            ) {

                years.push(year);

            }

        });

    }


    if (
        DATA_SOURCE.mode === 'view'
    ) {

        const {
            data,
            error
        } =
            await supabaseClient
                .from(DATA_SOURCE.viewName)
                .select('year');


        if (error) {
            throw error;
        }


        (
            Array.isArray(data)
                ? data
                : []
        ).forEach((row) => {

            const year =
                Number(
                    extractValue(
                        row,
                        [
                            'year',
                            'Year',
                            'YEAR'
                        ]
                    )
                );


            if (
                Number.isFinite(year)
            ) {

                years.push(year);

            }

        });

    }


    applicationState.availableYears =
        [
            ...new Set(years)
        ].sort(
            (a, b) => a - b
        );


    populateYearSelects();

}


/* ============================================================
   19. POPULATE NATIVE SELECT
   ============================================================ */

function populateSelect(
    selectElement,
    values,
    selectedValue = APP_CONFIG.allValue
) {

    if (!selectElement) {
        return;
    }


    const fragment =
        document.createDocumentFragment();


    const allOption =
        document.createElement('option');

    allOption.value =
        APP_CONFIG.allValue;

    allOption.textContent =
        'All';


    fragment.appendChild(
        allOption
    );


    values.forEach((value) => {

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

    });


    selectElement.replaceChildren(
        fragment
    );


    const selectedExists =
        [
            ...selectElement.options
        ].some(
            option =>
                option.value ===
                String(selectedValue)
        );


    selectElement.value =
        selectedExists
            ? String(selectedValue)
            : APP_CONFIG.allValue;

}


/* ============================================================
   20. YEAR SELECTS
   ============================================================ */

function populateYearSelects() {

    const years =
        applicationState.availableYears;


    populateSelect(
        dom.yearFilter,
        years,
        filterState.year
    );


    populateSelect(
        dom.fromYearFilter,
        years,
        filterState.fromYear
    );


    populateSelect(
        dom.toYearFilter,
        years,
        filterState.toYear
    );

}


/* ============================================================
   21. NATIVE FILTER OPTIONS
   ============================================================ */

function setNativeSelectOptions(
    selectElement,
    values,
    selectedValue
) {

    if (!selectElement) {
        return;
    }


    populateSelect(
        selectElement,
        values,
        selectedValue
    );

}


/* ============================================================
   22. SEARCHABLE SELECT RENDERING
   ============================================================ */

function renderSearchableSelect(
    filterName,
    values,
    selectedValue
) {

    const component =
        document.querySelector(
            `.searchable-select[data-filter="${filterName}"]`
        );


    /*
     * If the HTML does not use the custom searchable-select
     * component, simply populate the native select.
     */
    if (!component) {

        const fallbackIdMap = {

            maker:
                'makerFilter',

            region:
                'regionFilter',

            category:
                'categoryFilter',

            subcategory:
                'subcategoryFilter'

        };


        const select =
            getElement(
                fallbackIdMap[filterName]
            );


        setNativeSelectOptions(
            select,
            values,
            selectedValue
        );


        return;

    }


    const targetId =
        component.dataset.target;


    const nativeSelect =
        getElement(targetId);


    const optionsContainer =
        component.querySelector(
            '.searchable-select-options'
        );


    const valueElement =
        component.querySelector(
            '.searchable-select-value'
        );


    if (
        !nativeSelect ||
        !optionsContainer ||
        !valueElement
    ) {

        return;

    }


    const normalizedValues =
        uniqueSorted(values);


    setNativeSelectOptions(
        nativeSelect,
        normalizedValues,
        selectedValue
    );


    const actualValue =
        nativeSelect.value ||
        APP_CONFIG.allValue;


    valueElement.textContent =
        actualValue ===
        APP_CONFIG.allValue
            ? 'All'
            : actualValue;


    optionsContainer.replaceChildren();


    [
        APP_CONFIG.allValue,
        ...normalizedValues
    ].forEach((value) => {

        const button =
            document.createElement(
                'button'
            );


        button.type =
            'button';

        button.className =
            'searchable-select-option';

        button.dataset.value =
            value;

        button.setAttribute(
            'role',
            'option'
        );


        button.textContent =
            value === APP_CONFIG.allValue
                ? 'All'
                : value;


        button.setAttribute(
            'aria-selected',
            value === actualValue
                ? 'true'
                : 'false'
        );


        if (
            value === actualValue
        ) {

            button.classList.add(
                'selected'
            );

        }


        button.addEventListener(
            'click',
            () => {

                selectSearchableValue(
                    component,
                    value
                );

            }
        );


        optionsContainer.appendChild(
            button
        );

    });

}


/* ============================================================
   23. SEARCHABLE SELECT HELPERS
   ============================================================ */

function filterSearchableOptions(
    component
) {

    const input =
        component.querySelector(
            '.searchable-select-input'
        );


    const options =
        component.querySelectorAll(
            '.searchable-select-option'
        );


    if (!input) {
        return;
    }


    const term =
        input.value
            .trim()
            .toLowerCase();


    let visibleCount = 0;


    options.forEach((option) => {

        const matches =
            !term ||
            option.textContent
                .toLowerCase()
                .includes(term);


        option.style.display =
            matches
                ? ''
                : 'none';


        if (matches) {
            visibleCount++;
        }

    });


    let noResults =
        component.querySelector(
            '.searchable-select-no-results'
        );


    if (
        visibleCount === 0
    ) {

        if (!noResults) {

            noResults =
                document.createElement(
                    'div'
                );

            noResults.className =
                'searchable-select-no-results';

            noResults.textContent =
                'No results found.';


            component
                .querySelector(
                    '.searchable-select-options'
                )
                ?.appendChild(
                    noResults
                );

        }

    } else if (noResults) {

        noResults.remove();

    }

}


function openSearchableSelect(
    component
) {

    closeAllSearchableSelects(
        component
    );


    component.classList.add(
        'open'
    );


    const trigger =
        component.querySelector(
            '.searchable-select-trigger'
        );


    const input =
        component.querySelector(
            '.searchable-select-input'
        );


    trigger?.setAttribute(
        'aria-expanded',
        'true'
    );


    if (input) {

        input.value = '';

        filterSearchableOptions(
            component
        );


        requestAnimationFrame(
            () => input.focus()
        );

    }

}


function closeSearchableSelect(
    component
) {

    component.classList.remove(
        'open'
    );


    const trigger =
        component.querySelector(
            '.searchable-select-trigger'
        );


    const input =
        component.querySelector(
            '.searchable-select-input'
        );


    trigger?.setAttribute(
        'aria-expanded',
        'false'
    );


    if (input) {
        input.value = '';
    }

}


function closeAllSearchableSelects(
    except = null
) {

    document
        .querySelectorAll(
            '.searchable-select.open'
        )
        .forEach((component) => {

            if (
                component !== except
            ) {

                closeSearchableSelect(
                    component
                );

            }

        });

}


function selectSearchableValue(
    component,
    value
) {

    const nativeSelect =
        getElement(
            component.dataset.target
        );


    if (!nativeSelect) {
        return;
    }


    nativeSelect.value =
        value;


    const valueElement =
        component.querySelector(
            '.searchable-select-value'
        );


    if (valueElement) {

        valueElement.textContent =
            value === APP_CONFIG.allValue
                ? 'All'
                : value;

    }


    closeSearchableSelect(
        component
    );


    nativeSelect.dispatchEvent(
        new Event(
            'change',
            {
                bubbles: true
            }
        )
    );

}


/* ============================================================
   24. INITIALIZE SEARCHABLE SELECTS
   ============================================================ */

function initializeSearchableSelects() {

    const components =
        document.querySelectorAll(
            '.searchable-select'
        );


    components.forEach((component) => {

        if (
            component.dataset.initialized ===
            'true'
        ) {

            return;

        }


        const trigger =
            component.querySelector(
                '.searchable-select-trigger'
            );


        const input =
            component.querySelector(
                '.searchable-select-input'
            );


        trigger?.addEventListener(
            'click',
            (event) => {

                event.preventDefault();


                if (
                    component.classList.contains(
                        'open'
                    )
                ) {

                    closeSearchableSelect(
                        component
                    );

                } else {

                    openSearchableSelect(
                        component
                    );

                }

            }
        );


        input?.addEventListener(
            'input',
            () => {

                filterSearchableOptions(
                    component
                );

            }
        );


        input?.addEventListener(
            'keydown',
            (event) => {

                if (
                    event.key === 'Escape'
                ) {

                    closeSearchableSelect(
                        component
                    );

                    trigger?.focus();

                }

            }
        );


        component.dataset.initialized =
            'true';

    });


    document.addEventListener(
        'click',
        (event) => {

            if (
                !event.target.closest(
                    '.searchable-select'
                )
            ) {

                closeAllSearchableSelects();

            }

        }
    );

}


/* ============================================================
   25. LOAD FILTER OPTIONS
   ============================================================ */

async function loadFilterOptions(
    filters = filterState
) {

    applicationState.updatingFilterOptions =
        true;


    try {

        const options =
            await fetchFilterOptions(
                filters
            );


        applicationState.filterOptions =
            options;


        renderSearchableSelect(
            'maker',
            options.makers,
            filterState.maker
        );


        renderSearchableSelect(
            'region',
            options.regions,
            filterState.region
        );


        renderSearchableSelect(
            'category',
            options.categories,
            filterState.category
        );


        renderSearchableSelect(
            'subcategory',
            options.subcategories,
            filterState.subcategory
        );

    } finally {

        applicationState.updatingFilterOptions =
            false;

    }

}


/* ============================================================
   26. FETCH DASHBOARD DATA
   ============================================================ */

async function fetchDashboardData(
    filters
) {

    if (!supabaseClient) {

        throw new Error(
            'Supabase client has not been initialized.'
        );

    }


    if (
        DATA_SOURCE.mode === 'rpc'
    ) {

        const {
            data,
            error
        } =
            await supabaseClient.rpc(
                DATA_SOURCE.summaryRpc,
                buildRpcParameters(filters)
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
                .from(DATA_SOURCE.viewName)
                .select('*');


        query =
            applyViewFilters(
                query,
                filters
            );


        const {
            data,
            error
        } =
            await query;


        if (error) {
            throw error;
        }


        return Array.isArray(data)
            ? data
            : [];

    }


    throw new Error(
        `Unsupported DATA_SOURCE mode: ${DATA_SOURCE.mode}`
    );

}


/* ============================================================
   27. FETCH KPI DATA
   ============================================================ */

async function fetchKPIData(
    filters
) {

    if (!supabaseClient) {

        throw new Error(
            'Supabase client has not been initialized.'
        );

    }


    if (
        DATA_SOURCE.mode === 'rpc'
    ) {

        const {
            data,
            error
        } =
            await supabaseClient.rpc(
                DATA_SOURCE.kpiRpc,
                buildRpcParameters(filters)
            );


        if (error) {
            throw error;
        }


        if (Array.isArray(data)) {

            return data[0] || {};

        }


        return data || {};

    }


    /*
     * View mode fallback.
     */
    if (
        DATA_SOURCE.mode === 'view'
    ) {

        let query =
            supabaseClient
                .from(DATA_SOURCE.viewName)
                .select(
                    'maker,category,registrations'
                );


        query =
            applyViewFilters(
                query,
                filters
            );


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


        let total = 0;
        let twoW = 0;
        let threeW = 0;


        rows.forEach((row) => {

            const registrations =
                toNumber(
                    row.registrations
                );


            total += registrations;


            const category =
                String(
                    row.category || ''
                )
                    .trim()
                    .toLowerCase();


            if (
                category.includes(
                    '2-wheeler'
                ) ||
                category.includes(
                    '2 wheeler'
                ) ||
                category.includes(
                    'two wheeler'
                )
            ) {

                twoW += registrations;

            }


            if (
                category.includes(
                    '3-wheeler'
                ) ||
                category.includes(
                    '3 wheeler'
                ) ||
                category.includes(
                    'three wheeler'
                )
            ) {

                threeW += registrations;

            }

        });


        return {

            totalRegistrations:
                total,

            totalMakers:
                new Set(
                    rows
                        .map(
                            row =>
                                String(
                                    row.maker || ''
                                ).trim()
                        )
                        .filter(Boolean)
                ).size,

            twoWRegistrations:
                twoW,

            threeWRegistrations:
                threeW

        };

    }


    return {};

}


/* ============================================================
   28. NORMALIZE MAKER ROW
   ============================================================ */

function normalizeMakerRow(row) {

    const maker =
        extractValue(
            row,
            [
                'maker',
                'Maker',
                'MAKER',
                'maker_name',
                'makerName'
            ]
        );


    const registrations =
        extractValue(
            row,
            [
                'registrations',
                'registration',
                'totalRegistrations',
                'total_registrations',
                'total',
                'Total',
                'TOTAL',
                'count',
                'value'
            ]
        );


    const marketShare =
        extractValue(
            row,
            [
                'marketShare',
                'market_share',
                'market_share_percentage',
                'marketSharePercentage'
            ]
        );


    return {

        maker:
            String(
                maker || ''
            ).trim(),

        registrations:
            toNumber(
                registrations
            ),

        marketShare:
            marketShare === ''
                ? null
                : toNumber(
                    marketShare
                )

    };

}


/* ============================================================
   29. MARKET SHARE
   ============================================================ */

function calculateMarketShare(
    rows,
    total
) {

    const safeTotal =
        toNumber(total);


    return rows.map((row) => {

        const registrations =
            toNumber(
                row.registrations
            );


        return {

            ...row,

            registrations,

            marketShare:
                safeTotal > 0
                    ? (
                        registrations /
                        safeTotal
                    ) * 100
                    : 0

        };

    });

}


/* ============================================================
   30. FALLBACK KPI CALCULATION
   ============================================================ */

function calculateFallbackKPIs(rows) {

    const totalRegistrations =
        rows.reduce(
            (sum, row) =>
                sum +
                toNumber(
                    row.registrations
                ),
            0
        );


    const totalMakers =
        new Set(
            rows
                .map(
                    row =>
                        String(
                            row.maker || ''
                        ).trim()
                )
                .filter(Boolean)
        ).size;


    return {

        totalRegistrations,

        totalMakers,

        twoWRegistrations:
            null,

        threeWRegistrations:
            null,

        twoWPercentage:
            null,

        threeWPercentage:
            null

    };

}


/* ============================================================
   31. APPLY FILTERS
   ============================================================ */

async function applyFilters() {

    const requestId =
        ++applicationState.requestId;


    clearError();


    const filters =
        getSelectedFilters();


    const validation =
        validateFilters(
            filters
        );


    if (
        !validation.valid
    ) {

        displayError(
            validation.errors.join(' ')
        );

        return;

    }


    /*
     * If a year range is being used,
     * ignore the individual year.
     */
    if (
        !isAll(filters.fromYear) ||
        !isAll(filters.toYear)
    ) {

        filters.year =
            APP_CONFIG.allValue;


        if (dom.yearFilter) {

            dom.yearFilter.value =
                APP_CONFIG.allValue;

        }

    }


    Object.assign(
        filterState,
        filters
    );


    applicationState.currentPage =
        1;


    showLoading();


    try {

        const rawRows =
            await fetchDashboardData(
                filterState
            );


        if (
            requestId !==
            applicationState.requestId
        ) {

            return;

        }


        const normalizedRows =
            rawRows
                .map(
                    normalizeMakerRow
                )
                .filter(
                    row =>
                        row.maker
                );


        const total =
            normalizedRows.reduce(
                (sum, row) =>
                    sum +
                    toNumber(
                        row.registrations
                    ),
                0
            );


        applicationState.makerRows =
            calculateMarketShare(
                normalizedRows,
                total
            );


        /*
         * KPI RPC.
         */
        let kpiData = null;


        try {

            kpiData =
                await fetchKPIData(
                    filterState
                );

        } catch (error) {

            console.warn(
                'KPI RPC failed. Using fallback KPI calculation.',
                error
            );

        }


        if (
            requestId !==
            applicationState.requestId
        ) {

            return;

        }


        const fallback =
            calculateFallbackKPIs(
                applicationState.makerRows
            );


        const kpiTotal =
            extractValue(
                kpiData,
                [
                    'totalRegistrations',
                    'total_registrations',
                    'total'
                ]
            );


        const kpiMakers =
            extractValue(
                kpiData,
                [
                    'totalMakers',
                    'total_makers',
                    'makerCount',
                    'maker_count'
                ]
            );


        const kpiTwoW =
            extractValue(
                kpiData,
                [
                    'twoWRegistrations',
                    'two_w_registrations',
                    'two_wheeler_registrations',
                    'twoW'
                ]
            );


        const kpiThreeW =
            extractValue(
                kpiData,
                [
                    'threeWRegistrations',
                    'three_w_registrations',
                    'three_wheeler_registrations',
                    'threeW'
                ]
            );


        const hasKpiTotal =
            kpiTotal !== '';


        const hasKpiMakers =
            kpiMakers !== '';


        const hasKpiTwoW =
            kpiTwoW !== '';


        const hasKpiThreeW =
            kpiThreeW !== '';


        const finalKPIs = {

            totalRegistrations:
                hasKpiTotal
                    ? toNumber(kpiTotal)
                    : fallback.totalRegistrations,

            totalMakers:
                hasKpiMakers
                    ? toNumber(kpiMakers)
                    : fallback.totalMakers,

            twoWRegistrations:
                hasKpiTwoW
                    ? toNumber(kpiTwoW)
                    : null,

            threeWRegistrations:
                hasKpiThreeW
                    ? toNumber(kpiThreeW)
                    : null

        };


        finalKPIs.twoWPercentage =
            finalKPIs.twoWRegistrations !== null &&
            finalKPIs.totalRegistrations > 0
                ? (
                    finalKPIs.twoWRegistrations /
                    finalKPIs.totalRegistrations
                ) * 100
                : null;


        finalKPIs.threeWPercentage =
            finalKPIs.threeWRegistrations !== null &&
            finalKPIs.totalRegistrations > 0
                ? (
                    finalKPIs.threeWRegistrations /
                    finalKPIs.totalRegistrations
                ) * 100
                : null;


        applicationState.kpis =
            finalKPIs;


        updateKPIs();

        updateMakerTable();

        updateActiveFilters();

        updateDataYearRange();


        /*
         * Refresh contextual filter options.
         */
        try {

            await loadFilterOptions(
                filterState
            );

        } catch (error) {

            console.warn(
                'Unable to refresh filter options.',
                error
            );

        }

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


        displayError(
            error?.message ||
            'Unable to load dashboard data.'
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
   32. RESET FILTERS
   ============================================================ */

async function resetFilters() {

    /*
     * Reset native filters.
     */
    [
        'yearFilter',
        'fromYearFilter',
        'toYearFilter',
        'makerFilter',
        'regionFilter',
        'categoryFilter',
        'subcategoryFilter'
    ].forEach((id) => {

        const element =
            getElement(id);


        if (element) {

            element.value =
                APP_CONFIG.allValue;

        }

    });


    /*
     * Reset application filter state.
     */
    Object.keys(filterState).forEach(
        (key) => {

            filterState[key] =
                APP_CONFIG.allValue;

        }
    );


    /*
     * Reset multi-maker searches.
     */
    resetMakerSearches();


    applicationState.currentPage =
        1;


    clearError();


    try {

        await loadFilterOptions(
            filterState
        );

    } catch (error) {

        console.warn(
            'Unable to reload filter options.',
            error
        );

    }


    await applyFilters();

}


/* ============================================================
   33. KPI RENDERING
   ============================================================ */

function updateKPIs() {

    const kpis =
        applicationState.kpis;


    setText(
        'totalRegistrations',
        formatIndianNumber(
            kpis.totalRegistrations
        )
    );


    setText(
        'totalMakers',
        formatIndianNumber(
            kpis.totalMakers
        )
    );


    if (
        kpis.twoWRegistrations ===
        null
    ) {

        setText(
            'twoWRegistrations',
            '—'
        );


        setText(
            'twoWPercentage',
            '—'
        );

    } else {

        setText(
            'twoWRegistrations',
            formatIndianNumber(
                kpis.twoWRegistrations
            )
        );


        setText(
            'twoWPercentage',
            formatPercentage(
                kpis.twoWPercentage
            )
        );

    }


    if (
        kpis.threeWRegistrations ===
        null
    ) {

        setText(
            'threeWRegistrations',
            '—'
        );


        setText(
            'threeWPercentage',
            '—'
        );

    } else {

        setText(
            'threeWRegistrations',
            formatIndianNumber(
                kpis.threeWRegistrations
            )
        );


        setText(
            'threeWPercentage',
            formatPercentage(
                kpis.threeWPercentage
            )
        );

    }

}


/* ============================================================
   34. MULTI-MAKER SEARCH STYLES
   ============================================================ */

function injectMultiMakerSearchStyles() {

    if (
        document.getElementById(
            'multiMakerSearchStyles'
        )
    ) {

        return;

    }


    const style =
        document.createElement(
            'style'
        );


    style.id =
        'multiMakerSearchStyles';


    style.textContent = `

        .maker-search-multi {
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 100%;
        }

        .maker-search-row {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
        }

        .maker-search-row
        .maker-search-input {
            flex: 1 1 auto;
            min-width: 0;
            width: 100%;
        }

        .maker-search-action {
            width: 38px;
            height: 38px;
            min-width: 38px;
            flex: 0 0 38px;

            display: inline-grid;
            place-items: center;

            padding: 0;

            border: 1px solid
                var(--border, #e2e8f0);

            border-radius:
                var(--radius-sm, 8px);

            background:
                var(--surface, #ffffff);

            color:
                var(--primary, #2563eb);

            font-size: 21px;
            font-weight: 600;
            line-height: 1;

            transition:
                background-color .15s ease,
                border-color .15s ease,
                color .15s ease,
                transform .15s ease;
        }

        .maker-search-action:hover {
            background:
                var(--primary-soft, #eff6ff);

            border-color:
                #bfdbfe;

            color:
                var(--primary-dark, #1d4ed8);
        }

        .maker-search-action:active {
            transform:
                translateY(1px);
        }

        .maker-search-remove {
            color:
                var(--danger, #dc2626);

            font-size: 19px;
        }

        .maker-search-remove:hover {
            background:
                #fef2f2;

            border-color:
                #fecaca;

            color:
                #b91c1c;
        }

        .maker-search-hint {
            color:
                var(--text-muted, #94a3b8);

            font-size: 10px;
            line-height: 1.4;
        }

        @media (max-width: 700px) {

            .maker-search-multi {
                width: 100%;
            }

            .maker-search-action {
                width: 36px;
                min-width: 36px;
                flex-basis: 36px;
            }

        }

    `;


    document.head.appendChild(
        style
    );

}


/* ============================================================
   35. CREATE ADDITIONAL MAKER SEARCH
   ============================================================ */

function createMakerSearchInput(
    term = ''
) {

    const row =
        document.createElement(
            'div'
        );


    row.className =
        'maker-search-row';


    row.dataset.makerSearchRow =
        'true';


    const input =
        document.createElement(
            'input'
        );


    input.type =
        'search';


    input.className =
        'table-search maker-search-input';


    input.value =
        term;


    input.placeholder =
        'Search another maker...';


    input.setAttribute(
        'aria-label',
        'Search another maker'
    );


    row.appendChild(
        input
    );


    const removeButton =
        document.createElement(
            'button'
        );


    removeButton.type =
        'button';


    removeButton.className =
        'maker-search-action maker-search-remove';


    removeButton.textContent =
        '×';


    removeButton.title =
        'Remove maker search';


    removeButton.setAttribute(
        'aria-label',
        'Remove maker search'
    );


    removeButton.addEventListener(
        'click',
        () => {

            row.remove();


            syncMakerSearchTermsFromUI();


            applicationState.currentPage =
                1;


            updateMakerTable();

        }
    );


    row.appendChild(
        removeButton
    );


    input.addEventListener(
        'input',
        () => {

            clearTimeout(
                applicationState.searchTimer
            );


            applicationState.searchTimer =
                setTimeout(
                    () => {

                        syncMakerSearchTermsFromUI();


                        applicationState.currentPage =
                            1;


                        updateMakerTable();

                    },
                    APP_CONFIG.searchDebounceMs
                );

        }
    );


    return row;

}


/* ============================================================
   36. INITIALIZE MULTI-MAKER SEARCH
   ============================================================ */

function initializeMultiMakerSearch() {

    const input =
        dom.makerSearch;


    if (!input) {

        console.warn(
            'makerSearch input was not found.'
        );

        return;

    }


    if (
        input.dataset.multiMakerInitialized ===
        'true'
    ) {

        return;

    }


    injectMultiMakerSearchStyles();


    const originalParent =
        input.parentElement;


    if (!originalParent) {
        return;
    }


    /*
     * Prevent duplicate initialization.
     */
    const existingWrapper =
        document.getElementById(
            'makerMultiSearch'
        );


    if (existingWrapper) {

        input.dataset.multiMakerInitialized =
            'true';

        return;

    }


    const wrapper =
        document.createElement(
            'div'
        );


    wrapper.className =
        'maker-search-multi';


    wrapper.id =
        'makerMultiSearch';


    /*
     * First search row.
     */
    const firstRow =
        document.createElement(
            'div'
        );


    firstRow.className =
        'maker-search-row';


    firstRow.dataset.makerSearchRow =
        'true';


    input.classList.add(
        'maker-search-input'
    );


    input.placeholder =
        input.placeholder ||
        'Search maker...';


    input.setAttribute(
        'aria-label',
        'Search maker'
    );


    firstRow.appendChild(
        input
    );


    /*
     * PLUS BUTTON
     */
    const addButton =
        document.createElement(
            'button'
        );


    addButton.type =
        'button';


    addButton.className =
        'maker-search-action maker-search-add';


    addButton.textContent =
        '+';


    addButton.title =
        'Add another maker search';


    addButton.setAttribute(
        'aria-label',
        'Add another maker search'
    );


    firstRow.appendChild(
        addButton
    );


    wrapper.appendChild(
        firstRow
    );


    /*
     * Helpful text.
     */
    const hint =
        document.createElement(
            'div'
        );


    hint.className =
        'maker-search-hint';


    hint.textContent =
        'Use + to compare multiple makers. Results match any search.';


    wrapper.appendChild(
        hint
    );


    originalParent.appendChild(
        wrapper
    );


    /*
     * FIRST SEARCH INPUT
     */
    input.addEventListener(
        'input',
        () => {

            clearTimeout(
                applicationState.searchTimer
            );


            applicationState.searchTimer =
                setTimeout(
                    () => {

                        syncMakerSearchTermsFromUI();


                        applicationState.currentPage =
                            1;


                        updateMakerTable();

                    },
                    APP_CONFIG.searchDebounceMs
                );

        }
    );


    /*
     * PLUS BUTTON
     */
    addButton.addEventListener(
        'click',
        () => {

            const currentTerms =
                syncMakerSearchTermsFromUI();


            const newRow =
                createMakerSearchInput(
                    ''
                );


            /*
             * Insert before the hint.
             */
            wrapper.insertBefore(
                newRow,
                hint
            );


            applicationState.makerSearchTerms =
                currentTerms;


            applicationState.currentPage =
                1;


            updateMakerTable();


            /*
             * Automatically focus the new
             * search field.
             */
            const newInput =
                newRow.querySelector(
                    '.maker-search-input'
                );


            newInput?.focus();

        }
    );


    input.dataset.multiMakerInitialized =
        'true';


    applicationState.makerSearchTerms =
        [''];

}


/* ============================================================
   37. SYNC MAKER SEARCH TERMS
   ============================================================ */

function syncMakerSearchTermsFromUI() {

    const wrapper =
        document.getElementById(
            'makerMultiSearch'
        );


    if (!wrapper) {

        const fallback =
            dom.makerSearch?.value
                ?.trim() || '';


        applicationState.makerSearchTerms =
            fallback
                ? [fallback]
                : [''];


        applicationState.searchTerm =
            fallback;


        return applicationState.makerSearchTerms;

    }


    const terms =
        [
            ...wrapper.querySelectorAll(
                '.maker-search-input'
            )
        ]
            .map(
                input =>
                    input.value.trim()
            )
            .filter(Boolean);


    applicationState.makerSearchTerms =
        terms.length
            ? terms
            : [''];


    /*
     * Keep legacy searchTerm updated.
     */
    applicationState.searchTerm =
        terms[0] || '';


    return applicationState.makerSearchTerms;

}


/* ============================================================
   38. RESET MAKER SEARCHES
   ============================================================ */

function resetMakerSearches() {

    const wrapper =
        document.getElementById(
            'makerMultiSearch'
        );


    if (!wrapper) {

        applicationState.makerSearchTerms =
            [''];

        applicationState.searchTerm =
            '';


        if (dom.makerSearch) {

            dom.makerSearch.value =
                '';

        }


        return;

    }


    /*
     * Remove all additional search rows.
     */
    const rows =
        [
            ...wrapper.querySelectorAll(
                '.maker-search-row'
            )
        ];


    rows
        .slice(1)
        .forEach(
            row =>
                row.remove()
        );


    /*
     * Clear first input.
     */
    const firstInput =
        wrapper.querySelector(
            '.maker-search-input'
        );


    if (firstInput) {

        firstInput.value =
            '';

    }


    applicationState.makerSearchTerms =
        [''];


    applicationState.searchTerm =
        '';

}


/* ============================================================
   39. FILTER TABLE DATA
   ============================================================ */

function filterTableData(rows) {

    const terms =
        (
            applicationState.makerSearchTerms ||
            ['']
        )
            .map(
                term =>
                    String(
                        term || ''
                    )
                        .trim()
                        .toLowerCase()
            )
            .filter(Boolean);


    /*
     * No search terms = show everything.
     */
    if (!terms.length) {

        return [
            ...rows
        ];

    }


    /*
     * IMPORTANT:
     *
     * Multiple maker searches use OR logic.
     *
     * Search:
     *     Hero
     *     Honda
     *     TVS
     *
     * A row is shown if the maker name matches
     * ANY of those terms.
     */
    return rows.filter(
        (row) => {

            const maker =
                String(
                    row.maker || ''
                ).toLowerCase();


            return terms.some(
                term =>
                    maker.includes(term)
            );

        }
    );

}


/* ============================================================
   40. SORT TABLE DATA
   ============================================================ */

function sortTableData(rows) {

    const sorted =
        [...rows];


    const direction =
        applicationState.sortDirection ===
            'asc'
            ? 1
            : -1;


    const key =
        applicationState.sortKey;


    sorted.sort(
        (a, b) => {

            if (
                key === 'maker'
            ) {

                return (
                    String(
                        a.maker || ''
                    ).localeCompare(
                        String(
                            b.maker || ''
                        ),
                        undefined,
                        {
                            sensitivity:
                                'base'
                        }
                    ) *
                    direction
                );

            }


            const aValue =
                toNumber(
                    a[key]
                );


            const bValue =
                toNumber(
                    b[key]
                );


            return (
                aValue -
                bValue
            ) * direction;

        }
    );


    return sorted;

}


/* ============================================================
   41. UPDATE MAKER TABLE
   ============================================================ */

function updateMakerTable() {

    const allRows =
        applicationState.makerRows;


    /*
     * Apply multiple maker searches.
     */
    const searchedRows =
        filterTableData(
            allRows
        );


    /*
     * Apply sorting.
     */
    const sortedRows =
        sortTableData(
            searchedRows
        );


    const totalPages =
        Math.max(
            1,
            Math.ceil(
                sortedRows.length /
                applicationState.pageSize
            )
        );


    /*
     * Prevent current page from exceeding
     * available pages after searching.
     */
    if (
        applicationState.currentPage >
        totalPages
    ) {

        applicationState.currentPage =
            totalPages;

    }


    const start =
        (
            applicationState.currentPage -
            1
        ) *
        applicationState.pageSize;


    const end =
        start +
        applicationState.pageSize;


    const pageRows =
        sortedRows.slice(
            start,
            end
        );


    renderMakerRows(
        pageRows
    );


    /*
     * Footer should represent the
     * currently visible search result set,
     * not the entire dashboard.
     */
    updateTableFooter(
        searchedRows
    );


    updatePagination(
        sortedRows.length,
        totalPages
    );


    if (
        sortedRows.length === 0
    ) {

        showEmptyState();

    } else {

        hideEmptyState();

    }

}


/* ============================================================
   42. RENDER MAKER ROWS
   ============================================================ */

function renderMakerRows(rows) {

    if (
        !dom.makerSummaryTableBody
    ) {

        return;

    }


    const fragment =
        document.createDocumentFragment();


    rows.forEach((row) => {

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


        registrationsCell.className =
            'numeric-column';


        registrationsCell.textContent =
            formatIndianNumber(
                row.registrations
            );


        const shareCell =
            document.createElement(
                'td'
            );


        shareCell.className =
            'numeric-column';


        shareCell.textContent =
            formatPercentage(
                row.marketShare
            );


        tr.appendChild(
            makerCell
        );


        tr.appendChild(
            registrationsCell
        );


        tr.appendChild(
            shareCell
        );


        fragment.appendChild(
            tr
        );

    });


    dom.makerSummaryTableBody.replaceChildren(
        fragment
    );

}


/* ============================================================
   43. UPDATE TABLE FOOTER
   ============================================================ */

function updateTableFooter(rows) {

    const total =
        rows.reduce(
            (sum, row) =>
                sum +
                toNumber(
                    row.registrations
                ),
            0
        );


    const marketShare =
        rows.reduce(
            (sum, row) =>
                sum +
                toNumber(
                    row.marketShare
                ),
            0
        );


    setText(
        'makerSummaryTotal',
        formatIndianNumber(
            total
        )
    );


    setText(
        'makerSummaryMarketShare',
        total > 0
            ? `${marketShare.toFixed(2)}%`
            : '0.00%'
    );

}


/* ============================================================
   44. PAGINATION
   ============================================================ */

function updatePagination(
    resultCount,
    totalPages
) {

    const currentPage =
        applicationState.currentPage;


    if (
        dom.pageIndicator
    ) {

        dom.pageIndicator.textContent =
            `Page ${currentPage} of ${totalPages}`;

    }


    if (
        dom.previousPageButton
    ) {

        dom.previousPageButton.disabled =
            currentPage <= 1;

    }


    if (
        dom.nextPageButton
    ) {

        dom.nextPageButton.disabled =
            currentPage >= totalPages;

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

    const searchedRows =
        filterTableData(
            applicationState.makerRows
        );


    const totalPages =
        Math.max(
            1,
            Math.ceil(
                searchedRows.length /
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


/* ============================================================
   45. ACTIVE FILTERS
   ============================================================ */

function updateActiveFilters() {

    if (
        !dom.activeFilters
    ) {

        return;

    }


    dom.activeFilters.replaceChildren();


    const filters = [

        {
            label: 'Year',
            value:
                filterState.year
        },

        {
            label: 'From',
            value:
                filterState.fromYear
        },

        {
            label: 'To',
            value:
                filterState.toYear
        },

        {
            label: 'Maker',
            value:
                filterState.maker
        },

        {
            label: 'Region / RTO',
            value:
                filterState.region
        },

        {
            label: 'Category',
            value:
                filterState.category
        },

        {
            label: 'Subcategory',
            value:
                filterState.subcategory
        }

    ];


    const active =
        filters.filter(
            filter =>
                !isAll(
                    filter.value
                )
        );


    if (!active.length) {

        const empty =
            document.createElement(
                'span'
            );


        empty.className =
            'active-filter--empty';


        empty.textContent =
            'No active filters';


        dom.activeFilters.appendChild(
            empty
        );


        return;

    }


    active.forEach(
        (filter) => {

            const badge =
                document.createElement(
                    'span'
                );


            badge.className =
                'active-filter';


            const label =
                document.createElement(
                    'strong'
                );


            label.textContent =
                `${filter.label}:`;


            const value =
                document.createElement(
                    'span'
                );


            value.textContent =
                filter.value;


            badge.appendChild(
                label
            );


            badge.appendChild(
                value
            );


            dom.activeFilters.appendChild(
                badge
            );

        }
    );

}


/* ============================================================
   46. DATA YEAR RANGE
   ============================================================ */

function updateDataYearRange() {

    const years =
        applicationState.availableYears;


    if (!years.length) {

        setText(
            'data-year-range',
            '—'
        );

        return;

    }


    if (
        years.length === 1
    ) {

        setText(
            'data-year-range',
            String(
                years[0]
            )
        );

        return;

    }


    setText(
        'data-year-range',
        `${years[0]}–${years[years.length - 1]}`
    );

}


/* ============================================================
   47. LOADING
   ============================================================ */

function showLoading() {

    dom.globalLoading?.classList.remove(
        'hidden'
    );


    dom.tableLoading?.classList.remove(
        'hidden'
    );

}


function hideLoading() {

    dom.globalLoading?.classList.add(
        'hidden'
    );


    dom.tableLoading?.classList.add(
        'hidden'
    );

}


/* ============================================================
   48. ERROR HANDLING
   ============================================================ */

function displayError(message) {

    if (
        !dom.errorMessage
    ) {

        return;

    }


    dom.errorMessage.textContent =
        message;


    dom.errorMessage.classList.remove(
        'hidden'
    );

}


function clearError() {

    dom.errorMessage?.classList.add(
        'hidden'
    );


    if (
        dom.errorMessage
    ) {

        dom.errorMessage.textContent =
            '';

    }

}


/* ============================================================
   49. EMPTY STATE
   ============================================================ */

function showEmptyState() {

    dom.tableEmptyState?.classList.remove(
        'hidden'
    );

}


function hideEmptyState() {

    dom.tableEmptyState?.classList.add(
        'hidden'
    );

}


/* ============================================================
   50. EVENT LISTENERS
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


    filterIds.forEach(
        (id) => {

            const element =
                getElement(id);


            if (!element) {
                return;
            }


            element.addEventListener(
                'change',
                async () => {

                    if (
                        applicationState
                            .updatingFilterOptions
                    ) {

                        return;

                    }


                    /*
                     * From Year / To Year selected:
                     * clear single Year.
                     */
                    if (
                        id ===
                            'fromYearFilter' ||
                        id ===
                            'toYearFilter'
                    ) {

                        const from =
                            dom.fromYearFilter
                                ?.value;


                        const to =
                            dom.toYearFilter
                                ?.value;


                        if (
                            !isAll(from) ||
                            !isAll(to)
                        ) {

                            if (
                                dom.yearFilter
                            ) {

                                dom.yearFilter.value =
                                    APP_CONFIG.allValue;

                            }

                        }

                    }


                    /*
                     * Single Year selected:
                     * clear range.
                     */
                    if (
                        id ===
                        'yearFilter'
                    ) {

                        if (
                            !isAll(
                                dom.yearFilter
                                    ?.value
                            )
                        ) {

                            if (
                                dom.fromYearFilter
                            ) {

                                dom.fromYearFilter.value =
                                    APP_CONFIG.allValue;

                            }


                            if (
                                dom.toYearFilter
                            ) {

                                dom.toYearFilter.value =
                                    APP_CONFIG.allValue;

                            }

                        }

                    }


                    await applyFilters();

                }
            );

        }
    );


    /*
     * Clear filters.
     */
    dom.clearFiltersButton?.addEventListener(
        'click',
        resetFilters
    );


    /*
     * Pagination.
     */
    dom.previousPageButton?.addEventListener(
        'click',
        goToPreviousPage
    );


    dom.nextPageButton?.addEventListener(
        'click',
        goToNextPage
    );


    /*
     * Page size.
     */
    dom.pageSizeSelect?.addEventListener(
        'change',
        () => {

            const size =
                Number(
                    dom.pageSizeSelect.value
                );


            if (
                APP_CONFIG.pageSizes.includes(
                    size
                )
            ) {

                applicationState.pageSize =
                    size;

            }


            applicationState.currentPage =
                1;


            updateMakerTable();

        }
    );


    /*
     * Table sorting.
     */
    document
        .querySelectorAll(
            '#makerSummaryTable th.sortable'
        )
        .forEach(
            (header) => {

                header.addEventListener(
                    'click',
                    () => {

                        const key =
                            header.dataset.sortKey;


                        if (!key) {
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
                );

            }
        );

}


/* ============================================================
   51. INITIALIZE DASHBOARD
   ============================================================ */

async function initializeDashboard() {

    if (
        applicationState.initializing ||
        applicationState.initialized
    ) {

        return;

    }


    applicationState.initializing =
        true;


    try {

        /*
         * Cache HTML elements.
         */
        cacheDOMElements();


        /*
         * Initialize custom dropdowns.
         */
        initializeSearchableSelects();


        /*
         * IMPORTANT:
         * Initialize multi-maker search BEFORE
         * loading the dashboard data.
         */
        initializeMultiMakerSearch();


        /*
         * Attach dashboard events.
         */
        attachEventListeners();


        /*
         * Set default page size.
         */
        if (
            dom.pageSizeSelect
        ) {

            dom.pageSizeSelect.value =
                String(
                    applicationState.pageSize
                );

        }


        /*
         * Initialize Supabase.
         */
        await initializeSupabase();


        /*
         * Load available years.
         */
        await loadAvailableYears();


        /*
         * Load filter options.
         */
        await loadFilterOptions(
            filterState
        );


        /*
         * Load dashboard.
         */
        await applyFilters();


        applicationState.initialized =
            true;

    } catch (error) {

        console.error(
            'Dashboard initialization failed:',
            error
        );


        hideLoading();


        displayError(
            error?.message ||
            'Unable to load dashboard data. Please try again.'
        );

    } finally {

        applicationState.initializing =
            false;

    }

}


/* ============================================================
   52. START APPLICATION
   ============================================================ */

if (
    document.readyState ===
    'loading'
) {

    document.addEventListener(
        'DOMContentLoaded',
        initializeDashboard,
        {
            once: true
        }
    );

} else {

    initializeDashboard();

}
