# What every import checks - and where

Two import paths exist for a Vahan `maker_vehicleClass_<scope>_<Mon><YY>.xlsx`
workbook - `<scope>` is `All RTO` (nationwide), `GJ01`..`GJ39` (a Gujarat
RTO) or `MH01`..`MH58` (a Maharashtra RTO) - and they share almost
everything on purpose:

- **Offline (CLI)** - `tools/build-month-tables.js` reads a folder of
  workbooks, writes CSVs and `tools/schema.sql`, then `tools/upload.js`
  loads those CSVs into Supabase by hand.
- **Online (dashboard)** - the **Import Registration Data** card in
  the dashboard, which calls the `import-workbook` Supabase Edge
  Function on every upload.

Both paths validate a workbook against the **same canonical list**
of vehicle-class columns (`tools/class-columns.js`), so they cannot
quietly drift apart on what a class is called or where it belongs.
The table below is every check either path performs, in the order a
workbook meets them, and what happens when one fails.

## Parsing and structure

| # | Check | What it catches | CLI behaviour | Online behaviour |
|---|-------|------------------|----------------|-------------------|
| 1 | **Zip/XML well-formedness** | A file that isn't really an `.xlsx`, or is corrupt | Throws, file skipped | 422, rejected |
| 2 | **Filename pattern** `maker_vehicleClass_<scope>_<Mon><YY>.xlsx` | Anything not named like a Vahan monthly export | File skipped | 422, rejected |
| 3 | **Title cross-check** - the sheet's own printed date range (cell A1) must agree with the filename's month/year. For `GJ*`/`MH*`, the RTO named in the sheet's title (e.g. "RTO (AHMEDABAD - GJ1) Wise...") must also agree with the filename's RTO code | The filename lying about what's inside - "every file in RTO/2025-24 says 2025, but half of them hold 2024 data" - or a file filed under the wrong RTO | File skipped | 422, rejected |
| 4 | **Header starts with `Maker`** | A workbook that isn't Maker x Vehicle Class shaped | File skipped | 422, rejected |
| 5 | **Header ends with `Total`** | Same | File skipped | 422, rejected |
| 6 | **Known vehicle class columns** - every class column must be in the canonical 76-name list | A new Vahan class nobody's added yet, silently dropped | Column ignored, **logged as a problem, file still loads** | **Blocks the whole import** (see "Why the online path is stricter" below) |
| 7 | **Duplicate maker** in one sheet | The same maker listed twice | Second row skipped, **logged as a problem, file still loads** | **Blocks the whole import** |
| 8 | **Newline inside a maker name** | A stray line break that would split a CSV row in half | Row skipped, **logged as a problem, file still loads** | **Blocks the whole import** |
| 9 | **Blank maker name** | An empty row | Row skipped silently, counted | Row skipped silently, counted |
| 10 | **Class columns sum to the row's own `Total`** | An internal arithmetic mismatch in the source data | Row still loads, **printed as a warning** | Row still loads, **shown as a warning in the preview** - never blocks |

## Why the online path is stricter for checks 6-8

On the CLI, a problem like an unknown class or a duplicate maker is
printed to the console and a human decides - by reading that output
- whether to run `tools/upload.js` at all. The dashboard's Import
card has no equivalent second human step between "parsed" and
"written to the live database": there's one preview and one confirm
click. So there, those three become **hard blocks** instead of
skip-and-continue - a silently dropped column or a silently skipped
row is exactly the kind of thing nobody should discover after the
data is already live. The one check that stays a non-blocking
warning either way is #10 (Total vs. its own class columns), because
that's a data quality note about a real row, not a parsing failure -
the CLI has always loaded that row regardless, and the online path
keeps the same call, just makes the warning visible before you
confirm rather than only in a console you may not be watching.

## The database write itself (online path only)

The CLI's `tools/upload.js` talks to Supabase's Management API with a
personal access token that runs arbitrary SQL - fine from a
developer's own machine, never something a browser can hold safely.
The online path instead funnels every write through one of two
Postgres functions (`supabase/migrations/
20260924150000_import_functions.sql`), which are the only things the
Edge Function is ever allowed to call:

- **`import_maker_month(p_month, p_year, p_rows)`** - All India,
  writes to `All_India_Class_Wise`.
- **`import_rto_month(p_scope, p_rto_code, p_rto_name, p_month, p_year, p_rows)`** -
  Gujarat or Maharashtra, writes to `Gujarat_RTO_Class_Wise` or
  `Maharashtra_RTO_Class_Wise` (chosen from a fixed two-value
  allow-list by `p_scope`, never built from caller-supplied text).

| # | Guarantee | How |
|---|-----------|-----|
| 11 | **Only a literal month name, and (for the RTO function) a literal scope, reach a table/column identifier** | `p_month` is checked against the 12 hardcoded month codes; `p_scope` against `'gujarat'`/`'maharashtra'` - both *before* anything gets built from them |
| 12 | **Only the uploaded (month, year[, RTO]) slice is touched** | `DELETE ... WHERE "year" = ... AND "month" = ...` (`import_rto_month` also adds `AND "rto_code" = ...`), never a full-table `TRUNCATE` - every other row is untouched. Scoping by RTO too is what stops importing one RTO's month from wiping every other RTO sharing that table |
| 13 | **All-or-nothing** | Delete-then-insert is one function call, which Postgres runs as one transaction - a month is never left half-loaded |
| 14 | **Re-running with a different file replaces, not appends** | The delete step means importing the same month (and RTO, where relevant) twice leaves only the second file's rows |
| 15 | **Only `service_role` can call either function** | `anon`/`authenticated` - everything the dashboard's public key can ever authenticate as - are explicitly revoked. The key already shipped in `script.js` cannot call either even by hand-crafting a REST request |
| 16 | **Commit re-validates from scratch** | The browser re-uploads the actual file bytes for the commit call, not a client-echoed summary of the preview - there is nothing to tamper with between "checked" and "written" |
| 17 | **File size cap** (15 MB) | A workbook this data set actually produces tops out around 2.5 MB; the cap is a sanity backstop, not a real constraint |

Every one of checks 11-17, plus the reader itself, was run against
real workbooks from all three sources and verified directly against
the live deployed function before being written down here.

## Access control

The Import card - and, since 2026-09-24, the whole dashboard - sits
behind a login screen: one shared username/password
(`IMPORT_ADMIN_USER`/`IMPORT_ADMIN_PASSWORD`, Supabase secrets, never
in this repo), checked by `requireAuth()` in `supabase/functions/
import-workbook/index.ts`. The login screen calls this same function
(`mode=ping`) to check a credential before letting the dashboard load
at all; every later preview/commit call reuses it as an HTTP Basic
`Authorization` header. `requireAuth()` fails closed if either secret
is unset. This is a single shared credential, not per-person
accounts - fine for one admin, and checks 15-16 above are what bound
the risk underneath it regardless: nobody can reach the database
except through these two functions, and neither can ever run
anything but the exact routine described above.
