# GitHub workflow

Repository: `https://github.com/Jertig/crypto-intelligence-terminal` (public).
Phase 0 branch: `chore/project-bootstrap`. Do not force-push or merge failing CI.

Each commit must represent a coherent change and use a conventional message.
The first buildable workspace commit may establish the initial `main` baseline;
the rest of Phase 0 remains on the feature branch for review. Do not merge the
Phase 0 PR without the user's approval.

CI will require formatting, lint, typecheck, deterministic unit tests, production
build, real PostgreSQL migration/integration tests, and browser smoke tests.
Container verification runs on Linux CI if Docker Desktop cannot run locally.

Project model configuration records the user's requested GPT-6.1 Sol with High
reasoning. Project settings do not retroactively prove the effort of an already
active chat turn.
