ALTER TABLE `pantry_product_identifiers` ADD `normalized_value` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_product_identifier_verified_gtin_idx` ON `pantry_product_identifiers` (`normalized_value`);
--> statement-breakpoint
CREATE TABLE `food_provider_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `provider_record_id` text NOT NULL,
  `data_type` text DEFAULT '' NOT NULL,
  `canonical_gtin` text,
  `normalized_payload` text NOT NULL,
  `provider_metadata` text DEFAULT '{}' NOT NULL,
  `content_hash` text NOT NULL,
  `schema_version` text NOT NULL,
  `source_url` text DEFAULT '' NOT NULL,
  `citation` text DEFAULT '' NOT NULL,
  `license` text DEFAULT '' NOT NULL,
  `retrieved_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `food_provider_snapshot_identity_idx` ON `food_provider_snapshots` (`provider`,`provider_record_id`,`content_hash`);
--> statement-breakpoint
CREATE INDEX `food_provider_snapshot_gtin_idx` ON `food_provider_snapshots` (`canonical_gtin`);
--> statement-breakpoint
CREATE TABLE `pantry_product_provider_links` (
  `id` text PRIMARY KEY NOT NULL,
  `product_id` text NOT NULL REFERENCES `pantry_products`(`id`) ON DELETE CASCADE,
  `snapshot_id` text NOT NULL REFERENCES `food_provider_snapshots`(`id`) ON DELETE RESTRICT,
  `relation` text NOT NULL,
  `fields_used` text DEFAULT '[]' NOT NULL,
  `created_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_product_provider_link_identity_idx` ON `pantry_product_provider_links` (`product_id`,`snapshot_id`,`relation`);
--> statement-breakpoint
CREATE INDEX `pantry_product_provider_link_product_idx` ON `pantry_product_provider_links` (`product_id`);
--> statement-breakpoint
CREATE TABLE `food_provider_cache` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `operation` text NOT NULL,
  `cache_key` text NOT NULL,
  `result_kind` text NOT NULL,
  `payload` text DEFAULT 'null' NOT NULL,
  `schema_version` text NOT NULL,
  `fetched_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `stale_until` integer NOT NULL,
  `retry_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `food_provider_cache_identity_idx` ON `food_provider_cache` (`provider`,`operation`,`cache_key`);
--> statement-breakpoint
CREATE INDEX `food_provider_cache_expiry_idx` ON `food_provider_cache` (`stale_until`);
--> statement-breakpoint
CREATE TABLE `food_provider_rate_limits` (
  `provider` text NOT NULL,
  `operation` text NOT NULL,
  `window_started_at` integer NOT NULL,
  `request_count` integer DEFAULT 0 NOT NULL,
  `upstream_limit` integer,
  `upstream_remaining` integer,
  `retry_at` integer,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`provider`,`operation`)
);
--> statement-breakpoint
CREATE TABLE `food_catalog_import_operations` (
  `id` text PRIMARY KEY NOT NULL,
  `request_digest` text NOT NULL,
  `destination` text NOT NULL,
  `product_id` text NOT NULL REFERENCES `pantry_products`(`id`) ON DELETE RESTRICT,
  `result` text NOT NULL,
  `actor_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `created_at` integer NOT NULL
);
