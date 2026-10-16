CREATE TABLE `shopping_list_notes` (
  `list_id` text PRIMARY KEY NOT NULL REFERENCES `shopping_lists`(`id`) ON DELETE CASCADE,
  `note` text DEFAULT '' NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `updated_at` integer NOT NULL
);
