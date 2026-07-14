CREATE TABLE `import_artifacts` (
  `id` text PRIMARY KEY NOT NULL,
  `import_operation_id` text NOT NULL REFERENCES `import_operations`(`id`) ON UPDATE no action ON DELETE cascade,
  `position` integer NOT NULL,
  `source_name` text NOT NULL,
  `storage_key` text NOT NULL UNIQUE,
  `media_type` text NOT NULL,
  `source_sha256` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_artifacts_operation_position_idx` ON `import_artifacts` (`import_operation_id`,`position`);
--> statement-breakpoint
CREATE INDEX `import_artifacts_operation_idx` ON `import_artifacts` (`import_operation_id`);
--> statement-breakpoint
INSERT INTO `import_artifacts` (
  `id`,
  `import_operation_id`,
  `position`,
  `source_name`,
  `storage_key`,
  `media_type`,
  `source_sha256`,
  `created_at`
)
SELECT
  `id`,
  `id`,
  0,
  `source_name`,
  `storage_key`,
  `media_type`,
  `source_sha256`,
  `created_at`
FROM `import_operations`;
