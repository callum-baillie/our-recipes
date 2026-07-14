CREATE TABLE `households` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `app_name` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `display_name` text NOT NULL,
  `color` text NOT NULL,
  `avatar_url` text,
  `units` text NOT NULL,
  `temperature_unit` text NOT NULL,
  `locale` text NOT NULL,
  `timezone` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
