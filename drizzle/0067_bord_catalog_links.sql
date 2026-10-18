ALTER TABLE supermarket_profiles ADD COLUMN catalog_store_id text;
--> statement-breakpoint
ALTER TABLE supermarket_profiles ADD COLUMN catalog_generation text;
--> statement-breakpoint
ALTER TABLE supermarket_profiles ADD COLUMN catalog_revision text;
--> statement-breakpoint
ALTER TABLE supermarket_profiles ADD COLUMN catalog_metadata text;
--> statement-breakpoint
ALTER TABLE supermarket_profiles ADD COLUMN catalog_linked_at integer;
--> statement-breakpoint
ALTER TABLE food_provider_snapshots ADD COLUMN transport_id text;
--> statement-breakpoint
ALTER TABLE food_provider_snapshots ADD COLUMN source_revision text;
--> statement-breakpoint
ALTER TABLE food_provider_snapshots ADD COLUMN catalog_generation text;
--> statement-breakpoint
ALTER TABLE food_provider_snapshots ADD COLUMN canonical_product_id text;
