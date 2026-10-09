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
