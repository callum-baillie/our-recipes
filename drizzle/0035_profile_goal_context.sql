ALTER TABLE `profiles` ADD `goal_context` text DEFAULT '{"focusAreas":[],"motivation":"","challenges":"","successVision":""}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ai_profile_settings` ADD `share_profile_goals` integer DEFAULT false NOT NULL;
