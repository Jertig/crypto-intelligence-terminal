# Deployment

No VPS deployment is authorized or performed in Phase 0. The Compose and Caddy
configuration is for local validation only, with HTTP bound to loopback. Public
HTTPS, authentication, backups, retention automation, swap policy, monitoring,
and disaster recovery belong to production hardening.

Target: Ubuntu, two vCPU, 2 GB RAM, 40 GB disk. Runtime services: `web`, `worker`,
`postgres`, and `caddy`. The database must remain internal. Runtime builds should
be prepared on a capable workstation or CI rather than assumed feasible on this
small VPS.

Detailed local configuration and verification commands will be added with the
infrastructure implementation.
