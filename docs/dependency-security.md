# Dependency security

Production dependencies are audited separately from development tooling.

`braces@3.0.3`, reached through Next's lint plugin, has no upstream patched
release for [CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The pinned pnpm patch adds a fixed depth guard of 128 to parsing and recursive
compile, expand, and stringify walkers. Regression tests cover ordinary patterns,
deep string input, and directly supplied ASTs. This package is development-only
and is not used for public request inputs.

The registry audit remains version-based and still reports the upstream advisory;
it cannot identify the local patch. No advisory is hidden or muted. Replace the
patch with an upstream fixed release when available. Treat arbitrary unreviewed
lint configuration as code, not safe data.

The obsolete esbuild dependency under Drizzle Kit's legacy loader is overridden
to a patched version. Migration generation and execution must pass after this
override. ESLint is pinned to 9.39.5 because the current Next lint plugins declare
peer support through 9.x. Installing 10.x fails the strict dependency gate, so it
is not forced through. No ESLint rules, peer validation, or tests are disabled to
obtain a green result. Update this compatible toolchain when the plugins support
the next major line.

## Runtime image review

Phase 8 scans the effective filesystem of all four runtime images with Trivy
v0.75.0 (official release archive verified against its SHA-256 checksums). The
original Node image bundled vulnerable npm/Corepack dependencies that are not
needed by the compiled applications. Runtime stages remove these tools and install
Alpine's fixed `zlib=1.3.2-r1`; dependency installation remains in build stages.

The current official Caddy binary was compiled with an older Go patch and
`golang.org/x/net`. The gateway retains Caddy v2.11.7's standard modules, compiled
with pinned Go 1.27.2 and x/net v0.60.0. PostgreSQL 16 remains the official pinned
database image; only its `gosu` v1.19 privilege helper is rebuilt with the same Go
patch, moby/sys/user v0.4.1 and x/sys v0.44.0. Both Go module graphs/checksums are
committed. No build toolchain is added to runtime containers. Four immutable
prebuilt image references are required by production configuration.

Trivy's module-version inventory can report GO-2026-5932 for x/crypto's abandoned
OpenPGP package. Caddy does not import that package; its build explicitly checks
the full dependency package list and fails if OpenPGP appears. This finding is
recorded, not hidden by a scanner ignore rule. Future source/dependency changes
must repeat this review and the complete container/recovery gate.

Primary references: [Go security release](https://go.dev/doc/devel/release#go1.27.2),
[standard Caddy build](https://github.com/caddyserver/caddy/blob/v2.11.7/cmd/caddy/main.go),
[gosu CVE policy](https://github.com/tianon/gosu/blob/master/SECURITY.md),
[Trivy image scanning](https://trivy.dev/docs/latest/target/container_image/).
