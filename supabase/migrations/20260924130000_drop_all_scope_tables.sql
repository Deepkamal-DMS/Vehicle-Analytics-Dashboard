-- Full teardown ahead of the schema rebuild covering All India,
-- Maharashtra and the real 37-RTO Gujarat data (not just the 4 RTOs
-- this schema ever supported). Every row currently live was backed
-- up first to local/data/db-backup-2026-09-24/ (37 tables, 50,789
-- rows, gitignored - never committed).
--
-- import_maker_month() is left alone on purpose - it gets rewritten
-- once the new schema exists, not as part of this cleanup.
--
-- Which of these are views versus real tables was never confirmed
-- from a schema dump (db dump needs Docker, unavailable here) - only
-- from row-level REST probing, which cannot tell the two apart. A
-- first attempt that guessed and ran DROP VIEW/DROP TABLE blindly
-- failed outright: Postgres errors on the wrong statement for an
-- object's actual kind, it does not skip it the way IF EXISTS skips
-- a name that is not there at all. This version checks pg_class
-- itself before deciding which statement to run.

DO $$
DECLARE
    obj text;
    kind "char";
    names text[] := ARRAY[
        -- Derived, year/scope-grain views
        'MAKER_WISE', 'Gujarat_Class_Wise', 'Ahmedabad_Class_Wise',
        'Maker_Class_Wise_GJ01', 'Maker_Class_Wise_GJ27', 'Maker_Class_Wise_GJ38',
        'trend_by_maker', 'trend_totals', 'trend_makers',
        'monthly_by_maker', 'monthly_totals', 'monthly_makers',

        -- Real base tables: 12 months x 3 families
        'Maker_Class_Wise_Jan', 'Maker_Class_Wise_Feb', 'Maker_Class_Wise_Mar',
        'Maker_Class_Wise_Apr', 'Maker_Class_Wise_May', 'Maker_Class_Wise_Jun',
        'Maker_Class_Wise_Jul', 'Maker_Class_Wise_Aug', 'Maker_Class_Wise_Sep',
        'Maker_Class_Wise_Oct', 'Maker_Class_Wise_Nov', 'Maker_Class_Wise_Dec',

        'Gujarat_Class_Wise_Jan', 'Gujarat_Class_Wise_Feb', 'Gujarat_Class_Wise_Mar',
        'Gujarat_Class_Wise_Apr', 'Gujarat_Class_Wise_May', 'Gujarat_Class_Wise_Jun',
        'Gujarat_Class_Wise_Jul', 'Gujarat_Class_Wise_Aug', 'Gujarat_Class_Wise_Sep',
        'Gujarat_Class_Wise_Oct', 'Gujarat_Class_Wise_Nov', 'Gujarat_Class_Wise_Dec',

        'Ahmedabad_Class_Wise_Jan', 'Ahmedabad_Class_Wise_Feb', 'Ahmedabad_Class_Wise_Mar',
        'Ahmedabad_Class_Wise_Apr', 'Ahmedabad_Class_Wise_May', 'Ahmedabad_Class_Wise_Jun',
        'Ahmedabad_Class_Wise_Jul', 'Ahmedabad_Class_Wise_Aug', 'Ahmedabad_Class_Wise_Sep',
        'Ahmedabad_Class_Wise_Oct', 'Ahmedabad_Class_Wise_Nov', 'Ahmedabad_Class_Wise_Dec',

        -- Standalone: no month-grain source of its own
        'Maker_Class_Wise_GJ13'
    ];
BEGIN
    FOREACH obj IN ARRAY names LOOP

        SELECT c.relkind INTO kind
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = obj;

        IF kind IS NULL THEN
            CONTINUE;
        ELSIF kind = 'v' THEN
            EXECUTE format('DROP VIEW %I CASCADE', obj);
        ELSE
            EXECUTE format('DROP TABLE %I CASCADE', obj);
        END IF;

    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
