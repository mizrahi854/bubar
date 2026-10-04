#!/usr/bin/env bash
# Runs the schema tests on a throwaway local Postgres database (no Supabase account needed).
set -euo pipefail
DB=${DB:-beautigo_schema_test}
PSQL=${PSQL:-psql}
cd "$(dirname "$0")/.."
$PSQL -q -c "drop database if exists $DB" -c "create database $DB" postgres
$PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/local_stubs.sql
for f in migrations/*.sql; do $PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
$PSQL -q -t -v ON_ERROR_STOP=1 -d "$DB" -f tests/management_test.sql 2>&1 | grep -E "ok -|FAILED|ERROR|PASSED"
