CREATE TABLE `nutrition_prepared_recipe_instances` (`id` text PRIMARY KEY NOT NULL,`recipe_id` text NOT NULL,`recipe_calculation_id` text NOT NULL,`recipe_name_snapshot` text NOT NULL,`meal_plan_entry_id` text,`cook_session_id` text,`actual_servings` real NOT NULL CHECK (`actual_servings` > 0),`final_weight_grams` real CHECK (`final_weight_grams` IS NULL OR `final_weight_grams` > 0),`calculation_alignment` text NOT NULL CHECK (`calculation_alignment` IN ('as_calculated','requires_recalculation')),`included_optional_ingredient_ids_snapshot` text NOT NULL,`adjustments_snapshot` text NOT NULL,`note` text DEFAULT '' NOT NULL,`request_digest` text NOT NULL,`created_by_principal_id` text NOT NULL,`created_at` integer NOT NULL,FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE restrict,FOREIGN KEY (`recipe_calculation_id`) REFERENCES `recipe_nutrition_calculations`(`id`) ON DELETE restrict,FOREIGN KEY (`meal_plan_entry_id`) REFERENCES `meal_plan_entries`(`id`) ON DELETE restrict,FOREIGN KEY (`cook_session_id`) REFERENCES `cook_sessions`(`id`) ON DELETE restrict,FOREIGN KEY (`created_by_principal_id`) REFERENCES `nutrition_principals`(`id`) ON DELETE restrict);
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_prepared_cook_session_idx` ON `nutrition_prepared_recipe_instances` (`cook_session_id`);
--> statement-breakpoint
CREATE INDEX `nutrition_prepared_recipe_created_idx` ON `nutrition_prepared_recipe_instances` (`recipe_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `nutrition_prepared_principal_created_idx` ON `nutrition_prepared_recipe_instances` (`created_by_principal_id`,`created_at`);
--> statement-breakpoint
ALTER TABLE `nutrition_intake_revisions` ADD `meal_plan_entry_id` text REFERENCES `meal_plan_entries`(`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `nutrition_intake_revisions` ADD `cook_session_id` text REFERENCES `cook_sessions`(`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `nutrition_intake_revisions` ADD `prepared_recipe_instance_id` text REFERENCES `nutrition_prepared_recipe_instances`(`id`) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX `nutrition_intake_prepared_idx` ON `nutrition_intake_revisions` (`prepared_recipe_instance_id`);
--> statement-breakpoint
ALTER TABLE `nutrition_meal_allocation_versions` ADD `prepared_recipe_instance_id` text REFERENCES `nutrition_prepared_recipe_instances`(`id`) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX `nutrition_allocation_prepared_idx` ON `nutrition_meal_allocation_versions` (`prepared_recipe_instance_id`);
--> statement-breakpoint
CREATE TABLE `nutrition_consumption_commands` (`id` text PRIMARY KEY NOT NULL,`principal_id` text NOT NULL,`idempotency_key` text NOT NULL,`request_digest` text NOT NULL,`nutrition_profile_id` text NOT NULL,`prepared_recipe_instance_id` text NOT NULL,`intake_revision_id` text NOT NULL,`allocation_version_id` text NOT NULL,`created_at` integer NOT NULL,FOREIGN KEY (`principal_id`) REFERENCES `nutrition_principals`(`id`) ON DELETE restrict,FOREIGN KEY (`nutrition_profile_id`) REFERENCES `nutrition_profiles`(`id`) ON DELETE restrict,FOREIGN KEY (`prepared_recipe_instance_id`) REFERENCES `nutrition_prepared_recipe_instances`(`id`) ON DELETE restrict,FOREIGN KEY (`intake_revision_id`) REFERENCES `nutrition_intake_revisions`(`id`) ON DELETE restrict,FOREIGN KEY (`allocation_version_id`) REFERENCES `nutrition_meal_allocation_versions`(`id`) ON DELETE restrict);
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_consumption_principal_key_idx` ON `nutrition_consumption_commands` (`principal_id`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `nutrition_consumption_profile_created_idx` ON `nutrition_consumption_commands` (`nutrition_profile_id`,`created_at`);
