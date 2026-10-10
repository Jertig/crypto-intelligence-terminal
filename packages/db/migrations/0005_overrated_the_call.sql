CREATE TABLE "tracked_wallets" (
	"address" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"label_source" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"first_observed_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"coverage" text DEFAULT 'UNAVAILABLE' NOT NULL,
	CONSTRAINT "wallet_coverage_valid" CHECK ("tracked_wallets"."coverage" IN ('UNAVAILABLE','BOUNDED','TRUNCATED'))
);
--> statement-breakpoint
CREATE TABLE "wallet_history_summaries" (
	"wallet_address" text NOT NULL,
	"month" text NOT NULL,
	"transaction_count" integer NOT NULL,
	"failed_count" integer NOT NULL,
	"first_observed_at" timestamp with time zone NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "wallet_history_summaries_wallet_address_month_pk" PRIMARY KEY("wallet_address","month"),
	CONSTRAINT "wallet_summary_counts_valid" CHECK ("wallet_history_summaries"."transaction_count">0 AND "wallet_history_summaries"."failed_count" BETWEEN 0 AND "wallet_history_summaries"."transaction_count" AND "wallet_history_summaries"."first_observed_at"<="wallet_history_summaries"."last_observed_at")
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"wallet_address" text NOT NULL,
	"signature" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"observation" jsonb NOT NULL,
	CONSTRAINT "wallet_transactions_wallet_address_signature_pk" PRIMARY KEY("wallet_address","signature"),
	CONSTRAINT "wallet_observation_bounded" CHECK (octet_length("wallet_transactions"."observation"::text)<=65536 AND "wallet_transactions"."observation"->>'signature'="wallet_transactions"."signature" AND "wallet_transactions"."observation"->'provenance'->>'providerId'='helius' AND "wallet_transactions"."observation"->'provenance'->>'quality'='AGGREGATED')
);
--> statement-breakpoint
ALTER TABLE "wallet_history_summaries" ADD CONSTRAINT "wallet_history_summaries_wallet_address_tracked_wallets_address_fk" FOREIGN KEY ("wallet_address") REFERENCES "public"."tracked_wallets"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_address_tracked_wallets_address_fk" FOREIGN KEY ("wallet_address") REFERENCES "public"."tracked_wallets"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_history_idx" ON "wallet_transactions" USING btree ("wallet_address","timestamp");