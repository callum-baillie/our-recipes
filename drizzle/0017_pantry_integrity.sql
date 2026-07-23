ALTER TABLE `pantry_inventory_events` ADD `batch_sequence` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `pantry_inventory_events`
SET `batch_sequence` = (
  SELECT COUNT(*)
  FROM `pantry_inventory_events` AS `earlier`
  WHERE `earlier`.`batch_id` = `pantry_inventory_events`.`batch_id`
    AND (
      `earlier`.`created_at` < `pantry_inventory_events`.`created_at`
      OR (
        `earlier`.`created_at` = `pantry_inventory_events`.`created_at`
        AND `earlier`.`id` <= `pantry_inventory_events`.`id`
      )
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_events_batch_sequence_idx`
ON `pantry_inventory_events` (`batch_id`, `batch_sequence`);
--> statement-breakpoint
CREATE TRIGGER `pantry_batches_measurement_insert`
BEFORE INSERT ON `pantry_batches`
WHEN NOT (
  (
    NEW.`quantity_remaining` IS NOT NULL
    AND NEW.`approximate_state` IS NULL
  )
  OR (
    NEW.`quantity_remaining` IS NULL
    AND NEW.`original_quantity` IS NULL
    AND NEW.`approximate_state` IS NOT NULL
  )
)
BEGIN
  SELECT RAISE(ABORT, 'Pantry batch must use either exact or approximate measurement');
END;
--> statement-breakpoint
CREATE TRIGGER `pantry_batches_measurement_update`
BEFORE UPDATE OF `quantity_remaining`, `original_quantity`, `approximate_state` ON `pantry_batches`
WHEN NOT (
  (
    NEW.`quantity_remaining` IS NOT NULL
    AND NEW.`approximate_state` IS NULL
  )
  OR (
    NEW.`quantity_remaining` IS NULL
    AND NEW.`original_quantity` IS NULL
    AND NEW.`approximate_state` IS NOT NULL
  )
)
BEGIN
  SELECT RAISE(ABORT, 'Pantry batch must use either exact or approximate measurement');
END;
--> statement-breakpoint
UPDATE `pantry_batches` SET `quantity_remaining` = `quantity_remaining`;
--> statement-breakpoint
CREATE TRIGGER `pantry_products_active_stock_archive`
BEFORE UPDATE OF `archived_at` ON `pantry_products`
WHEN NEW.`archived_at` IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM `pantry_batches`
    WHERE `product_id` = NEW.`id`
      AND `status` IN ('unopened', 'opened', 'frozen', 'thawed', 'reserved')
  )
BEGIN
  SELECT RAISE(ABORT, 'Cannot archive a Pantry product with active stock');
END;
--> statement-breakpoint
UPDATE `pantry_products` SET `archived_at` = `archived_at`
WHERE `archived_at` IS NOT NULL;

