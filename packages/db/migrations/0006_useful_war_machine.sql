CREATE TABLE "wallet_provider_budget" (
	"day" text PRIMARY KEY NOT NULL,
	"requests" integer NOT NULL,
	CONSTRAINT "wallet_daily_budget_valid" CHECK ("wallet_provider_budget"."requests" BETWEEN 1 AND 4)
);
