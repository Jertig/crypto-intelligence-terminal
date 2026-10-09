# START HERE — Crypto Intelligence Terminal

This folder is the authoritative build brief for the project.

## Project
**Repository name:** `crypto-intelligence-terminal`  
**Product name:** `Crypto Intelligence Terminal`

This is a long-running public portfolio project, not a one-shot dashboard demo.

## Recommended execution environment
Use **GPT-6 Astra in Work mode with High thinking** for the primary build and repo work.

Use Codex-style coding workflows inside Work for implementation, testing, Git, and deployment tasks.

## Before writing code
Read these files in this exact order:

1. `01_MASTER_BUILD_PROMPT.md`
2. `02_ARCHITECTURE_AND_DATA_SPEC.md`
3. `03_DESIGN_SYSTEM.md`
4. `04_GITHUB_WORKFLOW.md`
5. `05_TESTING_QA_PROMPT.md`
6. `06_PHASED_IMPLEMENTATION_PLAN.md`

Also inspect:

`design/approved-ivory-terminal-reference.png`

The image is the approved visual direction.

## Non-negotiable workflow
Do **not** attempt to build the entire application in one pass.

Work phase-by-phase.

For each phase:

1. inspect current repository state
2. write/update a short plan
3. implement one bounded feature set
4. run lint/typecheck/tests/build
5. review changes
6. commit using a meaningful conventional commit
7. push the feature branch
8. open/update a PR if remote access allows it
9. do not merge broken code into `main`

## GitHub principle
The Git history must tell the story of the project.

Do not create one giant "initial project" commit containing everything.

Do not use commit messages like:

- update
- fix
- final
- stuff
- changes
- working

## Product principle
This is an **intelligence and research terminal**, not an AI-generated crypto dashboard and not primarily a trade-execution application.

It should answer:

1. What is moving?
2. Why is it moving?
3. Who is moving it?
4. What is the risk?

## Design principle
The visual language is an ivory/off-white institutional research workstation.

Avoid generic AI-dashboard aesthetics.

See `03_DESIGN_SYSTEM.md`.

## Data principle
AI must never be the source of factual market data.

Every important datapoint should be traceable and classified as:

- DIRECT
- AGGREGATED
- DERIVED
- ESTIMATED
- AI INTERPRETATION

## VPS constraints
Target environment:

- Ubuntu VPS
- 2 vCPU
- 2 GB RAM
- 40 GB disk
- Docker available
- clean-slate environment

Do not over-engineer.

No Kubernetes, Kafka, ClickHouse, Prometheus stack, or other infrastructure unless the current scale objectively requires it.

## First task
Start with **Phase 0 only**.

Do not continue into later phases until Phase 0 passes all checks in `05_TESTING_QA_PROMPT.md`.
