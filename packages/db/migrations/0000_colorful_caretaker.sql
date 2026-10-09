CREATE TYPE "public"."data_quality" AS ENUM('DIRECT', 'AGGREGATED', 'DERIVED', 'ESTIMATED', 'AI_INTERPRETATION');--> statement-breakpoint
CREATE TYPE "public"."provider_status" AS ENUM('HEALTHY', 'DEGRADED', 'STALE', 'DOWN');--> statement-breakpoint
CREATE TABLE "provider_health" (
	"provider_id" text PRIMARY KEY NOT NULL,
	"status" "provider_status" NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"error_code" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_id_nonempty" CHECK (length(trim("provider_health"."provider_id")) > 0),
	CONSTRAINT "observed_status_requires_success" CHECK ("provider_health"."status" NOT IN ('HEALTHY', 'STALE') OR "provider_health"."last_success_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"name" text PRIMARY KEY NOT NULL,
	"instance_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "worker_name_nonempty" CHECK (length(trim("worker_heartbeats"."name")) > 0),
	CONSTRAINT "heartbeat_after_start" CHECK ("worker_heartbeats"."last_seen_at" >= "worker_heartbeats"."started_at")
);
