# Phase 0 plan

The attached work package is the authoritative specification. The user's explicit
scope and model request take precedence over its recommendations.

## Scope

Create the engineering foundation and initial ivory terminal shell. Stop before
Phase 1. Do not ingest market data, implement providers, generate market values,
call an LLM, deploy, or touch the VPS.

## Bounded changes

1. Initialize the pnpm workspace, Next.js application, worker, shared domain,
   formatting, linting, strict TypeScript, and documentation.
2. Add PostgreSQL 16, the Drizzle foundation migration, bounded worker lifecycle,
   and local Docker Compose with Caddy, resource limits, and rotating logs.
3. Add Zod environment validation, provider-health contracts, and a health route
   that distinguishes application liveness from dependency readiness.
4. Establish deterministic unit tests, migration/integration tests, browser smoke
   tests, dependency checks, and GitHub Actions.
5. Build the approved ivory shell with navigation, command palette, inspector,
   explicit unavailable states, and no fabricated data.
6. Run every applicable section of `docs/specification/05_TESTING_QA_PROMPT.md`,
   repair meaningful defects, capture screenshots, and record evidence.
7. Push `chore/project-bootstrap`, show commits and CI, open a reviewable PR, then
   wait for the user's approval before Phase 1.

## Review gates

Review each coherent change before committing. Use conventional commits. Check
formatting, lint, types, deterministic tests, and production build. Run real
PostgreSQL and container checks where available; report environmental limits
truthfully. GitHub CI must verify migration constraints and browser behavior.

Never commit secrets, `.env`, dumps, runtime data, or generated build artifacts.
Keep `.env.example` values blank. Preserve the supplied specification verbatim.

## Completion

All seven bounded steps have been implemented and locally verified. The complete
checklist and remaining scope limits are recorded in `docs/qa-report.md`.
Phase 1 and VPS deployment remain gated on explicit user approval.
