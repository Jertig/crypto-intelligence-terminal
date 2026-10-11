# Production deployment

`compose.production.yaml` runs prebuilt images with authenticated HTTPS,
restricted database roles, storage protection and persistent volumes.
`compose.yaml` is the loopback development stack; see
[local setup](development.md) for development and integration tests.

The supplied host-service examples use Ubuntu and systemd. The
[reference profile](reference-profile.md) records the default resource budget and
local measurements; it is not a universal hardware requirement or a VPS benchmark.
Review [operations](operations.md) and [recovery](disaster-recovery.md) before deployment.

## Prerequisites

Use Docker Engine with Compose >=2.24.4, Node.js 24 and Git for host operations.
Create a trusted operations account, secure SSH/firewall access and bound host
journal storage. Publish TCP 80/443 through Caddy; keep PostgreSQL internal.
Point the chosen domain's DNS to the host before requesting public HTTPS.

Verify host time synchronization and compare provider clocks. Market quotes allow
five seconds of skew; analyst facts exclude future observations. Preserve source
timestamps instead of clamping them to the collection clock.

Build the four images on a development machine or CI:

```sh
docker compose build worker
docker compose build web
docker compose build postgres
docker compose build caddy
```

Inspect their immutable image IDs, then transfer a verified `docker save` archive
or publish digest-pinned registry images. Load the images on the runtime host and
keep the previous release for rollback. Avoid accumulating build caches on a
small host. Base-image updates need dependency and container/recovery checks.

## Configuration

Copy `.env.example` to ignored `.env.production` and set file mode 0600.
Configure:

| Setting                                                                  | Value                                               |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| `POSTGRES_PASSWORD`, `POSTGRES_WEB_PASSWORD`, `POSTGRES_WORKER_PASSWORD` | Distinct 32–128-character URL-safe random passwords |
| `WEB_IMAGE`, `WORKER_IMAGE`, `POSTGRES_IMAGE`, `CADDY_IMAGE`             | Immutable sha256 image IDs or registry digests      |
| `APP_ORIGIN`                                                             | Exact public HTTPS origin                           |
| `ACCESS_USER`, `ACCESS_HASH`                                             | Gateway identity and bcrypt hash, cost 12–14        |

Generate the gateway hash with `caddy hash-password` using stdin, not a plaintext
command-line argument. Quote the hash in the environment file to preserve dollar
signs. Leave optional provider settings blank when unused; model calls require
explicit enablement, key and model. Each service receives only its needed values.

## Start and update

```sh
node infra/ops/terminal.mjs validate
node infra/ops/terminal.mjs initialize
node infra/ops/terminal.mjs start
node infra/ops/terminal.mjs status
node infra/ops/terminal.mjs backup
node infra/ops/terminal.mjs verify-restore
```

`initialize` starts PostgreSQL, runs administrator migrations in a one-off worker
container and reapplies runtime grants. Repeat it before starting a schema update.
The permanent worker does not have migration privileges. Review a backup and
forward-schema compatibility before rolling images back; do not rewrite migrations.

Install the [backup service and timer](operations.md#backup-automation) after
adjusting their account/path and testing commands as that account. Configure an
independent off-host destination and verify a clean-host restore.

Public TLS issuance, firewall behavior, sustained host capacity, timer delivery
and off-host recovery still require deployment validation. Local container tests
have passed; no live VPS deployment or off-host recovery is claimed.

## Private access without a domain

Use the same production images, roles, volumes and backup paths with an explicit
private profile. Set `APP_ORIGIN=https://localhost:18443` in `.env.production`.
Add `--private` to every operations command, including the backup timer:

```sh
node infra/ops/terminal.mjs validate --private
node infra/ops/terminal.mjs initialize --private
node infra/ops/terminal.mjs start --private
node infra/ops/terminal.mjs backup --private
node infra/ops/terminal.mjs verify-restore --private
```

The profile replaces public ports with `127.0.0.1:18443`, keeps gateway
authentication, and uses Caddy's internal CA for HTTPS. Live providers remain
available. It does not use the isolated QA database or backup directory.
For direct Compose commands, add
`-f infra/docker/compose.production-private.yaml` after the production file.

From the client, forward the same local port through authenticated SSH:

```sh
ssh -N -L 127.0.0.1:18443:127.0.0.1:18443 user@host
```

Visit `https://localhost:18443`. Obtain Caddy's public root certificate through
the authenticated SSH connection (`/data/caddy/pki/authorities/local/root.crt`
inside Caddy). Validate requests with `curl --cacert root.crt --user operator`;
let curl prompt for the gateway password. Browser access requires trusting this
CA in a dedicated browser profile. Do not disable TLS verification, export CA
private keys, or expose this listener on a public interface. No domain or public
certificate is claimed. Switching to public HTTPS requires verified DNS and the
standard production profile.

## Isolated container verification

Build the four images above, then run:

```sh
node infra/ops/verify-production.mjs
```

The verifier creates/reuses `terminal-production-qa` with separate database and
gateway volumes, generated ignored credentials and HTTPS on localhost:18443.
Backups/status/locks use `data/operations-qa`; production uses `data/operations`.
The QA override publishes only loopback ports and uses Caddy's internal CA.
Only the test client accepts that local certificate.

Checks cover authentication, Origin rules, database permissions, test-only storage
protection, record persistence, shutdown/outage/recovery and a real dump/restore.
Live ingestion and model calls are disabled. Results are written to
`.work/production-verification.json`. Persistent volumes are retained. Do not
use the QA override for a public deployment.

## Direct public IPv4 access without a domain

Use this only when direct network access is intended. Preserve the current pinned
images, production database, Caddy CA volumes and credentials. Set `PUBLIC_IP` to
the VPS IPv4 address and `APP_ORIGIN=https://<IPv4>:18443` in the protected
`.env.production`. Use `--public-ip` instead of `--private` for every operations
command, including the installed backup service. These profiles are mutually
exclusive. For manual Compose commands use `compose.production.yaml` plus
`infra/docker/compose.production-public-ip.yaml`, project `terminal-production`.

The profile publishes only Caddy on `0.0.0.0:18443/tcp`; web, worker and PostgreSQL
remain internal. It retains authenticated HTTPS and the production volumes. Caddy
issues an IP-subject certificate from its existing internal CA, renews it
intentionally, and selects the configured IP certificate for clients without SNI.
Only web and Caddy need recreation when changing the origin/binding; do not rerun
initialization, regenerate credentials, remove volumes or retag the release.

Public IP certificates are supported by some public CAs, but their ACME HTTP/TLS
validation requires port 80 or 443. The high-port-only profile therefore explicitly
uses local trust. Do not open additional ports or fall back to HTTP to avoid trust
setup. References: [ACME challenges](https://letsencrypt.org/docs/challenge-types/)
and [Caddy default SNI](https://caddyserver.com/docs/caddyfile/options#default-sni).

Inspect host and cloud firewalls before the switch. Authorize inbound **TCP 18443**
from the operator's trusted source IP/CIDR where practical (or `0.0.0.0/0` when
access from arbitrary IPv4 networks is intentional). Leave SSH and other rules
unchanged. A cloud security group must allow the port independently of the host.
Verify from outside the VPS with the correct CA and IP hostname checks, no TLS
verification bypass: unauthenticated 401, authenticated dashboard/readiness 200,
research persistence and current providers. Check browser bundles/logs for secrets.

### Windows certificate trust

Export only `/data/caddy/pki/authorities/local/root.crt` from the Caddy container
over verified SSH. Compare its SHA-256 fingerprint against an independently
retrieved SSH fingerprint before trusting it. Never copy the CA private key.
For Edge/Chrome on Windows, import that one certificate into the **Current User**
Trusted Root Certification Authorities store:

```powershell
certutil -user -addstore Root .\terminal-root.crt
```

Restart the browser and open `https://<IPv4>:18443`. This trusts certificates issued
by that CA for the current Windows user, not just this IP; protect the server CA
key and do not import unrelated certificates. To undo trust, remove precisely its
thumbprint with `certutil -user -delstore Root <thumbprint>`. A dedicated browser
profile with its own CA store is preferable when supported. Never use a browser
certificate-warning bypass as normal access.

All four services retain `unless-stopped`. Confirm Docker is enabled at boot and
that the backup timer remains active. After external access succeeds, a controlled
Docker-service restart (not `compose down`) can verify automatic return without
altering SSH or destroying data. Compare research records/volume identity before
and after, then check heartbeat, readiness and live ingestion. Explicitly stopped
containers do not automatically resume under `unless-stopped`; start them before
the persistence test. Record a new public-IP soak baseline after this change.
