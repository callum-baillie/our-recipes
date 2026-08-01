ALTER TABLE `ai_summary_jobs` ADD `lease_token` text;
--> statement-breakpoint
UPDATE `ai_profile_settings`
SET
  `summary_frequency` = 'off',
  `daily_summary_enabled` = false,
  `weekly_summary_enabled` = false;
--> statement-breakpoint
DELETE FROM `ai_summary_jobs`;
