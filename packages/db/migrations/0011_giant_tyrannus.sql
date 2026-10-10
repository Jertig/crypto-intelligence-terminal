CREATE TABLE "operations_status" (
	"id" text PRIMARY KEY NOT NULL,
	"observation" jsonb NOT NULL,
	CONSTRAINT "operations_bounded" CHECK ("operations_status"."id"='primary' AND octet_length("operations_status"."observation"::text)<=8192)
);
