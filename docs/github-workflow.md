# GitHub workflow

Repository: `https://github.com/Jertig/crypto-intelligence-terminal` (public).
Phase 0 branch: `chore/project-bootstrap`. Do not force-push or merge failing CI.

Each commit must represent a coherent change and use a conventional message.
The first buildable workspace commit may establish the initial `main` baseline;
the rest of Phase 0 remains on the feature branch for review. Do not merge the
Phase 0 PR without the user's approval.

GitHub Actions requires formatting, lint, strict typecheck, deterministic unit
tests, production build, real PostgreSQL integration tests, browser smoke tests,
and Docker readiness. Actions are pinned to immutable revisions. Workflow
permissions are read-only; database credentials are generated and masked per run.

Docker verification runs locally and on Linux CI. Database isolation is checked
from actual container port bindings. Compose's `port` command can emit
`invalid IP:0` for an unpublished port; its textual output is not an isolation
test.

The Phase 0 pull request is <https://github.com/Jertig/crypto-intelligence-terminal/pull/1>.
Review the feature branch and CI before approving progression. Approval does not
authorize a VPS deployment unless explicitly requested.

Project model configuration records the user's requested GPT-6.1 Sol with High
reasoning. Project settings do not retroactively prove the effort of an already
active chat turn.
