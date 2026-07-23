ALTER TABLE `cook_sessions` ADD `meal_plan_entry_id` text REFERENCES `meal_plan_entries`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `pantry_inventory_events` ADD `related_cook_session_id` text REFERENCES `cook_sessions`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE `pantry_shopping_item_details` (
  `shopping_list_item_id` text PRIMARY KEY NOT NULL REFERENCES `shopping_list_items`(`id`) ON DELETE CASCADE,
  `product_id` text REFERENCES `pantry_products`(`id`) ON DELETE RESTRICT,
  `demand_state` text NOT NULL CHECK (`demand_state` IN ('shortage', 'uncertain', 'manual')),
  `generated_quantity` real,
  `generated_unit` text DEFAULT '' NOT NULL,
  `shortage_quantity` real,
  `uncertainty_reason` text,
  `formula_inputs` text NOT NULL,
  `provenance` text NOT NULL,
  `generation_key` text NOT NULL,
  `manual_quantity_override` integer DEFAULT false NOT NULL,
  `manual_unit_override` integer DEFAULT false NOT NULL,
  `manual_item_override` integer DEFAULT false NOT NULL,
  `manual_note_override` integer DEFAULT false NOT NULL,
  `generated_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pantry_shopping_details_product_idx` ON `pantry_shopping_item_details` (`product_id`);
--> statement-breakpoint
CREATE INDEX `pantry_shopping_details_generation_idx` ON `pantry_shopping_item_details` (`generation_key`);
--> statement-breakpoint
CREATE TABLE `pantry_purchase_intakes` (
  `id` text PRIMARY KEY NOT NULL,
  `shopping_list_item_id` text NOT NULL REFERENCES `shopping_list_items`(`id`) ON DELETE RESTRICT,
  `idempotency_key` text NOT NULL,
  `batch_id` text NOT NULL REFERENCES `pantry_batches`(`id`) ON DELETE RESTRICT,
  `location_id` text NOT NULL REFERENCES `pantry_locations`(`id`) ON DELETE RESTRICT,
  `actor_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_purchase_intake_idempotency_idx` ON `pantry_purchase_intakes` (`shopping_list_item_id`, `idempotency_key`);
--> statement-breakpoint
CREATE TABLE `pantry_cook_session_plans` (
  `cook_session_id` text PRIMARY KEY NOT NULL REFERENCES `cook_sessions`(`id`) ON DELETE CASCADE,
  `state` text NOT NULL CHECK (`state` IN ('preview', 'confirmed', 'undone')),
  `formula_inputs` text NOT NULL,
  `provenance` text NOT NULL,
  `actor_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `confirmed_at` integer,
  `undone_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pantry_cook_session_deductions` (
  `id` text PRIMARY KEY NOT NULL,
  `cook_session_id` text NOT NULL REFERENCES `cook_sessions`(`id`) ON DELETE RESTRICT,
  `batch_id` text NOT NULL REFERENCES `pantry_batches`(`id`) ON DELETE RESTRICT,
  `inventory_event_id` text NOT NULL REFERENCES `pantry_inventory_events`(`id`) ON DELETE RESTRICT,
  `product_id` text NOT NULL REFERENCES `pantry_products`(`id`) ON DELETE RESTRICT,
  `quantity` real NOT NULL,
  `unit` text NOT NULL,
  `batch_version_after` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pantry_cook_deductions_session_idx` ON `pantry_cook_session_deductions` (`cook_session_id`);
--> statement-breakpoint
CREATE TABLE `pantry_cook_session_leftovers` (
  `id` text PRIMARY KEY NOT NULL,
  `cook_session_id` text NOT NULL REFERENCES `cook_sessions`(`id`) ON DELETE RESTRICT,
  `batch_id` text NOT NULL REFERENCES `pantry_batches`(`id`) ON DELETE RESTRICT,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_cook_leftover_batch_idx` ON `pantry_cook_session_leftovers` (`batch_id`);
