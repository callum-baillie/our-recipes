ALTER TABLE `meal_plan_entries` ADD `recipe_revision` integer;
--> statement-breakpoint
ALTER TABLE `meal_plan_entries` ADD `recipe_calculation_id` text REFERENCES `recipe_nutrition_calculations`(`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `meal_plan_entries` ADD `recipe_title_snapshot` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `meal_plan_entries`
SET `recipe_revision`=(SELECT `current_revision` FROM `recipes` WHERE `recipes`.`id`=`meal_plan_entries`.`recipe_id`),
    `recipe_calculation_id`=(SELECT `id` FROM `recipe_nutrition_calculations` WHERE `recipe_id`=`meal_plan_entries`.`recipe_id` ORDER BY `revision` DESC LIMIT 1),
    `recipe_title_snapshot`=COALESCE((SELECT `title` FROM `recipes` WHERE `recipes`.`id`=`meal_plan_entries`.`recipe_id`),'')
WHERE `recipe_id` IS NOT NULL;
