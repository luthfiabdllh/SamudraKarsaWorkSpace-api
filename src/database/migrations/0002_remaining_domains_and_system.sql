CREATE TYPE "public"."document_type" AS ENUM('work_item', 'request', 'budget', 'letter', 'inventory_item', 'program');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('info', 'mention', 'assignment', 'unassignment', 'meeting_invite', 'reschedule', 'cancellation');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"division_id" uuid,
	"period_id" uuid,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text,
	"file_size" bigint,
	"uploaded_by" uuid,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_event_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"profile_id" uuid,
	"external_name" text,
	"external_email" text,
	"is_optional" boolean DEFAULT false NOT NULL,
	"rsvp_status" "rsvp_status" DEFAULT 'no_response' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_attendees_identity_required" CHECK (profile_id is not null or external_name is not null)
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"event_type" "calendar_event_type" DEFAULT 'other' NOT NULL,
	"organizer_id" uuid,
	"division_id" uuid,
	"cluster_id" uuid,
	"subunit_id" uuid,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"location" text,
	"meeting_link" text,
	"agenda" text,
	"visibility" text DEFAULT 'all' NOT NULL,
	"recurrence_rule" text,
	"recurrence_end_date" date,
	"recurrence_parent_id" uuid,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"linked_work_item_id" uuid,
	"linked_meeting_id" uuid,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"mentioned_profile_ids" uuid[] DEFAULT '{}' NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"decision_text" text NOT NULL,
	"pic_id" uuid,
	"due_date" date,
	"priority" "priority_level" DEFAULT 'medium' NOT NULL,
	"status" "work_status" DEFAULT 'draft' NOT NULL,
	"work_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_participants" (
	"meeting_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	CONSTRAINT "meeting_participants_meeting_id_profile_id_pk" PRIMARY KEY("meeting_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"meeting_type" "meeting_type" DEFAULT 'division_meeting' NOT NULL,
	"held_at" timestamp with time zone NOT NULL,
	"location_or_media" text,
	"leader_id" uuid,
	"division_id" uuid,
	"agenda" text,
	"summary" text,
	"period_id" uuid,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"entity_type" text,
	"entity_id" uuid,
	"kind" "notification_kind" DEFAULT 'info' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"platform" text,
	"planned_date" date,
	"pic_id" uuid,
	"brief" text,
	"status" "content_status" DEFAULT 'idea' NOT NULL,
	"published_url" text,
	"program_id" uuid,
	"period_id" uuid,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid,
	"title" text NOT NULL,
	"creative_kind" text NOT NULL,
	"requester_id" uuid,
	"pic_id" uuid,
	"brief" text,
	"spec_note" text,
	"reference_url" text,
	"due_date" date,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"final_file_url" text,
	"status" "creative_status" DEFAULT 'request_received' NOT NULL,
	"period_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"document_type" "document_type" NOT NULL,
	"variant" text DEFAULT '' NOT NULL,
	"year" integer NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_counters_document_type_variant_year_pk" PRIMARY KEY("document_type","variant","year"),
	CONSTRAINT "document_counters_year_sane" CHECK (year between 2000 and 2999),
	CONSTRAINT "document_counters_last_number_not_negative" CHECK (last_number >= 0)
);
--> statement-breakpoint
CREATE TABLE "budget_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"label" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit" text,
	"unit_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"planned_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"realized_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_number" text NOT NULL,
	"title" text NOT NULL,
	"division_id" uuid,
	"program_id" uuid,
	"subunit_id" uuid,
	"requested_by" uuid,
	"total_planned" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_realized" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "budget_status" DEFAULT 'draft' NOT NULL,
	"review_note" text,
	"period_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_dues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"target_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "dues_status" DEFAULT 'unpaid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_dues_amounts_not_negative" CHECK (paid_amount >= 0)
);
--> statement-breakpoint
CREATE TABLE "member_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_dues_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"paid_at" date DEFAULT now() NOT NULL,
	"proof_url" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_payments_amount_positive" CHECK (amount > 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_type" "transaction_type" NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"transaction_date" date DEFAULT now() NOT NULL,
	"pic_id" uuid,
	"program_id" uuid,
	"budget_id" uuid,
	"counterparty" text,
	"payment_method" text,
	"proof_url" text,
	"status" text DEFAULT 'recorded' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by" uuid,
	"period_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_positive" CHECK (amount > 0)
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text DEFAULT 'criticism_suggestion' NOT NULL,
	"visibility" "evaluation_visibility" DEFAULT 'named' NOT NULL,
	"author_id" uuid,
	"target_note" text,
	"message" text NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"period_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"activity_kind" text NOT NULL,
	"held_at" timestamp with time zone,
	"pic_id" uuid,
	"participant_count" integer,
	"summary" text,
	"follow_up_note" text,
	"period_id" uuid,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"letter_number" text NOT NULL,
	"direction" "letter_direction" DEFAULT 'outbound' NOT NULL,
	"letter_kind" text NOT NULL,
	"requester_id" uuid,
	"sender_recipient" text,
	"institution" text,
	"subject" text NOT NULL,
	"letter_date" date,
	"due_date" date,
	"pic_id" uuid,
	"signer_name" text,
	"status" "letter_status" DEFAULT 'submitted' NOT NULL,
	"note" text,
	"program_id" uuid,
	"request_id" uuid,
	"period_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"condition_note" text,
	"source_note" text,
	"location" text,
	"pic_id" uuid,
	"program_id" uuid,
	"period_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"movement_type" "inventory_movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"moved_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_name" text NOT NULL,
	"content_note" text,
	"weight_kg" numeric(8, 2),
	"dimension_note" text,
	"origin" text,
	"destination" text,
	"sender_name" text,
	"recipient_name" text,
	"expedition" text,
	"tracking_number" text,
	"scheduled_at" date,
	"cost" numeric(14, 2),
	"status" text DEFAULT 'processing' NOT NULL,
	"packaging_photo_url" text,
	"handover_proof_url" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_kind" text NOT NULL,
	"title" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"vehicle_note" text,
	"pic_id" uuid,
	"passenger_count" integer,
	"status" text DEFAULT 'planned' NOT NULL,
	"note" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"followup_note" text NOT NULL,
	"followed_up_by" uuid,
	"followed_up_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"industry" text,
	"contact_person" text,
	"contact_info" text,
	"pic_id" uuid,
	"relation_channel" text,
	"last_contact_at" date,
	"next_follow_up_at" date,
	"target_support" numeric(14, 2),
	"agreed_value" numeric(14, 2),
	"fund_received" numeric(14, 2) DEFAULT '0' NOT NULL,
	"in_kind_support" text,
	"proposal_url" text,
	"cover_letter_url" text,
	"mou_url" text,
	"status" "partner_status" DEFAULT 'prospect' NOT NULL,
	"fulfillment_status" text,
	"program_id" uuid,
	"period_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_benefits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"benefit_description" text NOT NULL,
	"deadline" date,
	"status" text DEFAULT 'not_fulfilled' NOT NULL,
	"proof_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before_data" jsonb,
	"after_data" jsonb,
	"request_id" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" uuid,
	"export_kind" text NOT NULL,
	"format" text NOT NULL,
	"filter_snapshot" jsonb,
	"file_path" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"profile_id" uuid,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_counters" (
	"bucket_key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_counters_count_not_negative" CHECK (count >= 0)
);
--> statement-breakpoint
CREATE TABLE "record_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "record_versions_number_positive" CHECK (version_number > 0)
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"replaced_by_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"allowed_roles" "role"[] NOT NULL,
	"required_fields" text[] DEFAULT '{}' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_id" uuid,
	"name" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"pic_id" uuid,
	"division_id" uuid,
	"period_id" uuid,
	"priority" "priority_level" DEFAULT 'medium' NOT NULL,
	"status" "work_status" DEFAULT 'draft' NOT NULL,
	"progress_percentage" integer DEFAULT 0 NOT NULL,
	"note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_progress_range" CHECK (progress_percentage between 0 and 100),
	CONSTRAINT "milestones_dates_ordered" CHECK (end_date is null or start_date is null or end_date >= start_date)
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organizer_id_profiles_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_subunit_id_subunits_id_fk" FOREIGN KEY ("subunit_id") REFERENCES "public"."subunits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_recurrence_parent_id_calendar_events_id_fk" FOREIGN KEY ("recurrence_parent_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_linked_work_item_id_work_items_id_fk" FOREIGN KEY ("linked_work_item_id") REFERENCES "public"."work_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_linked_meeting_id_meetings_id_fk" FOREIGN KEY ("linked_meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_decisions" ADD CONSTRAINT "meeting_decisions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_decisions" ADD CONSTRAINT "meeting_decisions_pic_id_profiles_id_fk" FOREIGN KEY ("pic_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_decisions" ADD CONSTRAINT "meeting_decisions_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_leader_id_profiles_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_profiles_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_pic_id_profiles_id_fk" FOREIGN KEY ("pic_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_requests" ADD CONSTRAINT "creative_requests_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_requests" ADD CONSTRAINT "creative_requests_requester_id_profiles_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_requests" ADD CONSTRAINT "creative_requests_pic_id_profiles_id_fk" FOREIGN KEY ("pic_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_requests" ADD CONSTRAINT "creative_requests_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_subunit_id_subunits_id_fk" FOREIGN KEY ("subunit_id") REFERENCES "public"."subunits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_dues" ADD CONSTRAINT "member_dues_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_dues" ADD CONSTRAINT "member_dues_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_payments" ADD CONSTRAINT "member_payments_member_dues_id_member_dues_id_fk" FOREIGN KEY ("member_dues_id") REFERENCES "public"."member_dues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_payments" ADD CONSTRAINT "member_payments_verified_by_profiles_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_pic_id_profiles_id_fk" FOREIGN KEY ("pic_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_verified_by_profiles_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_activities" ADD CONSTRAINT "internal_activities_pic_id_profiles_id_fk" FOREIGN KEY ("pic_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_activities" ADD CONSTRAINT "internal_activities_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_activities" ADD CONSTRAINT "internal_activities_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_requester_id_profiles_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_pic_id_profiles_id_fk" FOREIGN KEY ("pic_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_pic_id_profiles_id_fk" FOREIGN KEY ("pic_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_moved_by_profiles_id_fk" FOREIGN KEY ("moved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_pic_id_profiles_id_fk" FOREIGN KEY ("pic_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_followups" ADD CONSTRAINT "partner_followups_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_followups" ADD CONSTRAINT "partner_followups_followed_up_by_profiles_id_fk" FOREIGN KEY ("followed_up_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_pic_id_profiles_id_fk" FOREIGN KEY ("pic_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_benefits" ADD CONSTRAINT "sponsor_benefits_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_versions" ADD CONSTRAINT "record_versions_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_id_refresh_tokens_id_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "public"."refresh_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_pic_id_profiles_id_fk" FOREIGN KEY ("pic_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_created_at_idx" ON "announcements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "announcements_division_idx" ON "announcements" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "attachments_entity_idx" ON "attachments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_storage_path_key" ON "attachments" USING btree ("storage_path");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_event_attendees_unique_member" ON "calendar_event_attendees" USING btree ("event_id","profile_id") WHERE profile_id is not null;--> statement-breakpoint
CREATE INDEX "calendar_event_attendees_event_idx" ON "calendar_event_attendees" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "calendar_event_attendees_profile_idx" ON "calendar_event_attendees" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "calendar_events_start_idx" ON "calendar_events" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "calendar_events_division_idx" ON "calendar_events" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "calendar_events_parent_idx" ON "calendar_events" USING btree ("recurrence_parent_id");--> statement-breakpoint
CREATE INDEX "calendar_events_active_idx" ON "calendar_events" USING btree ("start_at") WHERE not is_cancelled;--> statement-breakpoint
CREATE INDEX "comments_entity_idx" ON "comments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "comments_mentions_idx" ON "comments" USING gin ("mentioned_profile_ids");--> statement-breakpoint
CREATE INDEX "meeting_decisions_meeting_idx" ON "meeting_decisions" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_decisions_status_idx" ON "meeting_decisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meeting_participants_profile_idx" ON "meeting_participants" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "meetings_held_at_idx" ON "meetings" USING btree ("held_at");--> statement-breakpoint
CREATE INDEX "meetings_division_idx" ON "meetings" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "meetings_period_idx" ON "meetings" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "content_items_status_idx" ON "content_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_items_period_idx" ON "content_items" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "content_items_pic_idx" ON "content_items" USING btree ("pic_id");--> statement-breakpoint
CREATE INDEX "creative_requests_status_idx" ON "creative_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "creative_requests_request_idx" ON "creative_requests" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "creative_requests_pic_idx" ON "creative_requests" USING btree ("pic_id");--> statement-breakpoint
CREATE INDEX "creative_requests_period_idx" ON "creative_requests" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "document_counters_year_idx" ON "document_counters" USING btree ("year");--> statement-breakpoint
CREATE INDEX "budget_items_budget_idx" ON "budget_items" USING btree ("budget_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_number_key" ON "budgets" USING btree ("budget_number");--> statement-breakpoint
CREATE INDEX "budgets_status_idx" ON "budgets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "budgets_division_idx" ON "budgets" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "budgets_program_idx" ON "budgets" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "budgets_period_idx" ON "budgets" USING btree ("period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_dues_member_period_key" ON "member_dues" USING btree ("profile_id","period_id");--> statement-breakpoint
CREATE INDEX "member_dues_status_idx" ON "member_dues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "member_dues_period_idx" ON "member_dues" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "member_payments_dues_idx" ON "member_payments" USING btree ("member_dues_id");--> statement-breakpoint
CREATE INDEX "member_payments_verified_idx" ON "member_payments" USING btree ("verified");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_type_idx" ON "transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "transactions_budget_idx" ON "transactions" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "transactions_period_idx" ON "transactions" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "transactions_verified_idx" ON "transactions" USING btree ("verified");--> statement-breakpoint
CREATE INDEX "feedback_private_idx" ON "feedback" USING btree ("is_private");--> statement-breakpoint
CREATE INDEX "feedback_period_idx" ON "feedback" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "internal_activities_held_at_idx" ON "internal_activities" USING btree ("held_at");--> statement-breakpoint
CREATE INDEX "internal_activities_period_idx" ON "internal_activities" USING btree ("period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "letters_number_key" ON "letters" USING btree ("letter_number");--> statement-breakpoint
CREATE INDEX "letters_status_idx" ON "letters" USING btree ("status");--> statement-breakpoint
CREATE INDEX "letters_period_idx" ON "letters" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "letters_program_idx" ON "letters" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "letters_pic_idx" ON "letters" USING btree ("pic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_code_key" ON "inventory_items" USING btree ("item_code");--> statement-breakpoint
CREATE INDEX "inventory_items_category_idx" ON "inventory_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "inventory_items_pic_idx" ON "inventory_items" USING btree ("pic_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_item_idx" ON "inventory_movements" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "shipments_status_idx" ON "shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "trips_status_idx" ON "trips" USING btree ("status");--> statement-breakpoint
CREATE INDEX "partner_followups_partner_idx" ON "partner_followups" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partners_status_idx" ON "partners" USING btree ("status");--> statement-breakpoint
CREATE INDEX "partners_pic_idx" ON "partners" USING btree ("pic_id");--> statement-breakpoint
CREATE INDEX "partners_period_idx" ON "partners" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "partners_next_follow_up_idx" ON "partners" USING btree ("next_follow_up_at");--> statement-breakpoint
CREATE INDEX "sponsor_benefits_partner_idx" ON "sponsor_benefits" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "sponsor_benefits_status_idx" ON "sponsor_benefits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "activity_logs_entity_idx" ON "activity_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activity_logs_created_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activity_logs_actor_idx" ON "activity_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_logs_action_idx" ON "activity_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "exports_requested_by_idx" ON "exports" USING btree ("requested_by","created_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_profile_idx" ON "idempotency_keys" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_counters_bucket_window_key" ON "rate_limit_counters" USING btree ("bucket_key","window_start");--> statement-breakpoint
CREATE INDEX "rate_limit_counters_window_idx" ON "rate_limit_counters" USING btree ("window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "record_versions_entity_version_key" ON "record_versions" USING btree ("entity_type","entity_id","version_number");--> statement-breakpoint
CREATE INDEX "record_versions_entity_idx" ON "record_versions" USING btree ("entity_type","entity_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_key" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_profile_idx" ON "refresh_tokens" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_expires_idx" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "status_transitions_edge_key" ON "status_transitions" USING btree ("entity_type","from_status","to_status");--> statement-breakpoint
CREATE INDEX "status_transitions_lookup_idx" ON "status_transitions" USING btree ("entity_type","from_status");--> statement-breakpoint
CREATE INDEX "milestones_work_item_idx" ON "milestones" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "milestones_period_idx" ON "milestones" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "milestones_status_idx" ON "milestones" USING btree ("status");--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_source_meeting_decision_id_meeting_decisions_id_fk" FOREIGN KEY ("source_meeting_decision_id") REFERENCES "public"."meeting_decisions"("id") ON DELETE set null ON UPDATE no action;