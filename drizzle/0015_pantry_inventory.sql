CREATE TABLE `pantry_products` (
  `id` text PRIMARY KEY NOT NULL,
  `normalized_name` text NOT NULL,
  `display_name` text NOT NULL,
  `brand` text DEFAULT '' NOT NULL,
  `variant` text DEFAULT '' NOT NULL,
  `category` text DEFAULT '' NOT NULL,
  `subcategory` text DEFAULT '' NOT NULL,
  `default_inventory_unit` text DEFAULT 'each' NOT NULL,
  `default_package_amount` real,
  `default_package_unit` text DEFAULT '' NOT NULL,
  `default_storage_type` text DEFAULT 'pantry' NOT NULL,
  `image_storage_key` text,
  `dietary_tags` text DEFAULT '[]' NOT NULL,
  `allergens` text DEFAULT '[]' NOT NULL,
  `storage_instructions` text DEFAULT '' NOT NULL,
  `default_shelf_life_days` integer,
  `shelf_life_after_opening_days` integer,
  `is_staple` integer DEFAULT false NOT NULL,
  `preferred_brand` text DEFAULT '' NOT NULL,
  `preferred_store` text DEFAULT '' NOT NULL,
  `minimum_stock` real,
  `target_stock` real,
  `reorder_threshold` real,
  `preferred_purchase_quantity` real,
  `stock_unit` text DEFAULT '' NOT NULL,
  `suggest_grocery_restock` integer DEFAULT false NOT NULL,
  `archived_at` integer,
  `created_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `updated_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_products_identity_idx` ON `pantry_products` (`normalized_name`,`brand`,`variant`);
--> statement-breakpoint
CREATE INDEX `pantry_products_category_idx` ON `pantry_products` (`category`,`archived_at`);
--> statement-breakpoint
CREATE INDEX `pantry_products_staple_idx` ON `pantry_products` (`is_staple`,`archived_at`);
--> statement-breakpoint
CREATE TABLE `pantry_product_aliases` (
  `id` text PRIMARY KEY NOT NULL,
  `product_id` text NOT NULL REFERENCES `pantry_products`(`id`) ON UPDATE no action ON DELETE cascade,
  `alias` text NOT NULL,
  `normalized_alias` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_product_alias_identity_idx` ON `pantry_product_aliases` (`product_id`,`normalized_alias`);
--> statement-breakpoint
CREATE INDEX `pantry_product_alias_search_idx` ON `pantry_product_aliases` (`normalized_alias`);
--> statement-breakpoint
CREATE TABLE `pantry_product_identifiers` (
  `id` text PRIMARY KEY NOT NULL,
  `product_id` text NOT NULL REFERENCES `pantry_products`(`id`) ON UPDATE no action ON DELETE cascade,
  `identifier_type` text NOT NULL,
  `value` text NOT NULL,
  `source` text DEFAULT 'household' NOT NULL,
  `verified` integer DEFAULT false NOT NULL,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_product_identifier_identity_idx` ON `pantry_product_identifiers` (`identifier_type`,`value`,`source`);
--> statement-breakpoint
CREATE INDEX `pantry_product_identifier_product_idx` ON `pantry_product_identifiers` (`product_id`);
--> statement-breakpoint
CREATE TABLE `pantry_locations` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `normalized_name` text NOT NULL,
  `parent_id` text REFERENCES `pantry_locations`(`id`) ON UPDATE no action ON DELETE restrict,
  `storage_type` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer,
  `created_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `updated_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pantry_locations_parent_position_idx` ON `pantry_locations` (`parent_id`,`position`);
--> statement-breakpoint
CREATE INDEX `pantry_locations_type_idx` ON `pantry_locations` (`storage_type`,`archived_at`);
--> statement-breakpoint
CREATE TABLE `pantry_batches` (
  `id` text PRIMARY KEY NOT NULL,
  `product_id` text NOT NULL REFERENCES `pantry_products`(`id`) ON UPDATE no action ON DELETE no action,
  `quantity_remaining` real,
  `original_quantity` real,
  `unit` text NOT NULL,
  `package_count` real,
  `amount_per_package` real,
  `package_unit` text DEFAULT '' NOT NULL,
  `approximate_state` text,
  `location_id` text NOT NULL REFERENCES `pantry_locations`(`id`) ON UPDATE no action ON DELETE no action,
  `sublocation` text DEFAULT '' NOT NULL,
  `purchase_date` text,
  `best_before_date` text,
  `use_by_date` text,
  `sell_by_date` text,
  `opened_date` text,
  `frozen_date` text,
  `thawed_date` text,
  `prepared_date` text,
  `expiry_precision` text DEFAULT 'unknown' NOT NULL,
  `status` text DEFAULT 'unopened' NOT NULL,
  `purchase_price_cents` integer,
  `source` text DEFAULT '' NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `exclude_from_grocery` integer DEFAULT false NOT NULL,
  `source_recipe_id` text REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
  `source_meal_plan_entry_id` text REFERENCES `meal_plan_entries`(`id`) ON UPDATE no action ON DELETE set null,
  `source_shopping_list_item_id` text REFERENCES `shopping_list_items`(`id`) ON UPDATE no action ON DELETE set null,
  `version` integer DEFAULT 1 NOT NULL,
  `created_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `updated_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT `pantry_batches_quantity_check` CHECK (`quantity_remaining` IS NULL OR `quantity_remaining` >= 0),
  CONSTRAINT `pantry_batches_original_quantity_check` CHECK (`original_quantity` IS NULL OR `original_quantity` > 0),
  CONSTRAINT `pantry_batches_measurement_check` CHECK (`quantity_remaining` IS NOT NULL OR `approximate_state` IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `pantry_batches_product_status_idx` ON `pantry_batches` (`product_id`,`status`);
--> statement-breakpoint
CREATE INDEX `pantry_batches_location_status_idx` ON `pantry_batches` (`location_id`,`status`);
--> statement-breakpoint
CREATE INDEX `pantry_batches_expiry_idx` ON `pantry_batches` (`use_by_date`,`best_before_date`);
--> statement-breakpoint
CREATE INDEX `pantry_batches_updated_idx` ON `pantry_batches` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `pantry_inventory_events` (
  `id` text PRIMARY KEY NOT NULL,
  `batch_id` text NOT NULL REFERENCES `pantry_batches`(`id`) ON UPDATE no action ON DELETE no action,
  `product_id` text NOT NULL REFERENCES `pantry_products`(`id`) ON UPDATE no action ON DELETE no action,
  `event_type` text NOT NULL,
  `previous_quantity` real,
  `new_quantity` real,
  `quantity_changed` real,
  `unit` text DEFAULT '' NOT NULL,
  `previous_state` text NOT NULL,
  `new_state` text NOT NULL,
  `reason` text DEFAULT '' NOT NULL,
  `related_recipe_id` text REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
  `related_meal_plan_entry_id` text REFERENCES `meal_plan_entries`(`id`) ON UPDATE no action ON DELETE set null,
  `related_shopping_list_item_id` text REFERENCES `shopping_list_items`(`id`) ON UPDATE no action ON DELETE set null,
  `note` text DEFAULT '' NOT NULL,
  `actor_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `undo_of_event_id` text REFERENCES `pantry_inventory_events`(`id`) ON UPDATE no action ON DELETE restrict,
  `reversed_by_event_id` text REFERENCES `pantry_inventory_events`(`id`) ON UPDATE no action ON DELETE restrict,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pantry_events_batch_created_idx` ON `pantry_inventory_events` (`batch_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `pantry_events_product_created_idx` ON `pantry_inventory_events` (`product_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `recipe_ingredient_product_mappings` (
  `recipe_ingredient_id` text PRIMARY KEY NOT NULL REFERENCES `recipe_ingredients`(`id`) ON UPDATE no action ON DELETE cascade,
  `product_id` text NOT NULL REFERENCES `pantry_products`(`id`) ON UPDATE no action ON DELETE no action,
  `match_type` text NOT NULL,
  `compatible_variant` integer DEFAULT false NOT NULL,
  `is_optional` integer DEFAULT false NOT NULL,
  `mapped_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recipe_ingredient_product_idx` ON `recipe_ingredient_product_mappings` (`product_id`);
