-- Clears the March 2025 All India data imported to verify the real
-- Import dialog UI end-to-end (file picker through commit), not the
-- API directly. Clean slate again, not a schema change.

TRUNCATE TABLE "All_India_Class_Wise";
