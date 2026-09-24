# What every import checks - and where

Two import paths exist for a Vahan `maker_vehicleClass_<year>_<Mon><YY>.xlsx`
workbook, and they share almost everything on purpose:

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
| 2 | **Filename pattern** `maker_vehicleClass_<year>_<Mon><YY>.xlsx` | Anything not named like a Vahan monthly export | File skipped | 422, rejected |
| 3 | **Title cross-check** - the sheet's own printed date range (cell A1) must agree with the filename's month/year | The filename lying about what's inside - "every file in RTO/2025-24 says 2025, but half of them hold 2024 data" | File skipped | 422, rejected |
| 4 | **Header starts with `Maker`** | A workbook that isn't Maker x Vehicle Class shaped | File skipped | 422, rejected |
| 5 | **Header ends with `Total`** | Same | File skipped | 422, rejected |
| 6 | **Known vehicle class columns** - every class column must be in the canonical 75-name list | A new Vahan class nobody's added yet, silently dropped | Column ignored, **logged as a problem, file still loads** | **Blocks the whole import** (see "Why the online path is stricter" below) |
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
The online path instead funnels every write through one Postgres
function, `import_maker_month()` (`supabase/migrations/
20260922120000_import_maker_month.sql`), which is the only thing the
Edge Function is ever allowed to call:

| # | Guarantee | How |
|---|-----------|-----|
| 11 | **Only a literal month name reaches a table identifier** | `p_month` is checked against the 12 hardcoded month codes *before* `format(%I, ...)` ever builds a table name from it |
| 12 | **Only the uploaded (month, year) pair is touched** | `DELETE ... WHERE "year" = p_year`, not a full-table `TRUNCATE` - every other year, and every other month's table, is untouched. This matches the documented safe recovery path in `tools/schema.sql` |
| 13 | **All-or-nothing** | Delete-then-insert is one function call, which Postgres runs as one transaction - a month is never left half-loaded |
| 14 | **Re-running with a different file replaces, not appends** | The delete step means importing the same month twice leaves only the second file's rows |
| 15 | **Only `service_role` can call it** | `anon`/`authenticated` - everything the dashboard's public key can ever authenticate as - are explicitly revoked. The key already shipped in `script.js` cannot call this even by hand-crafting a REST request |
| 16 | **Commit re-validates from scratch** | The browser re-uploads the actual file bytes for the commit call, not a client-echoed summary of the preview - there is nothing to tamper with between "checked" and "written" |
| 17 | **File size cap** (15 MB) | A workbook this data set actually produces tops out around 2.5 MB; the cap is a sanity backstop, not a real constraint |

Every one of checks 11-17, plus the reader itself, was run against
all 32 real workbooks in this repo and cross-checked against an
independent re-implementation and the live Postgres function before
being written down here - see the project's working notes for the
test output if you want to re-run any of it.

## Access control (read this before relying on it)

The Import card currently has **no login** - by explicit, deliberate
choice, to be revisited later. `requireAuth()` in `supabase/
functions/import-workbook/index.ts` is the single place a real check
gets added. Until then, checks 15-16 above are what actually bound
the risk: nobody can reach the database except through this one
function, and this one function can only ever run the exact routine
described above - never arbitrary SQL, never another table.
