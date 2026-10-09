# GITHUB WORKFLOW AND PORTFOLIO RULES

## 1. Repository

Repository name:

`crypto-intelligence-terminal`

Public portfolio repository unless the user explicitly changes this decision.

---

# 2. Git philosophy

The commit history should tell the story of the engineering process.

Do not upload the finished product as one giant commit.

Do not manufacture hundreds of meaningless commits either.

Each commit should represent a coherent technical change.

---

# 3. Branching

Protected conceptual branches:

- `main`

Feature branches:

- `chore/project-bootstrap`
- `feat/binance-provider`
- `feat/market-normalization`
- `feat/market-scanner`
- `feat/narrative-engine`
- `feat/wallet-intelligence`
- `feat/event-impact`
- `feat/ai-analyst`
- `feat/risk-engine`
- `chore/vps-deployment`

Do not create a branch for every tiny file edit.

---

# 4. Conventional commits

Use meaningful conventional commit messages.

Examples:

```text
chore: initialize monorepo and local infrastructure
feat: add Binance market data adapter
feat: normalize market and asset schemas
feat: implement market scanner workspace
feat: add narrative rotation methodology v1
feat: persist funding and open-interest snapshots
feat: add provider health monitoring
feat: implement Solana wallet tracking pipeline
test: add ingestion normalization fixtures
docs: document data provenance model
fix: reconnect Binance websocket after stream expiry
perf: batch market snapshot persistence
chore: add production Docker Compose configuration
```

Bad:

```text
update
changes
fix
final
final2
working
test
stuff
new version
```

---

# 5. Pull requests

For significant phases:

1. create/update feature branch
2. push branch
3. run CI
4. summarize:
   - what changed
   - why
   - tests
   - screenshots if UI
   - migration impact
   - known limitations
5. only merge if green

Do not bypass failing CI.

---

# 6. Main branch

Never force-push `main`.

Do not directly push experimental broken work to `main`.

Maintain a buildable main branch.

---

# 7. Required CI

Create GitHub Actions that run on pull requests and main pushes.

Minimum:

- dependency install
- lint
- typecheck
- unit tests
- production build

Add integration tests when DB/provider layers exist.

Add Playwright smoke tests when the UI shell exists.

CI must fail when these checks fail.

---

# 8. Secrets

Never commit:

- `.env`
- API keys
- exchange credentials
- wallet private keys
- SSH private keys
- DB dumps
- production DB URL
- cloud credentials
- LLM secrets

Commit:

`.env.example`

Example:

```env
DATABASE_URL=
BINANCE_REST_BASE_URL=
BINANCE_WS_BASE_URL=
COINGECKO_API_KEY=
HELIUS_API_KEY=
FRED_API_KEY=
GOPLUS_API_KEY=
OPENAI_API_KEY=
```

No real values.

---

# 9. .gitignore

At minimum ignore:

```text
.env
.env.*
!.env.example

node_modules/
.next/
dist/
coverage/

*.log

data/
backups/
*.db
*.sqlite
*.sqlite3

.DS_Store

playwright-report/
test-results/
```

Do not ignore migrations.

Do not ignore documentation.

---

# 10. Portfolio README

Keep README concise and credible.

Suggested structure:

# Crypto Intelligence Terminal

One-line description.

Approved screenshot.

## Why I Built It

## Core Capabilities

## Architecture

## Data Sources

## Data Provenance

## Reliability

## Tech Stack

## Local Development

## Testing

## Deployment

## Roadmap

Avoid:

- dozens of badges
- excessive emojis
- exaggerated marketing copy
- "revolutionary"
- "game-changing"
- "100% AI powered"
- giant generated feature lists

---

# 11. Portfolio framing

Do not lead with:

"Built entirely using AI"

Preferred framing:

"I designed and built an AI-native crypto intelligence research terminal combining market structure, narrative rotation, on-chain activity, events, and risk."

AI tools are development tools.

The portfolio should demonstrate:

- product thinking
- systems architecture
- data engineering
- reliability
- testing
- UI design
- research methodology
- infrastructure decisions

---

# 12. Documentation

Maintain:

- `docs/architecture.md`
- `docs/data-sources.md`
- `docs/data-provenance.md`
- `docs/methodologies.md`
- `docs/reliability.md`
- `docs/deployment.md`

Methodology changes must update documentation.

---

# 13. Generated files

Do not commit:

- giant generated lock artifacts beyond normal package manager lockfiles
- temporary screenshots
- local DB snapshots
- provider response dumps containing sensitive values
- build artifacts

Commit only purposeful fixtures.

---

# 14. Codex autonomy rules

Codex/Work may:

- create branches
- commit
- push
- open PRs if GitHub access is available
- fix failing tests
- update docs

Codex/Work must not:

- expose secrets
- rewrite Git history without explicit need
- force push main
- delete remote repositories
- merge broken CI
- disable tests simply to make CI green
- remove validation to bypass errors
- commit fake credentials
