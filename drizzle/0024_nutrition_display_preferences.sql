ALTER TABLE `nutrition_profiles` ADD `visible_nutrient_codes` text NOT NULL DEFAULT '["fiber","calcium","iron","potassium","vitamin_d","sodium","added_sugars","saturated_fat"]';
--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ADD `trend_range_days` integer NOT NULL DEFAULT 7 CHECK (`trend_range_days` IN (7,14,30));
--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ADD `show_planned_nutrition` integer NOT NULL DEFAULT 1 CHECK (`show_planned_nutrition` IN (0,1));
