# Project boundaries

The user-supplied work package in `docs/specification` is the project
specification. Read `START_HERE.md`, all numbered files in order, and the approved
reference in `design` before expanding implementation. Direct user instructions
take precedence over the attached documents.

Phase 0 is complete. Do not start Phase 1 or deploy to the VPS without explicit
user approval. Keep existing history and the public repository intact. Work on
coherent feature branches, use conventional commits, push verified changes, and
review CI before merging. Do not merge the Phase 0 PR automatically.

Never commit secrets, nonblank example credentials, `.env`, dumps, runtime market
data, or fake live observations. Missing evidence must remain visibly absent.
Keep migrations and normal lockfiles tracked. Maintain the approved ivory design.

Use Node.js 24 and pnpm 10.33.0. Run `pnpm qa`, migration consistency, guarded
PostgreSQL integration tests, Playwright smoke tests, and applicable Docker checks
after meaningful changes. The complete QA contract is
`docs/specification/05_TESTING_QA_PROMPT.md`. Do not silence failures or skip tests
to obtain green CI. Keep resource-intensive local checks sequential.

Integration tests reset only the local disposable `terminal_test` database.
Do not delete persistent volumes as part of routine QA. Local Compose uses
loopback HTTP and is not a secured production deployment.
