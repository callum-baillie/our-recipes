CREATE TABLE `supermarket_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `household_id` text NOT NULL REFERENCES `households`(`id`) ON DELETE cascade,
  `name` text NOT NULL,
  `normalized_name` text NOT NULL,
  `location_label` text DEFAULT '' NOT NULL,
  `normalized_location` text DEFAULT '' NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `archived_at` integer,
  `created_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `updated_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supermarket_profiles_household_identity_idx` ON `supermarket_profiles` (`household_id`,`normalized_name`,`normalized_location`);
--> statement-breakpoint
CREATE INDEX `supermarket_profiles_household_archived_idx` ON `supermarket_profiles` (`household_id`,`archived_at`);
--> statement-breakpoint
CREATE TABLE `household_list_settings` (
  `household_id` text PRIMARY KEY NOT NULL REFERENCES `households`(`id`) ON DELETE cascade,
  `default_supermarket_profile_id` text REFERENCES `supermarket_profiles`(`id`) ON DELETE set null,
  `completed_items_behavior` text DEFAULT 'completed_section' NOT NULL,
  `open_pantry_purchase_on_check` integer DEFAULT true NOT NULL,
  `keep_screen_awake` integer DEFAULT false NOT NULL,
  `updated_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `supermarket_profile_aisles` (
  `id` text PRIMARY KEY NOT NULL,
  `supermarket_profile_id` text NOT NULL REFERENCES `supermarket_profiles`(`id`) ON DELETE cascade,
  `aisle_id` text NOT NULL REFERENCES `shopping_aisles`(`id`) ON DELETE restrict,
  `display_name` text NOT NULL,
  `position` integer NOT NULL,
  `match_terms` text DEFAULT '[]' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supermarket_profile_aisles_identity_idx` ON `supermarket_profile_aisles` (`supermarket_profile_id`,`aisle_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `supermarket_profile_aisles_position_idx` ON `supermarket_profile_aisles` (`supermarket_profile_id`,`position`);
--> statement-breakpoint
CREATE TABLE `supermarket_item_aisle_mappings` (
  `id` text PRIMARY KEY NOT NULL,
  `supermarket_profile_id` text NOT NULL REFERENCES `supermarket_profiles`(`id`) ON DELETE cascade,
  `identity_type` text NOT NULL,
  `identity_value` text NOT NULL,
  `aisle_id` text REFERENCES `shopping_aisles`(`id`) ON DELETE set null,
  `updated_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supermarket_item_mapping_identity_idx` ON `supermarket_item_aisle_mappings` (`supermarket_profile_id`,`identity_type`,`identity_value`);
--> statement-breakpoint
CREATE INDEX `supermarket_item_mapping_aisle_idx` ON `supermarket_item_aisle_mappings` (`aisle_id`);
--> statement-breakpoint
ALTER TABLE `shopping_lists` ADD `supermarket_profile_id` text REFERENCES `supermarket_profiles`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `shopping_lists_supermarket_profile_idx` ON `shopping_lists` (`supermarket_profile_id`);
--> statement-breakpoint
CREATE TEMP TABLE `_supermarket_migration_profile` (`id` text PRIMARY KEY NOT NULL);
--> statement-breakpoint
INSERT INTO `_supermarket_migration_profile` (`id`)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))
WHERE EXISTS (SELECT 1 FROM `shopping_aisles`) AND EXISTS (SELECT 1 FROM `households`) AND EXISTS (SELECT 1 FROM `profiles`);
--> statement-breakpoint
INSERT INTO `supermarket_profiles` (`id`,`household_id`,`name`,`normalized_name`,`location_label`,`normalized_location`,`notes`,`archived_at`,`created_by_profile_id`,`updated_by_profile_id`,`created_at`,`updated_at`)
SELECT migration.`id`, household.`id`, 'Default supermarket', 'default supermarket', '', '', 'Created from the existing household aisle order.', NULL, actor.`id`, actor.`id`, unixepoch(), unixepoch()
FROM `_supermarket_migration_profile` migration
JOIN (SELECT `id` FROM `households` ORDER BY `created_at` LIMIT 1) household
JOIN (SELECT `id` FROM `profiles` ORDER BY `created_at` LIMIT 1) actor;
--> statement-breakpoint
INSERT INTO `supermarket_profile_aisles` (`id`,`supermarket_profile_id`,`aisle_id`,`display_name`,`position`,`match_terms`,`created_at`,`updated_at`)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), migration.`id`, aisle.`id`, aisle.`name`, aisle.`position`, '[]', unixepoch(), unixepoch()
FROM `shopping_aisles` aisle
CROSS JOIN `_supermarket_migration_profile` migration;
--> statement-breakpoint
INSERT INTO `household_list_settings` (`household_id`,`default_supermarket_profile_id`,`completed_items_behavior`,`open_pantry_purchase_on_check`,`keep_screen_awake`,`updated_by_profile_id`,`created_at`,`updated_at`)
SELECT household.`id`, migration.`id`, 'completed_section', true, false, actor.`id`, unixepoch(), unixepoch()
FROM (SELECT `id` FROM `households` ORDER BY `created_at` LIMIT 1) household
JOIN (SELECT `id` FROM `profiles` ORDER BY `created_at` LIMIT 1) actor
LEFT JOIN `_supermarket_migration_profile` migration ON true;
--> statement-breakpoint
UPDATE `shopping_lists` SET `supermarket_profile_id` = (SELECT `id` FROM `_supermarket_migration_profile` LIMIT 1) WHERE EXISTS (SELECT 1 FROM `_supermarket_migration_profile`);
--> statement-breakpoint
DROP TABLE `_supermarket_migration_profile`;
