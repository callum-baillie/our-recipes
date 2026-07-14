ALTER TABLE `profiles` ADD `archived_at` integer;
--> statement-breakpoint
CREATE TABLE `tags` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL UNIQUE,
  `color` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `tags` (`id`, `name`, `color`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), `tag`, NULL, strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000
FROM `recipe_tags`
GROUP BY `tag`;
--> statement-breakpoint
CREATE INDEX `profiles_archived_at_idx` ON `profiles` (`archived_at`);
--> statement-breakpoint
CREATE INDEX `recipe_tags_tag_idx` ON `recipe_tags` (`tag`);
