# PHASED IMPLEMENTATION PLAN

Do not jump ahead without finishing the previous phase.

---

# Phase 0 — Foundation

Goal:
Create a reliable engineering foundation.

Deliver:

- monorepo/repo structure
- Next.js web app
- worker package/app
- shared domain package
- PostgreSQL container
- Drizzle
- migrations
- Docker Compose
- Caddy placeholder/config
- environment validation
- Zod configuration
- lint
- typecheck
- Vitest
- GitHub Actions
- health endpoint
- provider health model
- documentation skeleton
- approved ivory design tokens
- basic shell layout with no fake market data

Suggested commit sequence:

1. `chore: initialize project workspace`
2. `chore: add postgres and docker compose infrastructure`
3. `feat: add environment validation and health endpoint`
4. `test: establish unit testing and CI`
5. `feat: implement terminal shell and design tokens`

Exit criteria:
All Phase 0 QA checks green.

---

# Phase 1 — Market Core

Goal:
Replace the useful market concepts from Abyss with a proper data architecture.

Deliver:

- Binance provider
- asset/market normalization
- websocket ticker stream
- candles
- funding
- open interest
- market snapshots
- ingestion worker
- persistence
- retention
- market scanner
- selected asset inspector
- provenance UI
- basic price chart
- provider staleness state

Do not add wallet or AI features yet.

Exit criteria:

- data comes from live provider
- reconnect behavior works
- no request-time massive API fan-out
- market scanner functional
- data freshness visible

---

# Phase 2 — Feature + Narrative Intelligence

Deliver:

- feature engine
- relative strength
- volume anomaly
- funding normalization
- OI change
- BTC correlation
- market breadth
- market regime
- narrative taxonomy
- narrative scoring v1
- methodology docs
- narrative matrix UI
- narrative detail view

Every score must be explainable.

---

# Phase 3 — Token Risk and Liquidity

Deliver:

- DEX Screener adapter
- DEX liquidity metrics
- GoPlus optional adapter
- contract risk
- ownership risk where data is available
- liquidity risk
- market-structure risk
- Liquidity Vacuum methodology v1
- risk inspector

No single opaque risk number without components.

---

# Phase 4 — Solana Wallet Intelligence

Deliver:

- Helius adapter
- tracked-wallet configuration
- transaction ingestion
- transfer normalization
- bounded wallet history
- wallet labels
- wallet behavior classification
- wallet reputation methodology
- cluster relationships
- wallet explorer UI

Do not index the whole chain.

---

# Phase 5 — Events and Macro

Deliver:

- FRED adapter
- macro series
- event storage
- manual/official event ingestion approach
- event-impact windows
- event study UI
- cross-market comparison
- rolling correlation
- lead/lag research
- explicit non-causality language

---

# Phase 6 — AI Analyst

Deliver:

- read-only analysis tools
- tool contracts
- context retrieval
- evidence-first answers
- analyst memo UI
- sources/provenance
- counter-evidence
- confidence language
- no market-data hallucination

AI should query system data rather than receive giant unstructured dumps.

---

# Phase 7 — Alerts and Research Workflow

Deliver:

- watchlists
- threshold alerts
- data-risk alerts
- narrative change alerts
- provider-down alerts
- research notes
- saved queries
- report snapshots

No automated trading.

---

# Phase 8 — Production Hardening

Deliver:

- production Docker Compose
- Caddy HTTPS
- secure access
- resource limits
- Docker log rotation
- DB backup automation
- external backup destination plan
- retention cron/worker
- disk threshold protection
- deployment docs
- disaster-recovery docs
- final portfolio README

---

# Suggested repository structure

```text
crypto-intelligence-terminal/
├── apps/
│   ├── web/
│   └── worker/
│
├── packages/
│   ├── db/
│   ├── domain/
│   ├── providers/
│   │   ├── binance/
│   │   ├── coingecko/
│   │   ├── dexscreener/
│   │   ├── helius/
│   │   ├── defillama/
│   │   ├── fred/
│   │   └── goplus/
│   ├── indicators/
│   ├── signals/
│   ├── narratives/
│   ├── wallets/
│   ├── events/
│   └── ai-tools/
│
├── infra/
│   ├── caddy/
│   ├── docker/
│   └── backup/
│
├── docs/
├── design/
├── tests/
├── .github/
│   └── workflows/
└── README.md
```
