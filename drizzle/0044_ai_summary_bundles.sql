ALTER TABLE `ai_profile_settings` ADD `share_shopping_lists` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `ai_profile_settings` ADD `summary_frequency` text DEFAULT 'weekly' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ai_profile_settings` ADD `summary_nutrition_enabled` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `ai_profile_settings` ADD `summary_meal_plans_enabled` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `ai_profile_settings` ADD `summary_shopping_lists_enabled` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `ai_profile_settings` ADD `summary_recipes_enabled` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `ai_periodic_summaries` ADD `metrics` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
DELETE FROM `ai_summary_jobs`;
