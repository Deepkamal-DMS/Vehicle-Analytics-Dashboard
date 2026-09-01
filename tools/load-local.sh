#!/usr/bin/env bash
#
# Applies the generated schema to the local Postgres and loads the
# CSVs into it. Idempotent: it drops every object it is about to
# create, so it can be re-run after any generator change.
#
# CSVs are piped over stdin rather than mounted, because psql's
# \copy reads from the client's filesystem - which is inside the
# container - and a bind mount would need a compose restart.
#
# In CSV mode an empty unquoted field is NULL, which is exactly how
# the absent classes are written. That is the whole space saving.
#
#     bash tools/load-local.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/local/data"
INIT="$ROOT/local/init"

PSQL=(docker exec -i vad-db psql -U postgres -d vahan -v ON_ERROR_STOP=1 -q)

SCOPE_TABLES=(
    MAKER_WISE
    Gujarat_Class_Wise
    Maker_Class_Wise_GJ01
    Maker_Class_Wise_GJ13
    Maker_Class_Wise_GJ27
    Maker_Class_Wise_GJ38
)

MONTHS=(Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec)

MONTH_TABLES=()
for m in "${MONTHS[@]}"; do
    MONTH_TABLES+=("Maker_Class_Wise_$m" "Gujarat_Class_Wise_$m" "Ahmedabad_Class_Wise_$m")
done

echo "==> dropping any previous run"

{
    echo 'DROP VIEW IF EXISTS "trend_makers", "trend_totals", "trend_by_maker";'
    echo 'DROP VIEW IF EXISTS "_month_all_india", "_month_gujarat", "_month_ahmedabad";'
    echo 'DROP VIEW IF EXISTS "Ahmedabad_Class_Wise";'
    for t in "${MONTH_TABLES[@]}" "${SCOPE_TABLES[@]}"; do
        echo "DROP TABLE IF EXISTS \"$t\";"
    done
} | "${PSQL[@]}"

echo "==> creating tables"

"${PSQL[@]}" < "$INIT/05-scope-tables.sql"
"${PSQL[@]}" < "$INIT/10-schema.sql"

echo "==> loading data"

for table in "${SCOPE_TABLES[@]}" "${MONTH_TABLES[@]}"; do
    "${PSQL[@]}" -c "\\copy \"$table\" FROM STDIN WITH (FORMAT csv, HEADER true)" \
        < "$DATA/$table.csv"
done

"${PSQL[@]}" -c "SELECT count(*) AS tables, to_char(sum(n_live_tup),'FM999,999') AS rows FROM pg_stat_user_tables"

echo "==> creating views"

"${PSQL[@]}" < "$INIT/20-derived.sql"

echo "==> reloading PostgREST schema cache"

docker kill -s SIGUSR1 vad-api >/dev/null

echo "done"
