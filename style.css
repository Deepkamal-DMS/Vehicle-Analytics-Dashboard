/* =========================================================
   VEHICLE REGISTRATION ANALYTICS DASHBOARD
   File: /style.css

   VISUAL STYLE:
   - Dark navy filter sidebar
   - Clean white dashboard surface
   - Poppins typography
   - Professional blue accent system
   - Rounded cards
   - Compact enterprise dashboard spacing
   - Searchable / polished filter controls
   ========================================================= */


/* =========================================================
   1. DESIGN TOKENS
   ========================================================= */

:root {

    /* Primary */
    --primary: #2563eb;
    --primary-dark: #1d4ed8;
    --primary-soft: #eff6ff;

    /* Status */
    --success: #16a34a;
    --success-soft: #f0fdf4;

    --danger: #dc2626;
    --danger-soft: #fef2f2;

    --warning: #d97706;
    --warning-soft: #fffbeb;

    /* Page */
    --page: #f5f7fb;
    --surface: #ffffff;
    --surface-soft: #f8fafc;

    /* Text */
    --text: #111827;
    --text-secondary: #475569;
    --text-muted: #94a3b8;
    --text-light: #cbd5e1;

    /* Borders */
    --border: #e2e8f0;
    --border-dark: #cbd5e1;

    /* Table */
    --row-alt: #fbfcfe;
    --row-hover: #f8fafc;

    /* Sidebar */
    --sidebar: #0f172a;
    --sidebar-soft: #172033;
    --sidebar-hover: #1d293b;
    --sidebar-border: #334155;

    --sidebar-text: #f8fafc;
    --sidebar-secondary: #cbd5e1;
    --sidebar-muted: #94a3b8;

    /* Radius */
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 18px;
    --radius-xl: 20px;

    /* Shadows */
    --shadow-xs:
        0 1px 2px rgba(15, 23, 42, 0.04);

    --shadow-sm:
        0 2px 8px rgba(15, 23, 42, 0.05);

    --shadow-md:
        0 8px 24px rgba(15, 23, 42, 0.07);

    --shadow-lg:
        0 16px 40px rgba(15, 23, 42, 0.10);

    /* Layout */
    --sidebar-width: 300px;
    --header-height: 76px;
    --content-max-width: 1600px;

    /* Animation */
    --transition-fast: 150ms ease;
    --transition-base: 220ms ease;
}


/* =========================================================
   2. RESET
   ========================================================= */

*,
*::before,
*::after {
    box-sizing: border-box;
}

html {
    min-height: 100%;
    scroll-behavior: smooth;
}

body {
    min-width: 320px;
    min-height: 100vh;

    margin: 0;

    background: var(--page);
    color: var(--text);

    font-family:
        "Poppins",
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;

    font-size: 13px;
    line-height: 1.5;

    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
}

button,
input,
select {
    font: inherit;
}

button {
    cursor: pointer;
}

button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}

select,
input {
    width: 100%;
}

a {
    color: inherit;
}

h1,
h2,
h3,
h4,
p {
    margin-top: 0;
}

[hidden] {
    display: none !important;
}

.visually-hidden {
    position: absolute !important;

    width: 1px !important;
    height: 1px !important;

    padding: 0 !important;
    margin: -1px !important;

    overflow: hidden !important;

    clip: rect(0, 0, 0, 0) !important;

    white-space: nowrap !important;

    border: 0 !important;
}


/* =========================================================
   3. GLOBAL LOADING OVERLAY
   ========================================================= */

.loading-overlay {
    position: fixed;
    inset: 0;

    z-index: 9999;

    display: grid;
    place-items: center;

    padding: 24px;

    background: rgba(245, 247, 251, 0.82);

    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
}

.loading-overlay__content {
    display: inline-flex;
    align-items: center;
    gap: 11px;

    min-width: 210px;

    padding: 16px 19px;

    color: var(--primary-dark);

    background: rgba(255, 255, 255, 0.98);

    border: 1px solid var(--border);
    border-radius: var(--radius-lg);

    box-shadow: var(--shadow-lg);

    font-size: 12px;
    font-weight: 600;
}

.loading-spinner {
    display: inline-block;

    width: 20px;
    height: 20px;

    flex: 0 0 20px;

    border: 2px solid #bfdbfe;
    border-top-color: var(--primary);

    border-radius: 50%;

    animation: spin 0.75s linear infinite;
}

.loading-spinner--small {
    width: 17px;
    height: 17px;

    flex-basis: 17px;

    border-width: 2px;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}


/* =========================================================
   4. HEADER
   ========================================================= */

.dashboard-header {
    position: relative;
    z-index: 20;

    min-height: var(--header-height);

    display: flex;
    align-items: center;
    justify-content: space-between;

    gap: 25px;

    padding: 14px 28px;

    background: var(--surface);

    border-bottom: 1px solid var(--border);

    box-shadow: var(--shadow-xs);
}

.dashboard-header__brand {
    display: flex;
    align-items: center;

    gap: 13px;

    min-width: 0;
}

.brand-mark {
    display: grid;
    place-items: center;

    width: 42px;
    height: 42px;

    flex: 0 0 42px;

    color: #ffffff;

    background: var(--primary);

    border-radius: 12px;

    box-shadow:
        0 5px 14px rgba(37, 99, 235, 0.20);

    font-size: 13px;
    font-weight: 700;
}

#dashboard-title {
    margin: 0;

    color: var(--text);

    font-size: clamp(19px, 2vw, 25px);
    font-weight: 700;

    line-height: 1.2;

    letter-spacing: -0.025em;
}

.dashboard-header__subtitle {
    margin: 4px 0 0;

    color: var(--text-secondary);

    font-size: 11px;
}

.dashboard-header__meta {
    display: flex;
    align-items: center;

    gap: 18px;

    flex-shrink: 0;
}

.data-period {
    display: flex;
    flex-direction: column;

    gap: 1px;
}

.data-period__label {
    color: var(--text-muted);

    font-size: 9px;
    font-weight: 600;

    text-transform: uppercase;
    letter-spacing: 0.07em;
}

#data-year-range {
    color: var(--text);

    font-size: 14px;
    font-weight: 700;
}

.data-period__divider {
    width: 1px;
    height: 31px;

    background: var(--border);
}

.unit-label {
    color: var(--text-muted);

    font-size: 10px;
    font-weight: 500;

    white-space: nowrap;
}


/* =========================================================
   5. MAIN LAYOUT
   ========================================================= */

.dashboard-layout {
    display: grid;

    grid-template-columns:
        var(--sidebar-width)
        minmax(0, 1fr);

    min-height:
        calc(100vh - var(--header-height));
}

.filter-sidebar {
    position: relative;

    min-width: 0;

    padding: 24px 18px;

    background: var(--sidebar);

    color: var(--sidebar-text);

    border-right: 1px solid #0b1220;

    overflow: visible;
}

.dashboard-content {
    min-width: 0;

    width: 100%;
    max-width: var(--content-max-width);

    padding: 28px 30px 40px;

    margin: 0 auto;

    overflow-x: hidden;
}

.content-section {
    margin-bottom: 22px;
}


/* =========================================================
   6. SIDEBAR
   ========================================================= */

.filter-sidebar__header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    gap: 12px;

    margin-bottom: 22px;
    padding: 2px 3px 17px;

    border-bottom:
        1px solid rgba(255, 255, 255, 0.08);
}

.filter-sidebar__header h2 {
    margin: 3px 0 0;

    color: #ffffff;

    font-size: 17px;
    font-weight: 600;

    line-height: 1.2;
}

.filter-sidebar__icon {
    display: grid;
    place-items: center;

    width: 34px;
    height: 34px;

    color: #60a5fa;

    background: rgba(37, 99, 235, 0.14);

    border:
        1px solid rgba(96, 165, 250, 0.16);

    border-radius: 9px;
}

.section-eyebrow {
    display: block;

    color: #60a5fa;

    font-size: 9px;
    font-weight: 700;

    line-height: 1.2;

    text-transform: uppercase;
    letter-spacing: 0.13em;
}


/* =========================================================
   FILTER FORM
   ========================================================= */

.filter-form {
    display: grid;

    grid-template-columns:
        minmax(0, 1fr)
        minmax(0, 1fr);

    column-gap: 10px;
    row-gap: 16px;
}


/* =========================================================
   FILTER LAYOUT
   ========================================================= */

/*
Year stays full width.
*/

.filter-form > .filter-group:nth-child(1) {
    grid-column: 1 / -1;
}


/*
From Year + To Year
*/

.year-range-filters {
    grid-column: 1 / -1;

    display: grid;

    grid-template-columns:
        minmax(0, 1fr)
        minmax(0, 1fr);

    column-gap: 10px;
}

.year-range-filters .filter-group {
    min-width: 0;
}


/*
Maker
*/

.filter-form > .filter-group:nth-child(3) {
    grid-column: 1 / -1;
}


/*
Region / RTO
*/

.filter-form > .filter-group:nth-child(4) {
    grid-column: 1 / -1;
}


/*
Category
*/

.filter-form > .filter-group:nth-child(5) {
    grid-column: 1 / -1;
}


/*
Subcategory
*/

.filter-form > .filter-group:nth-child(6) {
    grid-column: 1 / -1;
}


/*
Clear button
*/

.filter-form > .clear-filters-button {
    grid-column: 1 / -1;
}


/* =========================================================
   FILTER GROUP
   ========================================================= */

.filter-group {
    display: flex;
    flex-direction: column;

    gap: 7px;
}

.filter-group label {
    color: #cbd5e1;

    font-size: 11px;
    font-weight: 600;
}


/* =========================================================
   FILTER INPUTS / SELECTS
   ========================================================= */

.filter-group select,
#makerSearch,
#pageSizeSelect {
    min-height: 43px;

    padding: 9px 34px 9px 12px;

    color: #e2e8f0;

    background-color: var(--sidebar-soft);

    border: 1px solid var(--sidebar-border);

    border-radius: var(--radius-sm);

    outline: none;

    transition:
        border-color var(--transition-fast),
        box-shadow var(--transition-fast),
        background-color var(--transition-fast);
}

.filter-group select {
    appearance: none;

    background-image:
        linear-gradient(
            45deg,
            transparent 50%,
            #94a3b8 50%
        ),
        linear-gradient(
            135deg,
            #94a3b8 50%,
            transparent 50%
        );

    background-position:
        calc(100% - 14px) 18px,
        calc(100% - 9px) 18px;

    background-size:
        5px 5px,
        5px 5px;

    background-repeat: no-repeat;
}

.filter-group select:hover,
#makerSearch:hover,
#pageSizeSelect:hover {
    border-color: #475569;

    background-color: var(--sidebar-hover);
}

.filter-group select:focus,
#makerSearch:focus,
#pageSizeSelect:focus {
    border-color: #60a5fa;

    background-color: var(--sidebar-hover);

    box-shadow:
        0 0 0 3px rgba(96, 165, 250, 0.12);
}

.filter-group select:disabled,
#makerSearch:disabled,
#pageSizeSelect:disabled {
    color: #64748b;

    background: #111827;

    cursor: not-allowed;
}

.filter-group select option {
    color: #e2e8f0;

    background: var(--sidebar);
}


/* =========================================================
   SEARCH INPUT
   ========================================================= */

#makerSearch {
    padding-left: 34px;
    padding-right: 10px;

    background: var(--sidebar-soft);
}

.search-box {
    position: relative;

    display: flex;
    align-items: center;

    width: 100%;
}

.search-box svg {
    position: absolute;

    left: 10px;

    color: #94a3b8;

    pointer-events: none;
}


/* =========================================================
   CLEAR FILTERS
   ========================================================= */

.clear-filters-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;

    gap: 8px;

    width: 100%;

    min-height: 42px;

    margin-top: 5px;

    padding: 9px 12px;

    color: #cbd5e1;

    background: transparent;

    border:
        1px solid var(--sidebar-border);

    border-radius: var(--radius-sm);

    font-size: 11px;
    font-weight: 600;

    transition:
        background-color var(--transition-fast),
        border-color var(--transition-fast),
        color var(--transition-fast),
        transform var(--transition-fast);
}

.clear-filters-button:hover {
    color: #ffffff;

    background: var(--sidebar-soft);

    border-color: #475569;
}

.clear-filters-button:active {
    transform: translateY(1px);
}

.clear-filters-button:focus-visible {
    outline: 2px solid #60a5fa;
    outline-offset: 2px;
}


/* =========================================================
   7. ACTIVE FILTERS
   ========================================================= */

.active-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;

    gap: 7px;

    min-height: 28px;

    margin-bottom: 18px;
}

.active-filters__label {
    color: var(--text-muted);

    font-size: 9px;
    font-weight: 700;

    margin-right: 3px;

    text-transform: uppercase;
    letter-spacing: 0.10em;
}

.active-filter {
    display: inline-flex;
    align-items: center;

    min-height: 27px;

    padding: 4px 10px;

    color: var(--primary-dark);

    background: var(--primary-soft);

    border: 1px solid #bfdbfe;

    border-radius: 999px;

    font-size: 10px;
    font-weight: 600;
}

.active-filter strong {
    margin-right: 4px;

    font-weight: 700;
}

.active-filter--empty {
    color: var(--text-muted);

    background: var(--surface);

    border-color: var(--border);
}


/* =========================================================
   8. SECTION HEADINGS
   ========================================================= */

.section-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;

    gap: 15px;

    margin-bottom: 13px;
}

.section-heading h2 {
    margin: 3px 0 0;

    color: var(--text);

    font-size: 18px;
    font-weight: 700;

    line-height: 1.3;

    letter-spacing: -0.018em;
}

.section-heading--table {
    padding: 0 0 13px;
}


/* =========================================================
   9. KPI GRID
   ========================================================= */

.kpi-grid {
    display: grid;

    grid-template-columns:
        repeat(4, minmax(0, 1fr));

    gap: 15px;

    margin-bottom: 22px;
}

.kpi-card {
    position: relative;

    display: flex;
    align-items: center;

    gap: 15px;

    min-width: 0;
    min-height: 125px;

    padding: 19px;

    overflow: hidden;

    background: var(--surface);

    border:
        1px solid var(--border);

    border-radius: var(--radius-lg);

    box-shadow: var(--shadow-sm);

    transition:
        transform var(--transition-base),
        box-shadow var(--transition-base),
        border-color var(--transition-base);
}

.kpi-card:hover {
    transform: translateY(-2px);

    border-color: #d2dbe7;

    box-shadow: var(--shadow-md);
}

.kpi-card::after {
    position: absolute;

    right: -25px;
    bottom: -30px;

    width: 95px;
    height: 95px;

    border-radius: 50%;

    background: var(--primary-soft);

    content: "";

    opacity: 0.8;
}

.kpi-card__icon {
    position: relative;
    z-index: 1;

    display: grid;
    place-items: center;

    flex: 0 0 45px;

    width: 45px;
    height: 45px;

    color: var(--primary);

    background: var(--primary-soft);

    border-radius: 12px;

    font-size: 12px;
    font-weight: 700;
}

.kpi-card__content {
    position: relative;
    z-index: 1;

    min-width: 0;

    display: flex;
    flex-direction: column;
}

.kpi-card__label {
    color: var(--text-muted);

    font-size: 10px;
    font-weight: 600;

    line-height: 1.25;
}

.kpi-card__value {
    display: block;

    margin-top: 3px;

    color: var(--text);

    font-size: clamp(20px, 2vw, 25px);
    font-weight: 700;

    line-height: 1.15;

    white-space: nowrap;

    overflow: hidden;
    text-overflow: ellipsis;
}

.kpi-card__meta {
    margin-top: 4px;

    color: var(--success);

    font-size: 9px;
    font-weight: 600;
}


/* =========================================================
   10. TABLE CARD
   ========================================================= */

.table-card {
    overflow: hidden;

    background: var(--surface);

    border:
        1px solid var(--border);

    border-radius: var(--radius-lg);

    box-shadow: var(--shadow-sm);
}

.table-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;

    gap: 12px;

    padding: 13px 18px;

    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);

    background: var(--surface-soft);
}

.table-toolbar__left {
    width: min(330px, 100%);
}


/* =========================================================
   TABLE SEARCH BOX
   ========================================================= */

.search-box {
    position: relative;

    display: flex;
    align-items: center;

    width: 100%;
}

.search-box svg {
    position: absolute;

    left: 11px;

    color: var(--text-muted);

    pointer-events: none;
}


/*
The table search should be light,
unlike the sidebar filter search.
*/

.table-toolbar #makerSearch {
    min-height: 38px;

    padding-left: 35px;

    color: var(--text);

    background: var(--surface);

    border-color: var(--border);
}

.table-toolbar #makerSearch:hover {
    background: var(--surface);

    border-color: var(--border-dark);
}

.table-toolbar #makerSearch:focus {
    background: var(--surface);

    border-color: #93c5fd;

    box-shadow:
        0 0 0 3px rgba(37, 99, 235, 0.08);
}


/* =========================================================
   11. TABLE STATES
   ========================================================= */

.table-state {
    display: flex;
    align-items: center;
    justify-content: center;

    gap: 9px;

    min-height: 210px;

    padding: 30px;

    text-align: center;

    color: var(--text-muted);

    font-size: 11px;
}

.table-state p {
    margin: 0;
}

.table-state__icon {
    display: grid;
    place-items: center;

    width: 48px;
    height: 48px;

    margin-bottom: 4px;

    color: var(--text-muted);

    background: var(--surface-soft);

    border-radius: 50%;
}

.table-state--empty {
    flex-direction: column;
}

.table-state--error {
    flex-direction: column;

    color: var(--danger);
}

.table-state--error .table-state__icon {
    color: var(--danger);

    background: var(--danger-soft);

    font-size: 20px;
    font-weight: 700;
}

.table-state--loading {
    color: var(--text-muted);
}


/* =========================================================
   12. DATA TABLE
   ========================================================= */

.table-wrapper {
    width: 100%;

    overflow-x: auto;
    overflow-y: hidden;
}

.data-table {
    width: 100%;

    min-width: 620px;

    border-collapse: collapse;

    table-layout: fixed;

    font-size: 11px;
}

.data-table th,
.data-table td {
    padding: 13px 18px;

    border-bottom:
        1px solid var(--border);

    text-align: left;

    vertical-align: middle;
}

.data-table th:nth-child(1),
.data-table td:nth-child(1) {
    width: 45%;
}

.data-table th:nth-child(2),
.data-table td:nth-child(2) {
    width: 30%;

    text-align: right;
}

.data-table th:nth-child(3),
.data-table td:nth-child(3) {
    width: 25%;

    text-align: right;
}

.data-table thead th {
    color: var(--text-secondary);

    background: var(--surface-soft);

    font-size: 9px;
    font-weight: 700;

    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.data-table tbody td {
    color: var(--text-secondary);

    font-size: 11px;
}

.data-table tbody tr {
    transition:
        background-color var(--transition-fast);
}

.data-table tbody tr:nth-child(even) {
    background: var(--row-alt);
}

.data-table tbody tr:hover {
    background: var(--row-hover);
}

.data-table tbody td:first-child {
    color: var(--text);

    font-weight: 600;
}

.data-table tfoot th,
.data-table tfoot td {
    color: var(--text);

    background: var(--surface-soft);

    border-top:
        1px solid var(--border);

    border-bottom: 0;

    font-size: 11px;
    font-weight: 700;
}

.data-table tfoot td {
    text-align: right;
}

.table-placeholder-row td {
    padding: 45px 18px;

    color: var(--text-light);

    text-align: center !important;
}


/* =========================================================
   TABLE SORTING
   ========================================================= */

.table-sort-button {
    display: inline-flex;
    align-items: center;

    gap: 5px;

    padding: 0;

    color: inherit;

    background: transparent;

    border: 0;

    font: inherit;
    font-weight: inherit;

    text-align: inherit;
}

.table-sort-button:hover {
    color: var(--primary);
}

.table-sort-button:focus-visible {
    outline: 2px solid var(--primary);

    outline-offset: 3px;

    border-radius: 3px;
}

.sort-icon {
    color: var(--text-muted);

    font-size: 12px;

    transition:
        color var(--transition-fast);
}

.table-sort-button:hover .sort-icon {
    color: var(--primary);
}


/* =========================================================
   13. PAGINATION
   ========================================================= */

.pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;

    gap: 15px;

    padding: 15px 18px;

    border-top:
        1px solid var(--border);

    background: var(--surface-soft);
}

.pagination__left,
.pagination__right {
    display: flex;
    align-items: center;

    gap: 8px;
}

.pagination label {
    color: var(--text-muted);

    font-size: 10px;
    font-weight: 500;
}

#pageSizeSelect {
    width: 76px;

    min-height: 34px;

    padding: 6px 26px 6px 9px;

    color: var(--text);

    background: var(--surface);

    border-color: var(--border);

    font-size: 10px;
}

#pageSizeSelect:hover {
    background: var(--surface);

    border-color: var(--border-dark);
}

#pageSizeSelect:focus {
    background: var(--surface);

    border-color: #93c5fd;

    box-shadow:
        0 0 0 3px rgba(37, 99, 235, 0.08);
}

.pagination-button {
    min-height: 34px;

    padding: 6px 12px;

    color: var(--text-secondary);

    background: var(--surface);

    border:
        1px solid var(--border);

    border-radius: var(--radius-sm);

    font-size: 10px;
    font-weight: 600;

    transition:
        background-color var(--transition-fast),
        border-color var(--transition-fast),
        color var(--transition-fast);
}

.pagination-button:hover:not(:disabled) {
    color: var(--primary);

    background: var(--primary-soft);

    border-color: #bfdbfe;
}

.pagination-button:disabled {
    color: var(--text-light);

    background: var(--surface-muted);

    border-color: var(--border);

    opacity: 0.7;
}

.page-indicator {
    min-width: 90px;

    color: var(--text-muted);

    font-size: 10px;

    text-align: center;
}


/* =========================================================
   14. RESPONSIVE
   ========================================================= */

@media (max-width: 1200px) {

    :root {
        --sidebar-width: 280px;
    }

    .dashboard-content {
        padding-left: 25px;
        padding-right: 25px;
    }

    .kpi-grid {
        grid-template-columns:
            repeat(2, minmax(0, 1fr));
    }
}


/* =========================================================
   TABLET
   ========================================================= */

@media (max-width: 900px) {

    :root {
        --sidebar-width: 270px;
    }

    .dashboard-header {
        padding-left: 22px;
        padding-right: 22px;
    }

    .dashboard-content {
        padding: 24px 20px 32px;
    }

    .filter-sidebar {
        padding-left: 16px;
        padding-right: 16px;
    }
}


/* =========================================================
   MOBILE LAYOUT
   ========================================================= */

@media (max-width: 800px) {

    .dashboard-header {
        align-items: flex-start;

        flex-direction: column;

        gap: 10px;

        padding-top: 16px;
        padding-bottom: 16px;
    }

    .dashboard-header__meta {
        width: 100%;

        justify-content: flex-start;
    }

    .dashboard-layout {
        display: block;
    }

    /*
    Sidebar becomes a normal top filter panel.
    */

    .filter-sidebar {
        padding: 18px 16px 20px;

        border-right: 0;

        border-bottom:
            1px solid #020617;
    }

    .filter-sidebar__header {
        margin-bottom: 15px;
    }

    .filter-form {
        display: grid;

        grid-template-columns:
            repeat(2, minmax(0, 1fr));

        gap: 12px;
    }

    /*
    Year
    */

    .filter-form > .filter-group:nth-child(1) {
        grid-column: 1 / -1;
    }

    /*
    Year range
    */

    .year-range-filters {
        grid-column: 1 / -1;
    }

    /*
    Maker / Region / Category / Subcategory
    */

    .filter-form > .filter-group:nth-child(3),
    .filter-form > .filter-group:nth-child(4),
    .filter-form > .filter-group:nth-child(5),
    .filter-form > .filter-group:nth-child(6) {
        grid-column: auto;
    }

    /*
    Clear
    */

    .filter-form > .clear-filters-button {
        grid-column: 1 / -1;

        align-self: end;
    }

    .dashboard-content {
        padding: 20px 16px 30px;
    }
}


/* =========================================================
   SMALL TABLET / MOBILE
   ========================================================= */

@media (max-width: 600px) {

    #dashboard-title {
        font-size: 21px;
    }

    .dashboard-header__subtitle {
        font-size: 10px;
    }

    .dashboard-header__meta {
        gap: 11px;
    }

    .unit-label {
        white-space: normal;
    }

    .filter-form {
        grid-template-columns: 1fr;
    }

    .filter-form > .filter-group:nth-child(1),
    .filter-form > .filter-group:nth-child(3),
    .filter-form > .filter-group:nth-child(4),
    .filter-form > .filter-group:nth-child(5),
    .filter-form > .filter-group:nth-child(6),
    .filter-form > .clear-filters-button {
        grid-column: 1;
    }

    .year-range-filters {
        grid-column: 1;

        grid-template-columns:
            1fr 1fr;

        gap: 9px;
    }

    .kpi-grid {
        grid-template-columns: 1fr;
    }

    .section-heading h2 {
        font-size: 16px;
    }

    .table-toolbar {
        align-items: stretch;

        flex-direction: column;
    }

    .table-toolbar__left {
        width: 100%;
    }

    .pagination {
        align-items: stretch;

        flex-direction: column;
    }

    .pagination__left,
    .pagination__right {
        justify-content: center;
    }

    .pagination__left {
        width: 100%;
    }

    #pageSizeSelect {
        width: 100px;
    }

    .active-filters {
        align-items: flex-start;
    }
}


/* =========================================================
   VERY SMALL SCREENS
   ========================================================= */

@media (max-width: 480px) {

    .dashboard-header {
        padding-left: 16px;
        padding-right: 16px;
    }

    .dashboard-content {
        padding-left: 14px;
        padding-right: 14px;
    }

    .brand-mark {
        width: 40px;
        height: 40px;

        flex-basis: 40px;
    }

    .dashboard-header__meta {
        flex-wrap: wrap;
    }

    .data-period__divider {
        display: none;
    }

    .year-range-filters {
        grid-template-columns: 1fr;
    }

    .kpi-card {
        min-height: 115px;

        padding: 17px;
    }

    .table-card {
        border-radius: var(--radius-md);
    }

    .data-table {
        min-width: 580px;
    }

    .pagination {
        padding: 13px 15px;
    }
}


/* =========================================================
   15. REDUCED MOTION
   ========================================================= */

@media (prefers-reduced-motion: reduce) {

    *,
    *::before,
    *::after {
        scroll-behavior: auto !important;

        animation-duration: 0.01ms !important;

        animation-iteration-count: 1 !important;

        transition-duration: 0.01ms !important;
    }
}
