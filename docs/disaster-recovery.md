# Disaster recovery

Same-disk backups are not disaster recovery. Public deployment remains pending:
no remote host, SSH destination, off-host storage or public domain has been used.

## Verify locally

Run from the secured repository with its ignored `.env.production`:

```sh
node infra/ops/terminal.mjs backup
node infra/ops/terminal.mjs verify-restore
```

The verifier checks the archive SHA-256, refuses a pre-existing
`terminal_restore_test` database, creates that disposable database, restores the
full custom-format dump with errors fatal, checks the complete migration count
and retained research counts, then drops only the test database it created.
It never drops `terminal` or removes a volume. A bounded verification record is
written under ignored `data/operations`. Inspect counts against the expected
research records. A successful local restore does not establish an off-host
restore, target capacity or a maximum-size recovery time.

## Off-host destination plan

Choose operator-controlled storage on another physical host/account. Transfer
each completed dump and its SHA-256 sidecar over authenticated SSH/SFTP, with
restricted destination permissions. Backups contain private notes and research;
encrypt them at rest using the destination's secured storage or an operator-managed
encryption tool. Keep recovery credentials and decryption material outside the
VPS. Do not put them in this repository or application environment. No paid service
is required or purchased. Configure independent off-host retention and monitor
delivery; local backup success is not delivery success. Perform a clean-host restore
from that copy before calling the deployment disaster-recoverable.

## Restore the real terminal

1. Confirm incident scope, available capacity, archive digest, backup age and the
   chosen recovery point. Preserve the old database/volume and existing logs.
2. Stop web/worker/Caddy to prevent writes. Restore onto a **new** PostgreSQL 16
   deployment/volume with distinct credentials. Do not overwrite the only remaining
   database or use `down -v` as a recovery shortcut.
3. Verify the transferred archive's SHA-256. Restore using pg_restore with
   `--exit-on-error --no-owner --no-privileges`, as the administrator of the new
   database. The application uses a dump of `terminal`, not server-wide role secrets.
4. Initialize restricted runtime roles on the fresh deployment. Apply any reviewed
   forward migrations from the matching release and reapply `grant-runtime.sh`.
   Check migration history, constraints, notes/watchlists, provider lineage and
   frozen-report digest reads. Do not replace restored observations with fixtures.
5. Start worker, web and Caddy in dependency order. Verify authenticated readiness,
   current storage status, worker heartbeat, unavailable/stale provider states and
   safe research writes. Confirm live adapters can reconnect without changing
   historical provenance. Old observations remain old.
6. Change DNS/access only after validation and explicit deployment authorization.
   Keep the former volume until the operator has verified the new deployment and
   another off-host backup. Document recovery-point loss and measured recovery time.

Database outage preserves retained records; application errors remain sanitized.
Worker shutdown cancels active database work and rolls unfinished transactions
back. If disk protection persists after pruning, allocated PostgreSQL pages may
remain on disk: plan capacity or deliberate maintenance, not automatic destructive
compaction. Caddy certificate state is separate from database backups; it can be
reissued with correct public DNS/ports, but preserve its secured volume when feasible.
