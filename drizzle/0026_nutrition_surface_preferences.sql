ALTER TABLE `nutrition_profiles` ADD `show_recipe_card_nutrition` integer NOT NULL DEFAULT 1 CHECK (`show_recipe_card_nutrition` IN (0,1));
--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ADD `recipe_card_nutrient_codes` text NOT NULL DEFAULT '["energy_kcal","protein","fiber"]';
--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ADD `show_meal_plan_nutrition` integer NOT NULL DEFAULT 1 CHECK (`show_meal_plan_nutrition` IN (0,1));
