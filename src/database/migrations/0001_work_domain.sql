CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_number" text NOT NULL,
	"requester_id" uuid,
	"requester_division_id" uuid,
	"target_division_id" uuid NOT NULL,
	"type" "request_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"program_id" uuid,
	"subunit_id" uuid,
	"assigned_pic_id" uuid,
	"period_id" uuid,
	"priority" "priority_level" DEFAULT 'medium' NOT NULL,
	"due_date" date,
	"status" "request_status" DEFAULT 'draft' NOT NULL,
	"extra_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"clarification_note" text,
	"result_summary" text,
	"hold_reason" text,
	"linked_work_item_id" uuid,
	"sync_conflict_at" timestamp with time zone,
	"sync_conflict_note" text,
	"created_by" uuid,
	"updated_by" uuid,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_clarification_note_required" CHECK (status <> 'need_clarification' or (clarification_note is not null and clarification_note <> '')),
	CONSTRAINT "requests_result_summary_required" CHECK (status <> 'done' or (result_summary is not null and result_summary <> '')),
	CONSTRAINT "requests_hold_reason_required" CHECK (status <> 'on_hold' or (hold_reason is not null and hold_reason <> ''))
);
--> statement-breakpoint
CREATE TABLE "work_item_assignees" (
	"work_item_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_assignees_work_item_id_profile_id_pk" PRIMARY KEY("work_item_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "work_item_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_id" uuid NOT NULL,
	"label" text NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_item_dependencies" (
	"work_item_id" uuid NOT NULL,
	"depends_on_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_dependencies_work_item_id_depends_on_id_pk" PRIMARY KEY("work_item_id","depends_on_id"),
	CONSTRAINT "work_item_dependencies_no_self" CHECK (work_item_id <> depends_on_id)
);
--> statement-breakpoint
CREATE TABLE "work_item_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_id" uuid NOT NULL,
	"from_status" "work_status",
	"to_status" "work_status" NOT NULL,
	"note" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_number" text NOT NULL,
	"title" text NOT NULL,
	"type" "work_item_type" DEFAULT 'task' NOT NULL,
	"description" text,
	"primary_pic_id" uuid,
	"division_id" uuid,
	"cluster_id" uuid,
	"subunit_id" uuid,
	"program_id" uuid,
	"period_id" uuid,
	"priority" "priority_level" DEFAULT 'medium' NOT NULL,
	"status" "work_status" DEFAULT 'draft' NOT NULL,
	"module_status" text,
	"start_date" date,
	"due_date" date,
	"progress_percentage" integer DEFAULT 0 NOT NULL,
	"blocker_reason" text,
	"assistance_needed" text,
	"completion_summary" text,
	"hold_reason" text,
	"source_request_id" uuid,
	"source_meeting_decision_id" uuid,
	"sync_conflict_at" timestamp with time zone,
	"sync_conflict_note" text,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurrence_rule" text,
	"created_by" uuid,
	"updated_by" uuid,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_items_progress_range" CHECK (progress_percentage between 0 and 100),
	CONSTRAINT "work_items_hold_reason_required" CHECK (status <> 'on_hold' or (hold_reason is not null and hold_reason <> '')),
	CONSTRAINT "work_items_completion_summary_required" CHECK (status <> 'done' or (completion_summary is not null and completion_summary <> ''))
);
--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_id_profiles_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_division_id_divisions_id_fk" FOREIGN KEY ("requester_division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_target_division_id_divisions_id_fk" FOREIGN KEY ("target_division_id") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_subunit_id_subunits_id_fk" FOREIGN KEY ("subunit_id") REFERENCES "public"."subunits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_assigned_pic_id_profiles_id_fk" FOREIGN KEY ("assigned_pic_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_linked_work_item_id_work_items_id_fk" FOREIGN KEY ("linked_work_item_id") REFERENCES "public"."work_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_assignees" ADD CONSTRAINT "work_item_assignees_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_assignees" ADD CONSTRAINT "work_item_assignees_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_checklists" ADD CONSTRAINT "work_item_checklists_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_dependencies" ADD CONSTRAINT "work_item_dependencies_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_dependencies" ADD CONSTRAINT "work_item_dependencies_depends_on_id_work_items_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_status_history" ADD CONSTRAINT "work_item_status_history_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_status_history" ADD CONSTRAINT "work_item_status_history_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_primary_pic_id_profiles_id_fk" FOREIGN KEY ("primary_pic_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_subunit_id_subunits_id_fk" FOREIGN KEY ("subunit_id") REFERENCES "public"."subunits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_source_request_id_requests_id_fk" FOREIGN KEY ("source_request_id") REFERENCES "public"."requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "requests_number_key" ON "requests" USING btree ("request_number");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requests_target_division_idx" ON "requests" USING btree ("target_division_id");--> statement-breakpoint
CREATE INDEX "requests_requester_idx" ON "requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "requests_pic_idx" ON "requests" USING btree ("assigned_pic_id");--> statement-breakpoint
CREATE INDEX "requests_period_idx" ON "requests" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "work_item_checklists_item_idx" ON "work_item_checklists" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "work_item_status_history_item_idx" ON "work_item_status_history" USING btree ("work_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_items_number_key" ON "work_items" USING btree ("work_number");--> statement-breakpoint
CREATE INDEX "work_items_status_idx" ON "work_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "work_items_division_idx" ON "work_items" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "work_items_pic_idx" ON "work_items" USING btree ("primary_pic_id");--> statement-breakpoint
CREATE INDEX "work_items_period_idx" ON "work_items" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "work_items_source_request_idx" ON "work_items" USING btree ("source_request_id");