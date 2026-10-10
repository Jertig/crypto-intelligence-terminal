# Data provenance

Quality classes are `DIRECT`, `AGGREGATED`, `DERIVED`, `ESTIMATED`, and
`AI_INTERPRETATION`. Missing data is absence of evidence, not a zero value.

The shared contract requires source, provider identifier, source timestamp,
ingestion timestamp, and quality. Derived and estimated values require a
methodology version. Later metrics must also identify units and relevant revisions.

The approved design image contains illustrative values. It is retained only as
a visual specification and is never loaded as market data or used to seed the
database. Phase 0 shows explicit empty states instead of prices, scores, charts,
funding rates, or AI interpretations.

Provider configuration is distinct from provider health. An unconfigured provider
must never be labeled healthy, live, degraded, or stale.

DEX Screener and GoPlus do not supply a uniform upstream observation timestamp.
Their AGGREGATED provenance uses collection time, explicitly labeled as such in
the Tokens/Risk UI. It never claims the aggregate was measured at that instant.
Derived liquidity comparisons use current collection versus same-pool prior
collection. New calculation time cannot reset the underlying input's freshness.
