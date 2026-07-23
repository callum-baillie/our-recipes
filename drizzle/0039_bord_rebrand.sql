ALTER TABLE `households` ADD `kitchen_name` text DEFAULT 'Bòrd' NOT NULL;
--> statement-breakpoint
UPDATE `households`
SET `kitchen_name` = CASE
  WHEN lower(trim(`app_name`)) NOT IN ('our recipes', 'our kitchen') THEN trim(`app_name`)
  WHEN lower(trim(`name`)) NOT IN ('our recipes', 'our kitchen') THEN trim(`name`)
  ELSE 'Bòrd'
END;
--> statement-breakpoint
ALTER TABLE `households` ADD `kitchen_icon` text DEFAULT 'table' NOT NULL;
--> statement-breakpoint
UPDATE `households` SET `kitchen_icon` = `brand_icon` WHERE trim(`brand_icon`) <> '';
--> statement-breakpoint
ALTER TABLE `households` DROP COLUMN `name`;
--> statement-breakpoint
ALTER TABLE `households` DROP COLUMN `app_name`;
--> statement-breakpoint
ALTER TABLE `households` DROP COLUMN `brand_icon`;
--> statement-breakpoint
UPDATE `nutrition_data_sources`
SET `provider` = 'Bòrd'
WHERE `provider` = 'Our Recipes'
  AND `id` NOT IN ('our_recipes_manual_diary_v1','our_recipes_manual_food_records_v1','our_recipes_recipe_calculator_v1');
--> statement-breakpoint
INSERT INTO `nutrition_data_sources` (`id`,`source_type`,`name`,`provider`,`version`,`source_url`,`citation`,`license`,`retrieved_at`,`priority`,`metadata`,`created_at`)
SELECT 'bord_manual_diary_v1',`source_type`,`name`,'Bòrd',`version`,`source_url`,`citation`,`license`,`retrieved_at`,`priority`,`metadata`,`created_at`
FROM `nutrition_data_sources` WHERE `id` = 'our_recipes_manual_diary_v1';
--> statement-breakpoint
INSERT INTO `nutrition_data_sources` (`id`,`source_type`,`name`,`provider`,`version`,`source_url`,`citation`,`license`,`retrieved_at`,`priority`,`metadata`,`created_at`)
SELECT 'bord_manual_food_records_v1',`source_type`,`name`,'Bòrd',`version`,`source_url`,`citation`,`license`,`retrieved_at`,`priority`,`metadata`,`created_at`
FROM `nutrition_data_sources` WHERE `id` = 'our_recipes_manual_food_records_v1';
--> statement-breakpoint
INSERT INTO `nutrition_data_sources` (`id`,`source_type`,`name`,`provider`,`version`,`source_url`,`citation`,`license`,`retrieved_at`,`priority`,`metadata`,`created_at`)
SELECT 'bord_recipe_calculator_v1',`source_type`,'Bòrd ingredient calculation','Bòrd',`version`,`source_url`,`citation`,`license`,`retrieved_at`,`priority`,`metadata`,`created_at`
FROM `nutrition_data_sources` WHERE `id` = 'our_recipes_recipe_calculator_v1';
--> statement-breakpoint
UPDATE `food_nutrition_records` SET `source_id` = 'bord_manual_diary_v1' WHERE `source_id` = 'our_recipes_manual_diary_v1';
--> statement-breakpoint
UPDATE `food_nutrition_records` SET `source_id` = 'bord_manual_food_records_v1' WHERE `source_id` = 'our_recipes_manual_food_records_v1';
--> statement-breakpoint
UPDATE `food_nutrition_records` SET `source_id` = 'bord_recipe_calculator_v1' WHERE `source_id` = 'our_recipes_recipe_calculator_v1';
--> statement-breakpoint
UPDATE `recipe_nutrition_calculations` SET `source_id` = 'bord_recipe_calculator_v1' WHERE `source_id` = 'our_recipes_recipe_calculator_v1';
--> statement-breakpoint
DELETE FROM `nutrition_data_sources` WHERE `id` IN ('our_recipes_manual_diary_v1','our_recipes_manual_food_records_v1','our_recipes_recipe_calculator_v1');
--> statement-breakpoint
INSERT INTO `nutrition_calculation_versions` (`id`,`algorithm`,`version`,`energy_factors_version`,`retention_factors_version`,`implementation_digest`,`metadata`,`created_at`)
SELECT 'bord_recipe_calculator_v2','bord_recipe_nutrition',`version`,`energy_factors_version`,`retention_factors_version`,`implementation_digest`,`metadata`,`created_at`
FROM `nutrition_calculation_versions` WHERE `id` = 'our_recipes_recipe_calculator_v2';
--> statement-breakpoint
UPDATE `recipe_nutrition_calculations` SET `calculation_version_id` = 'bord_recipe_calculator_v2' WHERE `calculation_version_id` = 'our_recipes_recipe_calculator_v2';
--> statement-breakpoint
DELETE FROM `nutrition_calculation_versions` WHERE `id` = 'our_recipes_recipe_calculator_v2';
