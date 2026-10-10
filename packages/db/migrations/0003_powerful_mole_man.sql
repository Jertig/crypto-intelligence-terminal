CREATE TABLE "asset_narratives" (
	"asset_id" text NOT NULL,
	"narrative_id" text NOT NULL,
	"weight" numeric(8, 6) NOT NULL,
	"source" text NOT NULL,
	"methodology_version" text NOT NULL,
	CONSTRAINT "asset_narratives_asset_id_narrative_id_pk" PRIMARY KEY("asset_id","narrative_id"),
	CONSTRAINT "exposure_valid" CHECK ("asset_narratives"."weight" > 0 AND "asset_narratives"."weight" <= 1 AND length("asset_narratives"."source") > 0 AND length("asset_narratives"."methodology_version") > 0)
);
--> statement-breakpoint
CREATE TABLE "feature_snapshots" (
	"market_id" text NOT NULL,
	"bucket_at" timestamp with time zone NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"return_5m" numeric(38, 18),
	"return_1h" numeric(38, 18),
	"return_24h" numeric(38, 18),
	"return_7d" numeric(38, 18),
	"relative_strength_btc" numeric(38, 18),
	"relative_strength_sector" numeric(38, 18),
	"volume_zscore" numeric(38, 18),
	"volume_acceleration" numeric(38, 18),
	"oi_change_1h" numeric(38, 18),
	"oi_change_24h" numeric(38, 18),
	"funding_zscore" numeric(38, 18),
	"btc_corr_30d" numeric(38, 18),
	"perp_basis" numeric(38, 18),
	"realized_volatility_24h" numeric(38, 18),
	"metadata" jsonb NOT NULL,
	"source" text NOT NULL,
	"provider_id" text NOT NULL,
	"source_timestamp" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"quality" "data_quality" NOT NULL,
	"methodology_version" text,
	CONSTRAINT "feature_snapshots_market_id_bucket_at_methodology_version_pk" PRIMARY KEY("market_id","bucket_at","methodology_version"),
	CONSTRAINT "feature_provenance_valid" CHECK ("feature_snapshots"."quality" = 'DERIVED' AND length("feature_snapshots"."methodology_version") > 0 AND length("feature_snapshots"."provider_id") > 0 AND length("feature_snapshots"."source") > 0 AND jsonb_array_length("feature_snapshots"."metadata") = 14 AND octet_length("feature_snapshots"."metadata"::text) <= 65536)
);
--> statement-breakpoint
CREATE TABLE "narrative_snapshots" (
	"narrative_id" text NOT NULL,
	"bucket_at" timestamp with time zone NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"score" numeric(12, 6),
	"partial_score" numeric(12, 6),
	"coverage" numeric(8, 6) NOT NULL,
	"asset_count" integer NOT NULL,
	"components" jsonb NOT NULL,
	"source" text NOT NULL,
	"provider_id" text NOT NULL,
	"source_timestamp" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"quality" "data_quality" NOT NULL,
	"methodology_version" text,
	CONSTRAINT "narrative_snapshots_narrative_id_bucket_at_methodology_version_pk" PRIMARY KEY("narrative_id","bucket_at","methodology_version"),
	CONSTRAINT "narrative_score_valid" CHECK ("narrative_snapshots"."coverage" >= 0 AND "narrative_snapshots"."coverage" <= 1 AND ("narrative_snapshots"."score" IS NULL OR ("narrative_snapshots"."coverage" = 1 AND "narrative_snapshots"."score" BETWEEN 0 AND 100)) AND ("narrative_snapshots"."partial_score" IS NULL OR "narrative_snapshots"."partial_score" BETWEEN 0 AND 100) AND "narrative_snapshots"."asset_count" BETWEEN 0 AND 30 AND jsonb_array_length("narrative_snapshots"."components") = 6 AND "narrative_snapshots"."quality" = 'DERIVED' AND "narrative_snapshots"."methodology_version" IS NOT NULL AND length("narrative_snapshots"."methodology_version") > 0)
);
--> statement-breakpoint
CREATE TABLE "narratives" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"taxonomy_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_explanations" (
	"signal_id" text NOT NULL,
	"name" text NOT NULL,
	"value" numeric(38, 18),
	"unit" text NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "signal_explanations_signal_id_name_pk" PRIMARY KEY("signal_id","name")
);
--> statement-breakpoint
CREATE TABLE "signal_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"bucket_at" timestamp with time zone NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"value" numeric(20, 8),
	"coverage" numeric(8, 6) NOT NULL,
	"source" text NOT NULL,
	"provider_id" text NOT NULL,
	"source_timestamp" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"quality" "data_quality" NOT NULL,
	"methodology_version" text,
	CONSTRAINT "signal_provenance_valid" CHECK ("signal_snapshots"."kind" IN ('BREADTH', 'REGIME') AND "signal_snapshots"."coverage" BETWEEN 0 AND 1 AND "signal_snapshots"."quality" = 'DERIVED' AND "signal_snapshots"."methodology_version" IS NOT NULL AND length("signal_snapshots"."methodology_version") > 0)
);
--> statement-breakpoint
ALTER TABLE "asset_narratives" ADD CONSTRAINT "asset_narratives_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_narratives" ADD CONSTRAINT "asset_narratives_narrative_id_narratives_id_fk" FOREIGN KEY ("narrative_id") REFERENCES "public"."narratives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_snapshots" ADD CONSTRAINT "feature_snapshots_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative_snapshots" ADD CONSTRAINT "narrative_snapshots_narrative_id_narratives_id_fk" FOREIGN KEY ("narrative_id") REFERENCES "public"."narratives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_explanations" ADD CONSTRAINT "signal_explanations_signal_id_signal_snapshots_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signal_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feature_retention_idx" ON "feature_snapshots" USING btree ("bucket_at");--> statement-breakpoint
CREATE INDEX "narrative_retention_idx" ON "narrative_snapshots" USING btree ("bucket_at");--> statement-breakpoint
CREATE INDEX "signal_retention_idx" ON "signal_snapshots" USING btree ("bucket_at");