# Blockers and verification limits

No local implementation blocker requires user intervention.

- Binance public spot REST and stream work locally. Futures requests time out;
  funding/OI adapters expose unavailable states and retry conservatively.
- Global asset identity/market-cap metadata is not connected. Phase 1 uses
  exchange-scoped identities and explicit USDT units.
- Phase 3 DEX/GoPlus public observations work for the default SOL/USDC mints.
  Aggregate event time and supply scope are not verified. Reported market-cap/FDV
  discrepancies withhold the affected indicator. Missing LP/ownership/depth and
  same-pool warm-up history remain explicitly unavailable.
- The development-tool braces advisory remains version-flagged. Its pinned local
  depth guard has regression tests. Production audit is clean; no suppression.
- Helius/FRED/LLM credentials may be absent later; continue with adapters,
  fixtures, unavailable states and documentation.
- Authentication, production TLS, backups and disk protection are Phase 8 scope.
  Current preview is loopback-only. No VPS deployment occurred.
- Resource checks are local, not production-capacity certification.
- Project configuration records GPT-6.1 Sol High; tooling cannot prove an
  already active turn's reasoning selector.
