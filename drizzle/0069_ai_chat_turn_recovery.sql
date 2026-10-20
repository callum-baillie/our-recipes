CREATE TABLE `ai_chat_turns` (
  `id` text PRIMARY KEY NOT NULL,
  `thread_id` text NOT NULL REFERENCES `ai_chat_threads`(`id`) ON DELETE cascade,
  `profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON DELETE cascade,
  `owner_user_id` text NOT NULL,
  `intent_hash` text NOT NULL,
  `status` text NOT NULL,
  `result_json` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_chat_turns_thread_idx` ON `ai_chat_turns` (`thread_id`, `created_at`);
