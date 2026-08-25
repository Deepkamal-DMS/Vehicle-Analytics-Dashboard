-- The twelve scope x year tables that MAKER_WISE, Gujarat_Class_Wise
-- and the four GJ tables replaced. Nothing reads them any more:
-- SCOPE_TABLES in script.js now points at the merged six.
--
-- They are left in place deliberately. Run this only once you are
-- satisfied the dashboard is behaving, because there is no undo -
-- the CSVs in RTO/New data/ would be the only way back.
--
-- Before running, confirm the merged tables still reconcile against
-- these originals:
--
--     SELECT 'merged' AS src, "year", count(*), sum("Total")
--       FROM "MAKER_WISE" GROUP BY "year"
--     UNION ALL
--     SELECT '2025', 2025, count(*), sum("Total") FROM "MAKER_WISE_2025"
--     UNION ALL
--     SELECT '2026', 2026, count(*), sum("Total") FROM "MAKER_WISE_2026"
--     ORDER BY 2, 1;
--
-- Expected: 2025 -> 2045 rows / 2,92,89,448
--           2026 -> 1949 rows / 1,99,42,129

BEGIN;

DROP TABLE IF EXISTS "MAKER_WISE_2025";
DROP TABLE IF EXISTS "MAKER_WISE_2026";

DROP TABLE IF EXISTS "Gujarat_Class_Wise_2025";
DROP TABLE IF EXISTS "Gujarat_Class_Wise_2026";

DROP TABLE IF EXISTS "Maker_Class_Wise_GJ01_2025";
DROP TABLE IF EXISTS "Maker_Class_Wise_GJ01_2026";

DROP TABLE IF EXISTS "Maker_Class_Wise_GJ13_2025";
DROP TABLE IF EXISTS "Maker_Class_Wise_GJ13_2026";

DROP TABLE IF EXISTS "Maker_Class_Wise_GJ27_2025";
DROP TABLE IF EXISTS "Maker_Class_Wise_GJ27_2026";

DROP TABLE IF EXISTS "Maker_Class_Wise_GJ38_2025";
DROP TABLE IF EXISTS "Maker_Class_Wise_GJ38_2026";

COMMIT;

NOTIFY pgrst, 'reload schema';
