CREATE TABLE `ai_prompt_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `workload` text NOT NULL,
  `version` integer NOT NULL,
  `template` text NOT NULL,
  `change_note` text NOT NULL,
  `updated_by_user_id` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_prompt_workload_version` ON `ai_prompt_versions` (`workload`, `version`);
--> statement-breakpoint
ALTER TABLE `ai_operation_audits` ADD COLUMN `prompt_version` text;
