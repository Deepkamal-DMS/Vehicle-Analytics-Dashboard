-- Clears the Jan/Feb 2025 test data (All India, GJ01, GJ02, MH01,
-- MH02) imported to verify the rewritten script.js fetch/filter
-- layer against the new schema - a clean slate again, not a schema
-- change.

TRUNCATE TABLE "All_India_Class_Wise";
TRUNCATE TABLE "Gujarat_RTO_Class_Wise";
TRUNCATE TABLE "Maharashtra_RTO_Class_Wise";
