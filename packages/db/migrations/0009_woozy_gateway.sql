CREATE TABLE "event_impacts" (
	"event_id" text NOT NULL,
	"asset" text NOT NULL,
	"window_minutes" integer NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"observation" jsonb NOT NULL,
	CONSTRAINT "event_impacts_event_id_asset_window_minutes_pk" PRIMARY KEY("event_id","asset","window_minutes"),
	CONSTRAINT "event_impact_valid" CHECK ("event_impacts"."asset" IN ('BTC','ETH','SOL') AND "event_impacts"."window_minutes" IN (5,60,240,1440) AND octet_length("event_impacts"."observation"::text)<=4096)
);
--> statement-breakpoint
CREATE TABLE "macro_observations" (
	"series_id" text NOT NULL,
	"date" text NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"observation" jsonb NOT NULL,
	CONSTRAINT "macro_observations_series_id_date_collected_at_pk" PRIMARY KEY("series_id","date","collected_at"),
	CONSTRAINT "macro_lineage_valid" CHECK (octet_length("macro_observations"."observation"::text)<=4096 AND "macro_observations"."observation"->>'seriesId'="macro_observations"."series_id" AND "macro_observations"."observation"->>'date'="macro_observations"."date" AND "macro_observations"."observation"->'provenance'->>'providerId'='fred' AND "macro_observations"."observation"->'provenance'->>'quality'='DIRECT')
);
--> statement-breakpoint
CREATE TABLE "research_events" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"observation" jsonb NOT NULL,
	CONSTRAINT "event_payload_valid" CHECK (octet_length("research_events"."observation"::text)<=4096 AND "research_events"."observation"->>'id'="research_events"."id")
);
--> statement-breakpoint
ALTER TABLE "event_impacts" ADD CONSTRAINT "event_impacts_event_id_research_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."research_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "macro_retention_idx" ON "macro_observations" USING btree ("collected_at");--> statement-breakpoint
CREATE INDEX "event_time_idx" ON "research_events" USING btree ("timestamp");