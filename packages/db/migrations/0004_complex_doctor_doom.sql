CREATE TABLE "dex_pairs" (
	"id" text PRIMARY KEY NOT NULL,
	"token_id" text NOT NULL,
	"address" text NOT NULL,
	"dex" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"quote_symbol" text NOT NULL,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dex_snapshots" (
	"pair_id" text NOT NULL,
	"bucket_at" timestamp with time zone NOT NULL,
	"price_usd" numeric(38, 18),
	"liquidity_usd" numeric(38, 8),
	"volume_24h_usd" numeric(38, 8),
	"market_cap_usd" numeric(38, 8),
	"fdv_usd" numeric(38, 8),
	"price_change_24h" numeric(20, 8),
	"source" text NOT NULL,
	"provider_id" text NOT NULL,
	"source_timestamp" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"quality" "data_quality" NOT NULL,
	"methodology_version" text,
	CONSTRAINT "dex_snapshots_pair_id_bucket_at_pk" PRIMARY KEY("pair_id","bucket_at"),
	CONSTRAINT "dex_values_valid" CHECK (("dex_snapshots"."price_usd" IS NULL OR "dex_snapshots"."price_usd">0) AND ("dex_snapshots"."liquidity_usd" IS NULL OR "dex_snapshots"."liquidity_usd">=0) AND ("dex_snapshots"."volume_24h_usd" IS NULL OR "dex_snapshots"."volume_24h_usd">=0) AND ("dex_snapshots"."market_cap_usd" IS NULL OR "dex_snapshots"."market_cap_usd">=0) AND ("dex_snapshots"."fdv_usd" IS NULL OR "dex_snapshots"."fdv_usd">=0) AND "dex_snapshots"."quality"='AGGREGATED' AND length("dex_snapshots"."provider_id")>0 AND length("dex_snapshots"."source")>0)
);
--> statement-breakpoint
CREATE TABLE "risk_snapshots" (
	"token_id" text NOT NULL,
	"pair_id" text,
	"bucket_at" timestamp with time zone NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"contract_score" numeric(12, 6),
	"contract_coverage" numeric(8, 6) NOT NULL,
	"ownership_score" numeric(12, 6),
	"ownership_coverage" numeric(8, 6) NOT NULL,
	"liquidity_score" numeric(12, 6),
	"liquidity_coverage" numeric(8, 6) NOT NULL,
	"structure_score" numeric(12, 6),
	"structure_coverage" numeric(8, 6) NOT NULL,
	"categories" jsonb NOT NULL,
	"liquidity_change_1h" numeric(20, 8),
	"volume_liquidity_ratio" numeric(20, 8),
	"vacuum" text NOT NULL,
	"vacuum_reason" text NOT NULL,
	"source" text NOT NULL,
	"provider_id" text NOT NULL,
	"source_timestamp" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"quality" "data_quality" NOT NULL,
	"methodology_version" text,
	CONSTRAINT "risk_snapshots_token_id_bucket_at_methodology_version_pk" PRIMARY KEY("token_id","bucket_at","methodology_version"),
	CONSTRAINT "risk_snapshot_valid" CHECK ("risk_snapshots"."quality"='DERIVED' AND length("risk_snapshots"."methodology_version")>0 AND jsonb_array_length("risk_snapshots"."categories")=4 AND octet_length("risk_snapshots"."categories"::text)<=65536 AND "risk_snapshots"."vacuum" IN ('UNAVAILABLE','HEALTHY','THINNING','VACUUM_FORMING','CRITICAL')),
	CONSTRAINT "risk_contract_valid" CHECK ("risk_snapshots"."contract_coverage" BETWEEN 0 AND 1 AND ("risk_snapshots"."contract_score" IS NULL OR ("risk_snapshots"."contract_coverage"=1 AND "risk_snapshots"."contract_score" BETWEEN 0 AND 100))),
	CONSTRAINT "risk_ownership_valid" CHECK ("risk_snapshots"."ownership_coverage" BETWEEN 0 AND 1 AND ("risk_snapshots"."ownership_score" IS NULL OR ("risk_snapshots"."ownership_coverage"=1 AND "risk_snapshots"."ownership_score" BETWEEN 0 AND 100))),
	CONSTRAINT "risk_liquidity_valid" CHECK ("risk_snapshots"."liquidity_coverage" BETWEEN 0 AND 1 AND ("risk_snapshots"."liquidity_score" IS NULL OR ("risk_snapshots"."liquidity_coverage"=1 AND "risk_snapshots"."liquidity_score" BETWEEN 0 AND 100))),
	CONSTRAINT "risk_structure_valid" CHECK ("risk_snapshots"."structure_coverage" BETWEEN 0 AND 1 AND ("risk_snapshots"."structure_score" IS NULL OR ("risk_snapshots"."structure_coverage"=1 AND "risk_snapshots"."structure_score" BETWEEN 0 AND 100)))
);
--> statement-breakpoint
CREATE TABLE "token_security_snapshots" (
	"token_id" text NOT NULL,
	"bucket_at" timestamp with time zone NOT NULL,
	"mintable" boolean,
	"freezable" boolean,
	"balance_mutable" boolean,
	"closable" boolean,
	"fee_upgradable" boolean,
	"hook_upgradable" boolean,
	"non_transferable" boolean,
	"default_state_upgradable" boolean,
	"top10_holder_share" numeric(12, 8),
	"holder_count" numeric(20, 0),
	"trusted_token" boolean,
	"source" text NOT NULL,
	"provider_id" text NOT NULL,
	"source_timestamp" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"quality" "data_quality" NOT NULL,
	"methodology_version" text,
	CONSTRAINT "token_security_snapshots_token_id_bucket_at_pk" PRIMARY KEY("token_id","bucket_at"),
	CONSTRAINT "token_security_valid" CHECK (("token_security_snapshots"."top10_holder_share" IS NULL OR "token_security_snapshots"."top10_holder_share" BETWEEN 0 AND 1) AND ("token_security_snapshots"."holder_count" IS NULL OR "token_security_snapshots"."holder_count">=0) AND "token_security_snapshots"."quality"='AGGREGATED' AND length("token_security_snapshots"."source")>0 AND length("token_security_snapshots"."provider_id")>0)
);
--> statement-breakpoint
CREATE TABLE "tracked_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "token_chain_valid" CHECK ("tracked_tokens"."chain" IN ('solana','ethereum','base','bsc'))
);
--> statement-breakpoint
ALTER TABLE "dex_pairs" ADD CONSTRAINT "dex_pairs_token_id_tracked_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tracked_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dex_snapshots" ADD CONSTRAINT "dex_snapshots_pair_id_dex_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."dex_pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_snapshots" ADD CONSTRAINT "risk_snapshots_token_id_tracked_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tracked_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_snapshots" ADD CONSTRAINT "risk_snapshots_pair_id_dex_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."dex_pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_security_snapshots" ADD CONSTRAINT "token_security_snapshots_token_id_tracked_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tracked_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dex_retention_idx" ON "dex_snapshots" USING btree ("bucket_at");--> statement-breakpoint
CREATE INDEX "risk_retention_idx" ON "risk_snapshots" USING btree ("bucket_at");--> statement-breakpoint
CREATE INDEX "token_security_retention_idx" ON "token_security_snapshots" USING btree ("bucket_at");