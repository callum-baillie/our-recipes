CREATE TABLE `nutrition_diary_commands` (`id` text PRIMARY KEY NOT NULL,`principal_id` text NOT NULL,`idempotency_key` text NOT NULL,`request_digest` text NOT NULL,`command_type` text NOT NULL CHECK (`command_type` IN ('copy_entry','copy_day','move','restore','reassign')),`source_profile_id` text NOT NULL,`target_profile_id` text,`result_snapshot` text NOT NULL,`created_at` integer NOT NULL,FOREIGN KEY (`principal_id`) REFERENCES `nutrition_principals`(`id`) ON DELETE restrict,FOREIGN KEY (`source_profile_id`) REFERENCES `nutrition_profiles`(`id`) ON DELETE restrict,FOREIGN KEY (`target_profile_id`) REFERENCES `nutrition_profiles`(`id`) ON DELETE restrict);
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_diary_command_principal_key_idx` ON `nutrition_diary_commands` (`principal_id`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `nutrition_diary_command_source_created_idx` ON `nutrition_diary_commands` (`source_profile_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `nutrition_diary_command_target_created_idx` ON `nutrition_diary_commands` (`target_profile_id`,`created_at`);
