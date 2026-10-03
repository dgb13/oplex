#!/bin/sh
# Corre una sola vez, al crear el volumen de Postgres por primera vez.
# Igual que docker/postgres-init/01-init-roles.sql pero con la contraseña
# tomada de APP_DB_PASSWORD (.env del servidor) en vez de una fija.
#
# plexo_app: el usuario con el que la API habla con la base en runtime.
# Sin SUPERUSER ni BYPASSRLS, así las políticas RLS por tenant aplican.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$APP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE plexo_app LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plexo_app')
\gexec
GRANT ALL ON SCHEMA public TO plexo_app;
SQL
