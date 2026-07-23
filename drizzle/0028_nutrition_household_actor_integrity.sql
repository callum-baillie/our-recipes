CREATE TEMP TABLE `_nutrition_0028_guard` (`issue` text CHECK (`issue` IS NULL));
--> statement-breakpoint
INSERT INTO `_nutrition_0028_guard` (`issue`)
SELECT 'null legacy household link' WHERE EXISTS (
  SELECT 1 FROM `nutrition_profiles` WHERE `linked_household_profile_id` IS NULL
);
--> statement-breakpoint
INSERT INTO `_nutrition_0028_guard` (`issue`)
SELECT 'duplicate household link' WHERE EXISTS (
  SELECT 1 FROM `nutrition_profiles` GROUP BY `linked_household_profile_id` HAVING count(*) > 1
);
--> statement-breakpoint
INSERT INTO `_nutrition_0028_guard` (`issue`)
SELECT 'orphan household link' WHERE EXISTS (
  SELECT 1 FROM `nutrition_profiles` np
  LEFT JOIN `profiles` hp ON hp.`id` = np.`linked_household_profile_id`
  WHERE hp.`id` IS NULL
);
--> statement-breakpoint
INSERT INTO `_nutrition_0028_guard` (`issue`)
SELECT 'archive mismatch' WHERE EXISTS (
  SELECT 1 FROM `nutrition_profiles` np
  JOIN `profiles` hp ON hp.`id` = np.`linked_household_profile_id`
  WHERE (np.`archived_at` IS NULL) <> (hp.`archived_at` IS NULL)
);
--> statement-breakpoint
INSERT INTO `_nutrition_0028_guard` (`issue`)
SELECT 'shared owner principal' WHERE EXISTS (
  SELECT 1 FROM `nutrition_profiles` GROUP BY `owner_principal_id` HAVING count(*) > 1
);
--> statement-breakpoint
INSERT INTO `_nutrition_0028_guard` (`issue`)
SELECT 'missing owner principal' WHERE EXISTS (
  SELECT 1 FROM `nutrition_profiles` np
  LEFT JOIN `nutrition_principals` p ON p.`id` = np.`owner_principal_id`
  WHERE p.`id` IS NULL
);
--> statement-breakpoint
INSERT INTO `_nutrition_0028_guard` (`issue`)
SELECT 'unassigned nutrition profile' WHERE EXISTS (
  SELECT 1 FROM `nutrition_profiles` WHERE `profile_type` = 'unassigned'
);
--> statement-breakpoint
INSERT INTO `_nutrition_0028_guard` (`issue`)
SELECT 'missing profile id collision' WHERE EXISTS (
  SELECT 1 FROM `profiles` hp
  LEFT JOIN `nutrition_profiles` linked ON linked.`linked_household_profile_id` = hp.`id`
  JOIN `nutrition_profiles` collided ON collided.`id` = hp.`id`
  WHERE linked.`id` IS NULL
);
--> statement-breakpoint
INSERT INTO `_nutrition_0028_guard` (`issue`)
SELECT 'missing principal id collision' WHERE EXISTS (
  SELECT 1 FROM `profiles` hp
  LEFT JOIN `nutrition_profiles` linked ON linked.`linked_household_profile_id` = hp.`id`
  JOIN `nutrition_principals` collided ON collided.`id` = hp.`id`
  WHERE linked.`id` IS NULL
);
--> statement-breakpoint
INSERT INTO `_nutrition_0028_guard` (`issue`)
SELECT 'ambiguous historical principal actor' WHERE EXISTS (
  SELECT 1 FROM (
    SELECT `created_by_principal_id` AS `principal_id` FROM `nutrition_goal_versions`
    UNION ALL SELECT `created_by_principal_id` FROM `nutrition_body_measurements`
    UNION ALL SELECT `created_by_principal_id` FROM `nutrition_insight_feedback`
    UNION ALL SELECT `created_by_principal_id` FROM `nutrition_prepared_recipe_instances`
    UNION ALL SELECT `created_by_principal_id` FROM `nutrition_meal_allocation_versions`
    UNION ALL SELECT `created_by_principal_id` FROM `nutrition_intake_revisions`
    UNION ALL SELECT `principal_id` FROM `nutrition_consumption_commands`
    UNION ALL SELECT `principal_id` FROM `nutrition_diary_commands`
    UNION ALL SELECT `created_by_principal_id` FROM `nutrition_permission_versions`
  ) history
  WHERE (SELECT count(*) FROM `nutrition_profiles` np WHERE np.`owner_principal_id` = history.`principal_id`) <> 1
);
--> statement-breakpoint
INSERT INTO `nutrition_principals` (
  `id`, `credential_hash`, `access_version`, `archived_at`, `last_authenticated_at`, `created_at`, `updated_at`
)
SELECT
  hp.`id`, 'retired:actor-context-only:v1', 1, hp.`archived_at`, NULL, hp.`created_at`, hp.`updated_at`
FROM `profiles` hp
LEFT JOIN `nutrition_profiles` np ON np.`linked_household_profile_id` = hp.`id`
WHERE np.`id` IS NULL;
--> statement-breakpoint
INSERT INTO `nutrition_profiles` (
  `id`, `owner_principal_id`, `linked_household_profile_id`, `display_name`, `avatar_url`,
  `profile_type`, `measurement_system`, `nutrition_goal_type`, `dietary_preferences`,
  `food_allergies`, `dietary_exclusions`, `estimated_targets_enabled`,
  `estimated_target_consent`, `weight_tracking_enabled`, `comparison_visibility`,
  `diary_visibility`, `preferred_energy_unit`, `daily_reset_timezone`, `week_starts_on`,
  `reference_jurisdiction`, `version`, `archived_at`, `created_at`, `updated_at`,
  `visible_nutrient_codes`, `trend_range_days`, `show_planned_nutrition`,
  `show_recipe_card_nutrition`, `recipe_card_nutrient_codes`, `show_meal_plan_nutrition`
)
SELECT
  hp.`id`, hp.`id`, hp.`id`, hp.`display_name`, coalesce(hp.`avatar_url`, ''),
  'adult', hp.`units`, 'none', '[]', '[]', '[]', 0, 0, 0, 'named', 'private', 'kcal',
  hp.`timezone`, 1, 'US', 1, hp.`archived_at`, hp.`created_at`, hp.`updated_at`,
  '["fiber","calcium","iron","potassium","vitamin_d","sodium","added_sugars","saturated_fat"]',
  7, 1, 1, '["energy_kcal","protein","fiber"]', 1
FROM `profiles` hp
LEFT JOIN `nutrition_profiles` np ON np.`linked_household_profile_id` = hp.`id`
WHERE np.`id` IS NULL;
--> statement-breakpoint
UPDATE `nutrition_principals`
SET `credential_hash` = 'retired:actor-context-only:v1',
    `access_version` = `access_version` + 1,
    `last_authenticated_at` = NULL,
    `updated_at` = CAST(unixepoch('subsec') * 1000 AS integer);
--> statement-breakpoint
DROP INDEX `nutrition_profiles_owner_idx`;
--> statement-breakpoint
DROP INDEX `nutrition_profiles_household_link_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_profiles_owner_unique_idx` ON `nutrition_profiles` (`owner_principal_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_profiles_household_link_unique_idx` ON `nutrition_profiles` (`linked_household_profile_id`);
--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ALTER COLUMN `linked_household_profile_id` SET NOT NULL;
--> statement-breakpoint
CREATE TRIGGER `nutrition_profiles_require_household_link_insert`
BEFORE INSERT ON `nutrition_profiles`
WHEN NEW.`linked_household_profile_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'nutrition profile household link is required'); END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_profiles_require_household_link_update`
BEFORE UPDATE OF `linked_household_profile_id` ON `nutrition_profiles`
WHEN NEW.`linked_household_profile_id` IS NULL OR NEW.`linked_household_profile_id` <> OLD.`linked_household_profile_id`
BEGIN SELECT RAISE(ABORT, 'nutrition profile household link is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_profiles_require_owner_update`
BEFORE UPDATE OF `owner_principal_id` ON `nutrition_profiles`
WHEN NEW.`owner_principal_id` <> OLD.`owner_principal_id`
BEGIN SELECT RAISE(ABORT, 'nutrition profile owner is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_profiles_restrict_delete`
BEFORE DELETE ON `nutrition_profiles`
BEGIN SELECT RAISE(ABORT, 'archive nutrition profiles instead of deleting them'); END;
--> statement-breakpoint
CREATE TRIGGER `profiles_restrict_linked_nutrition_delete`
BEFORE DELETE ON `profiles`
WHEN EXISTS (SELECT 1 FROM `nutrition_profiles` WHERE `linked_household_profile_id` = OLD.`id`)
BEGIN SELECT RAISE(ABORT, 'archive linked household profiles instead of deleting them'); END;
--> statement-breakpoint
ALTER TABLE `nutrition_permission_versions` ADD `actor_household_profile_id` text REFERENCES `profiles`(`id`) ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `nutrition_goal_versions` ADD `actor_household_profile_id` text REFERENCES `profiles`(`id`) ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `nutrition_body_measurements` ADD `actor_household_profile_id` text REFERENCES `profiles`(`id`) ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `nutrition_insight_feedback` ADD `actor_household_profile_id` text REFERENCES `profiles`(`id`) ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `nutrition_prepared_recipe_instances` ADD `actor_household_profile_id` text REFERENCES `profiles`(`id`) ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `nutrition_meal_allocation_versions` ADD `actor_household_profile_id` text REFERENCES `profiles`(`id`) ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `nutrition_intake_revisions` ADD `actor_household_profile_id` text REFERENCES `profiles`(`id`) ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `nutrition_consumption_commands` ADD `actor_household_profile_id` text REFERENCES `profiles`(`id`) ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `nutrition_diary_commands` ADD `actor_household_profile_id` text REFERENCES `profiles`(`id`) ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX `nutrition_permission_actor_idx` ON `nutrition_permission_versions` (`actor_household_profile_id`);
--> statement-breakpoint
CREATE INDEX `nutrition_goal_actor_idx` ON `nutrition_goal_versions` (`actor_household_profile_id`);
--> statement-breakpoint
CREATE INDEX `nutrition_measurement_actor_idx` ON `nutrition_body_measurements` (`actor_household_profile_id`);
--> statement-breakpoint
CREATE INDEX `nutrition_insight_feedback_actor_idx` ON `nutrition_insight_feedback` (`actor_household_profile_id`);
--> statement-breakpoint
CREATE INDEX `nutrition_prepared_actor_idx` ON `nutrition_prepared_recipe_instances` (`actor_household_profile_id`);
--> statement-breakpoint
CREATE INDEX `nutrition_allocation_actor_idx` ON `nutrition_meal_allocation_versions` (`actor_household_profile_id`);
--> statement-breakpoint
CREATE INDEX `nutrition_intake_actor_idx` ON `nutrition_intake_revisions` (`actor_household_profile_id`);
--> statement-breakpoint
CREATE INDEX `nutrition_consumption_actor_idx` ON `nutrition_consumption_commands` (`actor_household_profile_id`);
--> statement-breakpoint
CREATE INDEX `nutrition_diary_command_actor_idx` ON `nutrition_diary_commands` (`actor_household_profile_id`);
--> statement-breakpoint
CREATE TRIGGER `nutrition_permission_versions_retired_insert`
BEFORE INSERT ON `nutrition_permission_versions`
BEGIN SELECT RAISE(ABORT, 'nutrition permissions are retired'); END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_goal_versions_require_actor_insert`
BEFORE INSERT ON `nutrition_goal_versions`
WHEN NEW.`actor_household_profile_id` IS NULL OR NOT EXISTS (
  SELECT 1 FROM `nutrition_profiles` np JOIN `profiles` hp ON hp.`id` = np.`linked_household_profile_id`
  WHERE np.`owner_principal_id` = NEW.`created_by_principal_id`
    AND np.`linked_household_profile_id` = NEW.`actor_household_profile_id`
    AND np.`archived_at` IS NULL AND hp.`archived_at` IS NULL
)
BEGIN SELECT RAISE(ABORT, 'valid household actor is required'); END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_body_measurements_require_actor_insert`
BEFORE INSERT ON `nutrition_body_measurements`
WHEN NEW.`actor_household_profile_id` IS NULL OR NOT EXISTS (
  SELECT 1 FROM `nutrition_profiles` np JOIN `profiles` hp ON hp.`id` = np.`linked_household_profile_id`
  WHERE np.`owner_principal_id` = NEW.`created_by_principal_id`
    AND np.`linked_household_profile_id` = NEW.`actor_household_profile_id`
    AND np.`archived_at` IS NULL AND hp.`archived_at` IS NULL
)
BEGIN SELECT RAISE(ABORT, 'valid household actor is required'); END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_insight_feedback_require_actor_insert`
BEFORE INSERT ON `nutrition_insight_feedback`
WHEN NEW.`actor_household_profile_id` IS NULL OR NOT EXISTS (
  SELECT 1 FROM `nutrition_profiles` np JOIN `profiles` hp ON hp.`id` = np.`linked_household_profile_id`
  WHERE np.`owner_principal_id` = NEW.`created_by_principal_id`
    AND np.`linked_household_profile_id` = NEW.`actor_household_profile_id`
    AND np.`archived_at` IS NULL AND hp.`archived_at` IS NULL
)
BEGIN SELECT RAISE(ABORT, 'valid household actor is required'); END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_prepared_recipe_instances_require_actor_insert`
BEFORE INSERT ON `nutrition_prepared_recipe_instances`
WHEN NEW.`actor_household_profile_id` IS NULL OR NOT EXISTS (
  SELECT 1 FROM `nutrition_profiles` np JOIN `profiles` hp ON hp.`id` = np.`linked_household_profile_id`
  WHERE np.`owner_principal_id` = NEW.`created_by_principal_id`
    AND np.`linked_household_profile_id` = NEW.`actor_household_profile_id`
    AND np.`archived_at` IS NULL AND hp.`archived_at` IS NULL
)
BEGIN SELECT RAISE(ABORT, 'valid household actor is required'); END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_meal_allocation_versions_require_actor_insert`
BEFORE INSERT ON `nutrition_meal_allocation_versions`
WHEN NEW.`actor_household_profile_id` IS NULL OR NOT EXISTS (
  SELECT 1 FROM `nutrition_profiles` np JOIN `profiles` hp ON hp.`id` = np.`linked_household_profile_id`
  WHERE np.`owner_principal_id` = NEW.`created_by_principal_id`
    AND np.`linked_household_profile_id` = NEW.`actor_household_profile_id`
    AND np.`archived_at` IS NULL AND hp.`archived_at` IS NULL
)
BEGIN SELECT RAISE(ABORT, 'valid household actor is required'); END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_intake_revisions_require_actor_insert`
BEFORE INSERT ON `nutrition_intake_revisions`
WHEN NEW.`actor_household_profile_id` IS NULL OR NOT EXISTS (
  SELECT 1 FROM `nutrition_profiles` np JOIN `profiles` hp ON hp.`id` = np.`linked_household_profile_id`
  WHERE np.`owner_principal_id` = NEW.`created_by_principal_id`
    AND np.`linked_household_profile_id` = NEW.`actor_household_profile_id`
    AND np.`archived_at` IS NULL AND hp.`archived_at` IS NULL
)
BEGIN SELECT RAISE(ABORT, 'valid household actor is required'); END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_consumption_commands_require_actor_insert`
BEFORE INSERT ON `nutrition_consumption_commands`
WHEN NEW.`actor_household_profile_id` IS NULL OR NOT EXISTS (
  SELECT 1 FROM `nutrition_profiles` np JOIN `profiles` hp ON hp.`id` = np.`linked_household_profile_id`
  WHERE np.`owner_principal_id` = NEW.`principal_id`
    AND np.`linked_household_profile_id` = NEW.`actor_household_profile_id`
    AND np.`archived_at` IS NULL AND hp.`archived_at` IS NULL
)
BEGIN SELECT RAISE(ABORT, 'valid household actor is required'); END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_diary_commands_require_actor_insert`
BEFORE INSERT ON `nutrition_diary_commands`
WHEN NEW.`actor_household_profile_id` IS NULL OR NOT EXISTS (
  SELECT 1 FROM `nutrition_profiles` np JOIN `profiles` hp ON hp.`id` = np.`linked_household_profile_id`
  WHERE np.`owner_principal_id` = NEW.`principal_id`
    AND np.`linked_household_profile_id` = NEW.`actor_household_profile_id`
    AND np.`archived_at` IS NULL AND hp.`archived_at` IS NULL
)
BEGIN SELECT RAISE(ABORT, 'valid household actor is required'); END;
--> statement-breakpoint
DROP TABLE `_nutrition_0028_guard`;
