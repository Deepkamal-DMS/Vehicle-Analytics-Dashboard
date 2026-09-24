-- Clears the real-but-partial data left over from testing the
-- rewritten import path against the new schema (Jan 2025 for All
-- India, GJ01, GJ02, and MH01) - a clean slate before the real bulk
-- load, not a schema change.

TRUNCATE TABLE "All_India_Class_Wise";
TRUNCATE TABLE "Gujarat_RTO_Class_Wise";
TRUNCATE TABLE "Maharashtra_RTO_Class_Wise";
