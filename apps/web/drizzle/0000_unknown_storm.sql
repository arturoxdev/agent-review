CREATE TYPE "public"."session_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."snapshot_status" AS ENUM('ready', 'pending', 'failed');--> statement-breakpoint
CREATE TABLE "annotations" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"number" integer NOT NULL,
	"body" text NOT NULL,
	"target" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annotations_entry_id_number_unique" UNIQUE("entry_id","number")
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"order" integer NOT NULL,
	"url" text NOT NULL,
	"page_title" text NOT NULL,
	"viewport" jsonb NOT NULL,
	"snapshot_url" text,
	"thumbnail_url" text,
	"snapshot_status" "snapshot_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_session_id_idempotency_key_unique" UNIQUE("session_id","idempotency_key"),
	CONSTRAINT "entries_session_id_order_unique" UNIQUE("session_id","order")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"public_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"public_id" text NOT NULL,
	"title" text NOT NULL,
	"status" "session_status" DEFAULT 'open' NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "sessions_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "sessions_project_id_idempotency_key_unique" UNIQUE("project_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotations_entry_id_number_idx" ON "annotations" USING btree ("entry_id","number");--> statement-breakpoint
CREATE INDEX "entries_session_id_order_idx" ON "entries" USING btree ("session_id","order");--> statement-breakpoint
CREATE INDEX "sessions_public_id_idx" ON "sessions" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "sessions_project_id_created_at_idx" ON "sessions" USING btree ("project_id","created_at");