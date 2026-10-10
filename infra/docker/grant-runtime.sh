#!/bin/sh
set -eu
# Reapply after each migration or restore, using administrator only for this task.
psql -v ON_ERROR_STOP=1 --username terminal_admin --dbname terminal <<'SQL'
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM terminal_web,terminal_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO terminal_web,terminal_worker;
GRANT INSERT,UPDATE,DELETE ON watchlists,watchlist_items,research_notes,ai_queries,saved_views,alerts TO terminal_web;
GRANT INSERT,DELETE ON report_snapshots TO terminal_web;
GRANT DELETE ON alert_notifications TO terminal_web;
GRANT INSERT,UPDATE,DELETE ON assets,venues,markets,market_snapshots,ohlcv,funding_rates,open_interest,ingestion_runs,feature_snapshots,narratives,asset_narratives,narrative_snapshots,signal_snapshots,signal_explanations,tracked_tokens,dex_pairs,dex_snapshots,token_security_snapshots,risk_snapshots,tracked_wallets,wallet_transactions,wallet_history_summaries,wallet_provider_budget,macro_observations,event_impacts,provider_health,worker_heartbeats,operations_status,alerts,alert_notifications TO terminal_worker;
GRANT DELETE ON report_snapshots TO terminal_worker;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,terminal_web,terminal_worker;
SQL
