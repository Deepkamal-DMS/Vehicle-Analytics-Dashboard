/*
 * Regenerates supabase/migrations/20260924150000_import_functions.sql
 * from tools/class-columns.js. Run this - never hand-edit that SQL
 * file - if the class list ever changes, so the column lists in both
 * functions below can't drift from the one canonical source every
 * import path reads.
 *
 * Two functions, one per shape of table the new three-table schema
 * has (see tools/build-new-schema.js):
 *
 *   import_maker_month()   All_India_Class_Wise - no RTO.
 *   import_rto_month()     Gujarat_RTO_Class_Wise or
 *                           Maharashtra_RTO_Class_Wise, chosen by
 *                           p_scope - carries rto_code/rto_name.
 *
 * After regenerating, re-run the SQL against Supabase (see this
 * file's own header) and re-test with the queries this function's
 * tests were built from before trusting it again.
 *
 * Usage (from the repo root): node tools/generate-import-migration.js
 */

const fs = require("fs");
const path = require("path");
const { CLASS_COLUMNS, MONTHS } = require(
    path.resolve("tools", "class-columns.js")
);

const quoted = name => '"' + name.replace(/"/g, '""') + '"';

const recordsetCols = ['"Maker" text']
    .concat(CLASS_COLUMNS.map(name => `${quoted(name)} integer`))
    .concat(['"Total" integer']);

const RECORDSET_ARGS = recordsetCols.join(",\n            ");

/*
 * Every class column is coalesced to 0: the live tables declare all
 * 76 of them NOT NULL DEFAULT 0, and a row whose JSON object simply
 * omits a class (jsonb_to_recordset then leaves it NULL) should mean
 * "zero of that class", not a rejected insert. validate.js always
 * sends all 76 keys, so this never fires from the Edge Function in
 * practice - it is here so a malformed payload fails on its actual
 * problem, not on an unrelated NOT NULL violation for a column that
 * was simply never involved. Maker and Total are NOT coalesced: an
 * absent maker name or total is a genuinely broken row, and should
 * fail loudly rather than be papered over.
 */
const classSelectCols = CLASS_COLUMNS.map(name => `coalesce(t.${quoted(name)}, 0)`);
const sumExpr = classSelectCols.join(" + ");

const monthList = MONTHS.map(m => `'${m}'`).join(", ");


/* ---------------------------------------------------------------
   import_maker_month() - All_India_Class_Wise
   --------------------------------------------------------------- */

const allIndiaInsertCols = ['"year"', '"month"', '"Maker"']
    .concat(CLASS_COLUMNS.map(quoted))
    .concat(['"Total"']);

const allIndiaSelectCols = ['p_year', 'p_month', 't."Maker"']
    .concat(classSelectCols)
    .concat(['t."Total"']);

const importMakerMonth = `
CREATE OR REPLACE FUNCTION public.import_maker_month(
    p_month text,
    p_year integer,
    p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted    integer;
    v_inserted   integer;
    v_units      bigint;
    v_mismatches jsonb;
BEGIN
    IF p_month NOT IN (${monthList}) THEN
        RAISE EXCEPTION 'import_maker_month: unknown month %', p_month
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
        RAISE EXCEPTION 'import_maker_month: year % out of range', p_year
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
            OR jsonb_array_length(p_rows) = 0 THEN
        RAISE EXCEPTION 'import_maker_month: rows must be a non-empty array'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    DELETE FROM "All_India_Class_Wise" WHERE "year" = p_year AND "month" = p_month;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    INSERT INTO "All_India_Class_Wise" (${allIndiaInsertCols.join(", ")})
    SELECT ${allIndiaSelectCols.join(", ")}
    FROM jsonb_to_recordset(p_rows) AS t(
        ${RECORDSET_ARGS}
    );
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    SELECT coalesce(sum("Total"), 0) INTO v_units
    FROM "All_India_Class_Wise" WHERE "year" = p_year AND "month" = p_month;

    /*
     * A mismatch here is reported, not raised - the row is still real
     * registration data with an arithmetic discrepancy worth a
     * human's eyes, not a parsing failure.
     */
    SELECT coalesce(jsonb_agg(jsonb_build_object(
            'maker', "Maker", 'total', "Total", 'summed', summed
        )), '[]'::jsonb) INTO v_mismatches
    FROM (
        SELECT t."Maker", t."Total", (${sumExpr}) AS summed
        FROM "All_India_Class_Wise" AS t
        WHERE t."year" = p_year AND t."month" = p_month
    ) s
    WHERE s."Total" IS DISTINCT FROM s.summed;

    RETURN jsonb_build_object(
        'table', 'All_India_Class_Wise',
        'month', p_month,
        'year', p_year,
        'deleted', v_deleted,
        'inserted', v_inserted,
        'units', v_units,
        'mismatches', v_mismatches
    );
END;
$$;

REVOKE ALL ON FUNCTION public.import_maker_month(text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_maker_month(text, integer, jsonb) FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.import_maker_month(text, integer, jsonb)
            TO service_role;
    END IF;
END;
$$;
`;


/* ---------------------------------------------------------------
   import_rto_month() - Gujarat_RTO_Class_Wise / Maharashtra_RTO_Class_Wise
   --------------------------------------------------------------- */

const rtoInsertCols = ['"year"', '"month"', '"rto_code"', '"rto_name"', '"Maker"']
    .concat(CLASS_COLUMNS.map(quoted))
    .concat(['"Total"']);

const rtoSelectCols = ['$2', '$1', '$3', '$4', 't."Maker"']
    .concat(classSelectCols)
    .concat(['t."Total"']);

const importRtoMonth = `
CREATE OR REPLACE FUNCTION public.import_rto_month(
    p_scope text,
    p_rto_code text,
    p_rto_name text,
    p_month text,
    p_year integer,
    p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table      text;
    v_deleted    integer;
    v_inserted   integer;
    v_units      bigint;
    v_mismatches jsonb;
BEGIN
    /*
     * p_scope chooses the table from a fixed allow-list, never text
     * built into an identifier directly - the same guard
     * import_maker_month() has never needed because it only ever had
     * one table.
     */
    IF p_scope = 'gujarat' THEN
        v_table := 'Gujarat_RTO_Class_Wise';
    ELSIF p_scope = 'maharashtra' THEN
        v_table := 'Maharashtra_RTO_Class_Wise';
    ELSE
        RAISE EXCEPTION 'import_rto_month: unknown scope %', p_scope
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_rto_code IS NULL OR length(trim(p_rto_code)) = 0 THEN
        RAISE EXCEPTION 'import_rto_month: rto_code is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_rto_name IS NULL OR length(trim(p_rto_name)) = 0 THEN
        RAISE EXCEPTION 'import_rto_month: rto_name is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_month NOT IN (${monthList}) THEN
        RAISE EXCEPTION 'import_rto_month: unknown month %', p_month
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
        RAISE EXCEPTION 'import_rto_month: year % out of range', p_year
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
            OR jsonb_array_length(p_rows) = 0 THEN
        RAISE EXCEPTION 'import_rto_month: rows must be a non-empty array'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    /*
     * Scoped to this one RTO, not the whole table - unlike
     * import_maker_month(), a month here has many RTOs' rows sharing
     * it. Deleting by (year, month) alone would wipe every other RTO
     * that already loaded this same month.
     */
    EXECUTE format(
        'DELETE FROM %I WHERE "year" = $1 AND "month" = $2 AND "rto_code" = $3',
        v_table
    ) USING p_year, p_month, p_rto_code;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    EXECUTE format(
        'INSERT INTO %I (${rtoInsertCols.join(", ")})
         SELECT ${rtoSelectCols.join(", ")}
         FROM jsonb_to_recordset($5) AS t(
            ${RECORDSET_ARGS}
         )',
        v_table
    ) USING p_month, p_year, p_rto_code, p_rto_name, p_rows;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    EXECUTE format(
        'SELECT coalesce(sum("Total"), 0) FROM %I
         WHERE "year" = $1 AND "month" = $2 AND "rto_code" = $3',
        v_table
    ) INTO v_units USING p_year, p_month, p_rto_code;

    EXECUTE format(
        'SELECT coalesce(jsonb_agg(jsonb_build_object(
                ''maker'', "Maker", ''total'', "Total", ''summed'', summed
            )), ''[]''::jsonb)
         FROM (
             SELECT t."Maker", t."Total", (${sumExpr}) AS summed
             FROM %I AS t
             WHERE t."year" = $1 AND t."month" = $2 AND t."rto_code" = $3
         ) s
         WHERE s."Total" IS DISTINCT FROM s.summed',
        v_table
    ) INTO v_mismatches USING p_year, p_month, p_rto_code;

    RETURN jsonb_build_object(
        'table', v_table,
        'rto_code', p_rto_code,
        'rto_name', p_rto_name,
        'month', p_month,
        'year', p_year,
        'deleted', v_deleted,
        'inserted', v_inserted,
        'units', v_units,
        'mismatches', v_mismatches
    );
END;
$$;

REVOKE ALL ON FUNCTION public.import_rto_month(text, text, text, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_rto_month(text, text, text, text, integer, jsonb) FROM anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.import_rto_month(text, text, text, text, integer, jsonb)
            TO service_role;
    END IF;
END;
$$;
`;


const sql = `-- Generated by tools/generate-import-migration.js - do not edit by hand.
--
-- Replaces import_maker_month() (retargeted at All_India_Class_Wise,
-- keyed on year+month as data instead of a table-per-month) and adds
-- import_rto_month() for the two new RTO-wise tables - see
-- supabase/migrations/20260924140000_create_new_schema.sql for the
-- schema both write into, and 20260922120000_import_maker_month.sql
-- for the version this supersedes (left in place as history; its own
-- target table no longer exists).
--
-- Both:
--   - Are one transaction: delete-then-insert either both happen or
--     neither does. A (month[, rto]) is never left half-loaded.
--   - Are granted to service_role only - anon and authenticated
--     (the roles the dashboard's publishable key can ever
--     authenticate as) are explicitly revoked, so the publishable
--     key already shipped in script.js cannot call either even by
--     hand-crafting a REST request.
${importMakerMonth}
${importRtoMonth}
`;

fs.writeFileSync(
    path.resolve("supabase", "migrations", "20260924150000_import_functions.sql"),
    sql,
    "utf8"
);
console.log("written");
