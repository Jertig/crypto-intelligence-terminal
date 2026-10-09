CREATE TYPE "public"."candle_interval" AS ENUM('1m', '5m', '1h', '1d');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"identity_source" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "asset_identity_nonempty" CHECK (length("assets"."id") > 0 AND length("assets"."symbol") > 0)
);
--> statement-breakpoint
CREATE TABLE "funding_rates" (
	"market_id" text NOT NULL,
	"rate" numeric(20, 12) NOT NULL,
	"mark_price" numeric(38, 18) NOT NULL,
	"next_funding_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"provider_id" text NOT NULL,
	"source_timestamp" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"quality" "data_quality" NOT NULL,
	"methodology_version" text,
	CONSTRAINT "funding_rates_market_id_source_timestamp_pk" PRIMARY KEY("market_id","source_timestamp"),
	CONSTRAINT "funding_positive_price" CHECK ("funding_rates"."mark_price" > 0)
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"persisted_rows" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ingestion_run_valid" CHECK ("ingestion_runs"."status" IN ('SUCCESS', 'FAILED') AND "ingestion_runs"."persisted_rows" >= 0 AND "ingestion_runs"."completed_at" >= "ingestion_runs"."started_at")
);
--> statement-breakpoint
CREATE TABLE "market_snapshots" (
	"market_id" text PRIMARY KEY NOT NULL,
	"price" numeric(38, 18) NOT NULL,
	"change_24h" numeric(20, 8) NOT NULL,
	"quote_volume_24h" numeric(38, 8) NOT NULL,
	"source" text NOT NULL,
	"provider_id" text NOT NULL,
	"source_timestamp" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"quality" "data_quality" NOT NULL,
	"methodology_version" text,
	CONSTRAINT "snapshot_positive_values" CHECK ("market_snapshots"."price" > 0 AND "market_snapshots"."quote_volume_24h" >= 0),
	CONSTRAINT "snapshot_provenance_valid" CHECK (length("market_snapshots"."source") > 0 AND length("market_snapshots"."provider_id") > 0 AND ("market_snapshots"."quality" NOT IN ('DERIVED', 'ESTIMATED') OR "market_snapshots"."methodology_version" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"symbol" text NOT NULL,
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"kind" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "market_kind_valid" CHECK ("markets"."kind" IN ('SPOT', 'PERPETUAL'))
);
--> statement-breakpoint
CREATE TABLE "ohlcv" (
	"market_id" text NOT NULL,
	"timeframe" "candle_interval" NOT NULL,
	"open_time" timestamp with time zone NOT NULL,
	"close_time" timestamp with time zone NOT NULL,
	"open" numeric(38, 18) NOT NULL,
	"high" numeric(38, 18) NOT NULL,
	"low" numeric(38, 18) NOT NULL,
	"close" numeric(38, 18) NOT NULL,
	"volume" numeric(38, 18) NOT NULL,
	"source" text NOT NULL,
	"provider_id" text NOT NULL,
	"source_timestamp" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"quality" "data_quality" NOT NULL,
	"methodology_version" text,
	CONSTRAINT "ohlcv_market_id_timeframe_open_time_pk" PRIMARY KEY("market_id","timeframe","open_time"),
	CONSTRAINT "ohlcv_valid" CHECK ("ohlcv"."open" > 0 AND "ohlcv"."close" > 0 AND "ohlcv"."low" > 0 AND "ohlcv"."high" >= greatest("ohlcv"."open", "ohlcv"."close", "ohlcv"."low") AND "ohlcv"."low" <= least("ohlcv"."open", "ohlcv"."close") AND "ohlcv"."volume" >= 0 AND "ohlcv"."close_time" > "ohlcv"."open_time"),
	CONSTRAINT "ohlcv_provenance_valid" CHECK (length("ohlcv"."source") > 0 AND length("ohlcv"."provider_id") > 0 AND ("ohlcv"."quality" NOT IN ('DERIVED', 'ESTIMATED') OR "ohlcv"."methodology_version" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "open_interest" (
	"market_id" text NOT NULL,
	"quantity" numeric(38, 18) NOT NULL,
	"unit" text NOT NULL,
	"source" text NOT NULL,
	"provider_id" text NOT NULL,
	"source_timestamp" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"quality" "data_quality" NOT NULL,
	"methodology_version" text,
	CONSTRAINT "open_interest_market_id_source_timestamp_pk" PRIMARY KEY("market_id","source_timestamp"),
	CONSTRAINT "oi_nonnegative" CHECK ("open_interest"."quantity" >= 0 AND length("open_interest"."unit") > 0)
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "funding_rates" ADD CONSTRAINT "funding_rates_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ohlcv" ADD CONSTRAINT "ohlcv_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_interest" ADD CONSTRAINT "open_interest_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "funding_retention_idx" ON "funding_rates" USING btree ("source_timestamp");--> statement-breakpoint
CREATE INDEX "ingestion_retention_idx" ON "ingestion_runs" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "ohlcv_retention_idx" ON "ohlcv" USING btree ("timeframe","open_time");--> statement-breakpoint
CREATE INDEX "oi_retention_idx" ON "open_interest" USING btree ("source_timestamp");