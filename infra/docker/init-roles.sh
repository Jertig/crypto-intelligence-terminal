#!/bin/sh
set -eu
# No passwords in arguments or echoed SQL. Runs only on a fresh production volume.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv web_password POSTGRES_WEB_PASSWORD
\getenv worker_password POSTGRES_WORKER_PASSWORD
CREATE ROLE terminal_web LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'web_password';
CREATE ROLE terminal_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'worker_password';
REVOKE ALL ON DATABASE terminal FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE terminal TO terminal_web,terminal_worker;
GRANT USAGE ON SCHEMA public TO terminal_web,terminal_worker;
SQL
