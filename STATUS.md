# Project status

Phase 0 is complete and awaiting user approval. Phase 1 is not authorized.

- Specification: all numbered files read in order; approved image inspected.
- Repository: public `Jertig/crypto-intelligence-terminal` created.
- Branch: `chore/project-bootstrap`.
- Scope: foundation and initial shell only.
- Review: <https://github.com/Jertig/crypto-intelligence-terminal/pull/1>.
- Market ingestion, intelligence, AI calls, and VPS deployment: not started.

Verified: frozen dependency installation, formatting, ESLint, strict TypeScript,
28 unit tests, 10 real PostgreSQL tests, 10 browser tests, migration consistency,
production builds, and all four local Docker services. Worker shutdown,
dependency failure/recovery, database persistence, port isolation, resource
limits, and rotating logs were checked. Screenshots show the actual local
application without substituted market values.

GitHub Actions runs seven checks on the feature branch and pull request. The
initial Docker job's port assertion was corrected after readiness itself passed.
All seven jobs passed on the corrected implementation:
<https://github.com/Jertig/crypto-intelligence-terminal/actions/runs/37979753742>.
The final documentation commit repeats CI on the current PR head. See
`docs/qa-report.md` for evidence. Keep the PR unmerged until approval.
