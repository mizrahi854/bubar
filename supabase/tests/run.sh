#!/usr/bin/env bash
# Runs the schema tests on a throwaway local Postgres database (no Supabase account needed).
set -euo pipefail
DB=${DB:-beautigo_schema_test}
PSQL=${PSQL:-psql}
cd "$(dirname "$0")/.."
$PSQL -q -c "drop database if exists $DB" -c "create database $DB" postgres
$PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/local_stubs.sql
for f in migrations/*.sql; do $PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
for t in tests/management_test.sql tests/messages_test.sql; do $PSQL -q -t -v ON_ERROR_STOP=1 -d "$DB" -f "$t" 2>&1 | grep -E "ok -|FAILED|ERROR|PASSED"; done
