CREATE TABLE "ai_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"asset" text NOT NULL,
	"question" text NOT NULL,
	"tools" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_query_valid" CHECK (length("ai_queries"."title") BETWEEN 1 AND 60 AND "ai_queries"."asset" IN ('BTC','ETH','SOL') AND length("ai_queries"."question") BETWEEN 1 AND 500 AND cardinality("ai_queries"."tools") BETWEEN 1 AND 7 AND "ai_queries"."tools" <@ ARRAY['market','features','risk','wallet','events','macro','providers']::text[])
);
--> statement-breakpoint
CREATE TABLE "alert_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"state" text NOT NULL,
	"evaluation" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_valid" CHECK ("alert_notifications"."state" IN ('TRIGGERED','RECOVERED') AND octet_length("alert_notifications"."evaluation"::text)<=8192)
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"rule" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_known_state" text DEFAULT 'UNKNOWN' NOT NULL,
	"evaluation" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_valid" CHECK (length("alerts"."title") BETWEEN 1 AND 60 AND "alerts"."kind" IN ('THRESHOLD','DATA_RISK','PROVIDER_DOWN','NARRATIVE_CHANGE','RISK','LIQUIDITY') AND "alerts"."rule"->>'kind'="alerts"."kind" AND octet_length("alerts"."rule"::text)<=2048 AND "alerts"."last_known_state" IN ('UNKNOWN','CLEAR','TRIGGERED') AND ("alerts"."evaluation" IS NULL OR octet_length("alerts"."evaluation"::text)<=8192))
);
--> statement-breakpoint
CREATE TABLE "report_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"asset" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" text NOT NULL,
	"digest" text NOT NULL,
	"memo" jsonb NOT NULL,
	CONSTRAINT "report_valid" CHECK (length("report_snapshots"."title") BETWEEN 1 AND 60 AND "report_snapshots"."asset" IN ('BTC','ETH','SOL') AND "report_snapshots"."confidence" IN ('LIMITED','INSUFFICIENT') AND "report_snapshots"."digest" ~ '^[a-f0-9]{64}$' AND octet_length("report_snapshots"."memo"::text)<=131072)
);
--> statement-breakpoint
CREATE TABLE "research_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"asset" text NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_valid" CHECK (length("research_notes"."title") BETWEEN 1 AND 60 AND "research_notes"."asset" IN ('BTC','ETH','SOL') AND length("research_notes"."body") BETWEEN 1 AND 3000 AND octet_length("research_notes"."body")<=12000)
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"filter" text NOT NULL,
	"sort" text NOT NULL,
	"descending" boolean NOT NULL,
	"hidden" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_view_valid" CHECK (length("saved_views"."title") BETWEEN 1 AND 60 AND "saved_views"."filter" ~ '^[A-Za-z0-9]{0,24}$' AND "saved_views"."sort" IN ('base','price','change24h','quoteVolume24h','oi','funding','freshness') AND cardinality("saved_views"."hidden")<=6 AND NOT ('base'=ANY("saved_views"."hidden")) AND "saved_views"."hidden" <@ ARRAY['price','change24h','quoteVolume24h','oi','funding','freshness']::text[])
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"watchlist_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	CONSTRAINT "watchlist_items_watchlist_id_symbol_pk" PRIMARY KEY("watchlist_id","symbol"),
	CONSTRAINT "watch_symbol_valid" CHECK ("watchlist_items"."symbol" ~ '^[A-Z0-9]{1,24}$')
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlists_title_unique" UNIQUE("title"),
	CONSTRAINT "watchlist_title_valid" CHECK (length("watchlists"."title") BETWEEN 1 AND 60)
);
--> statement-breakpoint
ALTER TABLE "alert_notifications" ADD CONSTRAINT "alert_notifications_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_retention_idx" ON "alert_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "report_retention_idx" ON "report_snapshots" USING btree ("created_at");
--> statement-breakpoint
CREATE FUNCTION prevent_report_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Report snapshots are immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER immutable_report BEFORE UPDATE ON report_snapshots FOR EACH ROW EXECUTE FUNCTION prevent_report_update();
