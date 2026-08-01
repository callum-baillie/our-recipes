CREATE TABLE `ai_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON DELETE CASCADE,
  `thread_id` text REFERENCES `ai_chat_threads`(`id`) ON DELETE SET NULL,
  `action_id` text REFERENCES `ai_action_proposals`(`id`) ON DELETE SET NULL,
  `kind` text NOT NULL,
  `status` text NOT NULL,
  `execution_mode` text NOT NULL,
  `model` text NOT NULL,
  `payload` text NOT NULL,
  `result` text,
  `source_digest` text NOT NULL,
  `provider_batch_id` text,
  `provider_input_file_id` text,
  `attempts` integer DEFAULT 0 NOT NULL,
  `next_attempt_at` integer NOT NULL,
  `lease_token` text,
  `lease_expires_at` integer,
  `error_code` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `ai_jobs_profile_status_next_idx` ON `ai_jobs` (`profile_id`,`status`,`next_attempt_at`);
--> statement-breakpoint
CREATE INDEX `ai_jobs_thread_created_idx` ON `ai_jobs` (`thread_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `ai_job_items` (
  `id` text PRIMARY KEY NOT NULL,
  `job_id` text NOT NULL REFERENCES `ai_jobs`(`id`) ON DELETE CASCADE,
  `position` integer NOT NULL,
  `custom_id` text NOT NULL,
  `status` text NOT NULL,
  `payload` text NOT NULL,
  `result` text,
  `error_code` text,
  `recipe_id` text REFERENCES `recipes`(`id`) ON DELETE SET NULL,
  `audit_id` text REFERENCES `ai_operation_audits`(`id`) ON DELETE SET NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_job_items_custom_id_unique` ON `ai_job_items` (`custom_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_job_items_job_position_idx` ON `ai_job_items` (`job_id`,`position`);
--> statement-breakpoint
CREATE INDEX `ai_job_items_job_status_idx` ON `ai_job_items` (`job_id`,`status`);
