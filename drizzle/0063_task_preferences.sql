CREATE TABLE `task_preferences` (
  `profile_id` text PRIMARY KEY NOT NULL REFERENCES `profiles`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `settings` text NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `last_scheduled_date` text,
  `updated_at` integer NOT NULL
);
