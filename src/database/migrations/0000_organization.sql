CREATE TYPE "public"."budget_status" AS ENUM('draft', 'submitted', 'review', 'needs_revision', 'approved', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."calendar_event_type" AS ENUM('weekly_meeting', 'all_hands_meeting', 'daily_meeting', 'division_meeting', 'cluster_meeting', 'subunit_meeting', 'audience', 'field_activity', 'other');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('idea', 'brief', 'copywriting', 'visual_request', 'production', 'review', 'scheduled', 'published', 'evaluation');--> statement-breakpoint
CREATE TYPE "public"."creative_status" AS ENUM('request_received', 'brief', 'queued', 'production', 'draft', 'review', 'revision', 'final', 'done');--> statement-breakpoint
CREATE TYPE "public"."dues_status" AS ENUM('unpaid', 'installment', 'paid');--> statement-breakpoint
CREATE TYPE "public"."evaluation_visibility" AS ENUM('anonymous', 'named');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('inbound', 'outbound', 'used', 'borrowed', 'returned', 'relocated', 'damaged_or_lost');--> statement-breakpoint
CREATE TYPE "public"."kkn_phase" AS ENUM('pre_kkn', 'kkn', 'post_kkn');--> statement-breakpoint
CREATE TYPE "public"."letter_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."letter_status" AS ENUM('submitted', 'needs_completion', 'verified', 'drafting', 'review', 'awaiting_signature', 'ready_to_send', 'sent', 'done');--> statement-breakpoint
CREATE TYPE "public"."meeting_type" AS ENUM('general_meeting', 'division_meeting', 'coordination_meeting', 'evaluation', 'other');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('invited', 'active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."partner_status" AS ENUM('prospect', 'not_contacted', 'initial_contact', 'follow_up', 'negotiation', 'proposal_sent', 'awaiting_response', 'approved', 'contract_signed', 'counter_performance', 'done');--> statement-breakpoint
CREATE TYPE "public"."priority_level" AS ENUM('urgent', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."program_status" AS ENUM('idea', 'research', 'validation', 'planning', 'ready', 'in_progress', 'monitoring', 'evaluation', 'done');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('draft', 'submitted', 'accepted', 'in_progress', 'need_review', 'need_clarification', 'on_hold', 'done', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."request_type" AS ENUM('correspondence', 'budget_plan', 'design', 'video_editing', 'publication', 'documentation', 'goods_procurement', 'goods_loan', 'transportation', 'cargo', 'catering', 'sponsorship', 'program_need', 'general_assistance');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'co_owner', 'division_head', 'division_deputy', 'member');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('attending', 'maybe', 'not_attending', 'no_response');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."work_item_type" AS ENUM('task', 'request', 'meeting_follow_up', 'program_need', 'division_need', 'milestone', 'evaluation_follow_up', 'subunit_need');--> statement-breakpoint
CREATE TYPE "public"."work_status" AS ENUM('draft', 'submitted', 'approved', 'in_progress', 'need_review', 'on_hold', 'done', 'rejected');--> statement-breakpoint
CREATE TABLE "clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"starts_on" timestamp with time zone NOT NULL,
	"ends_on" timestamp with time zone NOT NULL,
	"phase" "kkn_phase" DEFAULT 'kkn' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"nickname" text,
	"photo_url" text,
	"phone" text,
	"faculty_major" text,
	"batch_year" text,
	"password_hash" text,
	"google_sub" text,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"roles" "role"[] DEFAULT '{"member"}' NOT NULL,
	"status" "member_status" DEFAULT 'invited' NOT NULL,
	"division_id" uuid,
	"cluster_id" uuid,
	"subunit_id" uuid,
	"team_role" text,
	"is_kormasit" boolean DEFAULT false NOT NULL,
	"social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"hobbies" text[] DEFAULT '{}' NOT NULL,
	"availability_note" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_members" (
	"program_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"role_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_members_program_id_profile_id_pk" PRIMARY KEY("program_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_number" text NOT NULL,
	"name" text NOT NULL,
	"period_id" uuid,
	"cluster_id" uuid,
	"subunit_id" uuid,
	"pic_id" uuid,
	"background" text,
	"problem_statement" text,
	"potential" text,
	"research_findings" text,
	"goals" text,
	"targets" text,
	"stakeholders" text,
	"action_plan" text,
	"schedule_note" text,
	"output_target" text,
	"item_needs" text,
	"budget_plan" numeric(14, 2) DEFAULT '0',
	"budget_realization" numeric(14, 2) DEFAULT '0',
	"status" "program_status" DEFAULT 'idea' NOT NULL,
	"progress_percentage" integer DEFAULT 0 NOT NULL,
	"realization_note" text,
	"evaluation_note" text,
	"impact_note" text,
	"follow_up_note" text,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subunits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"village_name" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_subunit_id_subunits_id_fk" FOREIGN KEY ("subunit_id") REFERENCES "public"."subunits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_members" ADD CONSTRAINT "program_members_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_members" ADD CONSTRAINT "program_members_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_subunit_id_subunits_id_fk" FOREIGN KEY ("subunit_id") REFERENCES "public"."subunits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_pic_id_profiles_id_fk" FOREIGN KEY ("pic_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clusters_code_key" ON "clusters" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "divisions_code_key" ON "divisions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "periods_code_key" ON "periods" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "periods_active_key" ON "periods" USING btree ("is_active") WHERE is_active;--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_google_sub_key" ON "profiles" USING btree ("google_sub") WHERE google_sub is not null;--> statement-breakpoint
CREATE INDEX "profiles_status_idx" ON "profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "profiles_division_idx" ON "profiles" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "profiles_roles_idx" ON "profiles" USING gin ("roles");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_number_key" ON "programs" USING btree ("program_number");--> statement-breakpoint
CREATE INDEX "programs_status_idx" ON "programs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "programs_period_idx" ON "programs" USING btree ("period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subunits_code_key" ON "subunits" USING btree ("code");