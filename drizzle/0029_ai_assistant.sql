ALTER TABLE `ai_operation_audits` ADD `reasoning_effort` text;
--> statement-breakpoint
ALTER TABLE `ai_operation_audits` ADD `input_tokens` integer;
--> statement-breakpoint
ALTER TABLE `ai_operation_audits` ADD `output_tokens` integer;
--> statement-breakpoint
ALTER TABLE `ai_operation_audits` ADD `thread_id` text;
--> statement-breakpoint
ALTER TABLE `ai_operation_audits` ADD `action_id` text;
--> statement-breakpoint
ALTER TABLE `ai_operation_audits` ADD `summary_id` text;
--> statement-breakpoint
ALTER TABLE `ai_operation_audits` ADD `error_code` text;
--> statement-breakpoint
CREATE TABLE `ai_workload_settings` (
  `workload` text PRIMARY KEY NOT NULL,
  `model` text NOT NULL,
  `reasoning_effort` text,
  `version` integer DEFAULT 1 NOT NULL,
  `updated_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON DELETE restrict,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_profile_settings` (
  `profile_id` text PRIMARY KEY NOT NULL REFERENCES `profiles`(`id`) ON DELETE cascade,
  `share_shared_recipes` integer DEFAULT true NOT NULL,
  `share_meal_plans` integer DEFAULT true NOT NULL,
  `share_dietary_preferences` integer DEFAULT true NOT NULL,
  `share_recipe_preferences` integer DEFAULT true NOT NULL,
  `share_nutrition_goals` integer DEFAULT true NOT NULL,
  `share_nutrition_aggregates` integer DEFAULT true NOT NULL,
  `share_raw_diary` integer DEFAULT false NOT NULL,
  `share_identity` integer DEFAULT false NOT NULL,
  `share_personal_metrics` integer DEFAULT false NOT NULL,
  `share_weight` integer DEFAULT false NOT NULL,
  `daily_summary_enabled` integer DEFAULT true NOT NULL,
  `weekly_summary_enabled` integer DEFAULT true NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_chat_threads` (
  `id` text PRIMARY KEY NOT NULL,
  `profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON DELETE cascade,
  `title` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_chat_threads_profile_updated_idx` ON `ai_chat_threads` (`profile_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `ai_chat_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `thread_id` text NOT NULL REFERENCES `ai_chat_threads`(`id`) ON DELETE cascade,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `model` text,
  `action_id` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_chat_messages_thread_created_idx` ON `ai_chat_messages` (`thread_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `ai_action_proposals` (
  `id` text PRIMARY KEY NOT NULL,
  `thread_id` text REFERENCES `ai_chat_threads`(`id`) ON DELETE set null,
  `profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON DELETE restrict,
  `kind` text NOT NULL,
  `status` text NOT NULL,
  `payload` text NOT NULL,
  `preview` text NOT NULL,
  `source_digest` text NOT NULL,
  `result` text,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `decided_at` integer
);
--> statement-breakpoint
CREATE INDEX `ai_action_proposals_profile_status_idx` ON `ai_action_proposals` (`profile_id`,`status`);
--> statement-breakpoint
CREATE TABLE `ai_periodic_summaries` (
  `id` text PRIMARY KEY NOT NULL,
  `profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON DELETE cascade,
  `kind` text NOT NULL,
  `period_start` text NOT NULL,
  `period_end` text NOT NULL,
  `headline` text NOT NULL,
  `body` text NOT NULL,
  `highlights` text NOT NULL,
  `caveats` text NOT NULL,
  `evidence` text NOT NULL,
  `source_digest` text NOT NULL,
  `model` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_periodic_summaries_period_idx` ON `ai_periodic_summaries` (`profile_id`,`kind`,`period_start`,`period_end`);
--> statement-breakpoint
CREATE TABLE `ai_summary_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON DELETE cascade,
  `kind` text NOT NULL,
  `due_at` integer NOT NULL,
  `status` text NOT NULL,
  `lease_until` integer,
  `attempts` integer DEFAULT 0 NOT NULL,
  `error_code` text,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_summary_jobs_profile_kind_idx` ON `ai_summary_jobs` (`profile_id`,`kind`);
