# Project status

Phase 0 is approved and merged (PR #1, merge d955dde). Phases 1–8 are authorized
sequentially. Active branch: feat/market-core. Current scope: Phase 1 until its
latest CI passes. Its full local QA gate passes: 49 unit, 19 integration,
13 browser tests, strict checks, production builds and Docker recovery.

Implemented: bounded Binance spot REST/WebSocket ingestion, normalization,
snapshots, closed candles, independent funding/OI adapters, retention, provenance,
scanner, selection, chart, freshness and command-palette asset search.

Live spot observations are persisted. Futures is unavailable (timeout).
No data is fabricated. Subsequent phases follow in order after this phase merges.
No VPS deployment performed.
