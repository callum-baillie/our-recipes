CREATE TABLE `nutrient_definitions` (
	`code` text PRIMARY KEY NOT NULL,
	`canonical_name` text NOT NULL,
	`display_name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`category` text NOT NULL CHECK (`category` IN ('energy', 'macronutrient', 'mineral', 'vitamin', 'other')),
	`canonical_unit` text NOT NULL,
	`display_precision` integer NOT NULL CHECK (`display_precision` >= 0),
	`default_semantic` text NOT NULL CHECK (`default_semantic` IN ('target', 'minimum', 'range', 'limit', 'informational')),
	`upper_reference_possible` integer DEFAULT false NOT NULL CHECK (`upper_reference_possible` IN (0, 1)),
	`default_dashboard` integer DEFAULT false NOT NULL CHECK (`default_dashboard` IN (0, 1)),
	`display_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nutrition_data_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL CHECK (`source_type` IN ('legacy_recipe', 'manual', 'provider', 'laboratory', 'calculated', 'reference')),
	`name` text NOT NULL,
	`provider` text DEFAULT '' NOT NULL,
	`version` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`citation` text DEFAULT '' NOT NULL,
	`license` text DEFAULT '' NOT NULL,
	`retrieved_at` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_sources_identity_idx` ON `nutrition_data_sources` (`source_type`,`name`,`provider`,`version`);
--> statement-breakpoint
CREATE INDEX `nutrition_sources_priority_idx` ON `nutrition_data_sources` (`priority`);
--> statement-breakpoint
CREATE TABLE `food_nutrition_records` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`revision` integer NOT NULL CHECK (`revision` > 0),
	`source_id` text NOT NULL,
	`source_record_key` text DEFAULT '' NOT NULL,
	`basis_type` text NOT NULL CHECK (`basis_type` IN ('per_100g', 'per_100ml', 'per_serving', 'per_unit')),
	`basis_amount` real NOT NULL CHECK (`basis_amount` > 0),
	`basis_unit` text NOT NULL,
	`serving_weight_grams` real CHECK (`serving_weight_grams` IS NULL OR `serving_weight_grams` > 0),
	`density_grams_per_milliliter` real CHECK (`density_grams_per_milliliter` IS NULL OR `density_grams_per_milliliter` > 0),
	`piece_weight_grams` real CHECK (`piece_weight_grams` IS NULL OR `piece_weight_grams` > 0),
	`confidence` real NOT NULL CHECK (`confidence` >= 0 AND `confidence` <= 1),
	`completeness` real NOT NULL CHECK (`completeness` >= 0 AND `completeness` <= 1),
	`supersedes_record_id` text,
	`recorded_by_profile_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `pantry_products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `nutrition_data_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supersedes_record_id`) REFERENCES `food_nutrition_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recorded_by_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `food_nutrition_product_revision_idx` ON `food_nutrition_records` (`product_id`,`revision`);
--> statement-breakpoint
CREATE INDEX `food_nutrition_product_created_idx` ON `food_nutrition_records` (`product_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `food_nutrition_source_idx` ON `food_nutrition_records` (`source_id`);
--> statement-breakpoint
CREATE TABLE `food_nutrient_values` (
	`record_id` text NOT NULL,
	`nutrient_code` text NOT NULL,
	`amount` real NOT NULL CHECK (`amount` >= 0),
	`confidence` real CHECK (`confidence` IS NULL OR (`confidence` >= 0 AND `confidence` <= 1)),
	`source_note` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`record_id`, `nutrient_code`),
	FOREIGN KEY (`record_id`) REFERENCES `food_nutrition_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`nutrient_code`) REFERENCES `nutrient_definitions`(`code`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `food_nutrient_code_idx` ON `food_nutrient_values` (`nutrient_code`);
--> statement-breakpoint
CREATE TABLE `nutrition_calculation_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`algorithm` text NOT NULL,
	`version` text NOT NULL,
	`energy_factors_version` text NOT NULL,
	`retention_factors_version` text DEFAULT '' NOT NULL,
	`implementation_digest` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_calculation_version_identity_idx` ON `nutrition_calculation_versions` (`algorithm`,`version`,`implementation_digest`);
--> statement-breakpoint
CREATE TABLE `recipe_nutrition_calculations` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`recipe_revision` integer NOT NULL CHECK (`recipe_revision` > 0),
	`revision` integer NOT NULL CHECK (`revision` > 0),
	`calculation_version_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_digest` text NOT NULL,
	`serving_count` real CHECK (`serving_count` IS NULL OR `serving_count` > 0),
	`final_weight_grams` real CHECK (`final_weight_grams` IS NULL OR `final_weight_grams` > 0),
	`confidence` real NOT NULL CHECK (`confidence` >= 0 AND `confidence` <= 1),
	`completeness` real NOT NULL CHECK (`completeness` >= 0 AND `completeness` <= 1),
	`supersedes_calculation_id` text,
	`calculated_by_profile_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`calculation_version_id`) REFERENCES `nutrition_calculation_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `nutrition_data_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supersedes_calculation_id`) REFERENCES `recipe_nutrition_calculations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`calculated_by_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_nutrition_revision_idx` ON `recipe_nutrition_calculations` (`recipe_id`,`revision`);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_nutrition_source_digest_idx` ON `recipe_nutrition_calculations` (`recipe_id`,`recipe_revision`,`source_digest`);
--> statement-breakpoint
CREATE INDEX `recipe_nutrition_recipe_created_idx` ON `recipe_nutrition_calculations` (`recipe_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `recipe_nutrition_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`calculation_id` text NOT NULL,
	`recipe_ingredient_id` text,
	`product_nutrition_record_id` text,
	`amount_multiplier` real NOT NULL CHECK (`amount_multiplier` >= 0),
	`edible_portion` real NOT NULL CHECK (`edible_portion` >= 0 AND `edible_portion` <= 1),
	`drained_yield` real NOT NULL CHECK (`drained_yield` >= 0 AND `drained_yield` <= 1),
	`optional_included` integer NOT NULL CHECK (`optional_included` IN (0, 1)),
	`retention_factors` text DEFAULT '{}' NOT NULL,
	`confidence` real NOT NULL CHECK (`confidence` >= 0 AND `confidence` <= 1),
	`completeness` real NOT NULL CHECK (`completeness` >= 0 AND `completeness` <= 1),
	`missing_reason` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`calculation_id`) REFERENCES `recipe_nutrition_calculations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_ingredient_id`) REFERENCES `recipe_ingredients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`product_nutrition_record_id`) REFERENCES `food_nutrition_records`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recipe_nutrition_contribution_calculation_idx` ON `recipe_nutrition_contributions` (`calculation_id`);
--> statement-breakpoint
CREATE INDEX `recipe_nutrition_contribution_ingredient_idx` ON `recipe_nutrition_contributions` (`recipe_ingredient_id`);
--> statement-breakpoint
CREATE TABLE `recipe_nutrient_values` (
	`calculation_id` text NOT NULL,
	`nutrient_code` text NOT NULL,
	`amount` real NOT NULL CHECK (`amount` >= 0),
	`confidence` real CHECK (`confidence` IS NULL OR (`confidence` >= 0 AND `confidence` <= 1)),
	`completeness` real CHECK (`completeness` IS NULL OR (`completeness` >= 0 AND `completeness` <= 1)),
	PRIMARY KEY(`calculation_id`, `nutrient_code`),
	FOREIGN KEY (`calculation_id`) REFERENCES `recipe_nutrition_calculations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`nutrient_code`) REFERENCES `nutrient_definitions`(`code`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `recipe_nutrient_code_idx` ON `recipe_nutrient_values` (`nutrient_code`);
--> statement-breakpoint
INSERT INTO `nutrient_definitions` (`code`,`canonical_name`,`display_name`,`aliases`,`category`,`canonical_unit`,`display_precision`,`default_semantic`,`upper_reference_possible`,`default_dashboard`,`display_order`,`created_at`,`updated_at`) VALUES
('energy_kcal','energy_kcal','Calories','["kilocalories","kcal"]','energy','kcal',0,'target',0,1,10,unixepoch(),unixepoch()),
('energy_kj','energy_kj','Energy','["kilojoules","kj"]','energy','kJ',0,'target',0,0,20,unixepoch(),unixepoch()),
('protein','protein','Protein','[]','macronutrient','g',1,'minimum',0,1,30,unixepoch(),unixepoch()),
('carbohydrate','carbohydrate','Total carbohydrate','["carbs"]','macronutrient','g',1,'range',0,1,40,unixepoch(),unixepoch()),
('fiber','fiber','Dietary fiber','["fibre"]','macronutrient','g',1,'minimum',0,1,50,unixepoch(),unixepoch()),
('total_sugars','total_sugars','Total sugars','["sugar"]','macronutrient','g',1,'informational',0,0,60,unixepoch(),unixepoch()),
('added_sugars','added_sugars','Added sugars','[]','macronutrient','g',1,'limit',0,1,70,unixepoch(),unixepoch()),
('sugar_alcohols','sugar_alcohols','Sugar alcohols','[]','macronutrient','g',1,'informational',0,0,80,unixepoch(),unixepoch()),
('total_fat','total_fat','Total fat','["fat"]','macronutrient','g',1,'range',0,1,90,unixepoch(),unixepoch()),
('saturated_fat','saturated_fat','Saturated fat','[]','macronutrient','g',1,'limit',0,1,100,unixepoch(),unixepoch()),
('monounsaturated_fat','monounsaturated_fat','Monounsaturated fat','[]','macronutrient','g',1,'informational',0,0,110,unixepoch(),unixepoch()),
('polyunsaturated_fat','polyunsaturated_fat','Polyunsaturated fat','[]','macronutrient','g',1,'informational',0,0,120,unixepoch(),unixepoch()),
('trans_fat','trans_fat','Trans fat','[]','macronutrient','g',1,'limit',0,0,130,unixepoch(),unixepoch()),
('omega_3','omega_3','Omega-3 fatty acids','[]','macronutrient','g',2,'minimum',0,0,140,unixepoch(),unixepoch()),
('omega_6','omega_6','Omega-6 fatty acids','[]','macronutrient','g',2,'minimum',0,0,150,unixepoch(),unixepoch()),
('cholesterol','cholesterol','Cholesterol','[]','macronutrient','mg',0,'limit',0,0,160,unixepoch(),unixepoch()),
('alcohol','alcohol','Alcohol','[]','macronutrient','g',1,'limit',0,0,170,unixepoch(),unixepoch()),
('sodium','sodium','Sodium','[]','mineral','mg',0,'limit',1,1,180,unixepoch(),unixepoch()),
('potassium','potassium','Potassium','[]','mineral','mg',0,'minimum',1,1,190,unixepoch(),unixepoch()),
('calcium','calcium','Calcium','[]','mineral','mg',0,'minimum',1,1,200,unixepoch(),unixepoch()),
('iron','iron','Iron','[]','mineral','mg',1,'minimum',1,1,210,unixepoch(),unixepoch()),
('magnesium','magnesium','Magnesium','[]','mineral','mg',0,'minimum',1,0,220,unixepoch(),unixepoch()),
('phosphorus','phosphorus','Phosphorus','[]','mineral','mg',0,'minimum',1,0,230,unixepoch(),unixepoch()),
('zinc','zinc','Zinc','[]','mineral','mg',1,'minimum',1,0,240,unixepoch(),unixepoch()),
('copper','copper','Copper','[]','mineral','mg',2,'minimum',1,0,250,unixepoch(),unixepoch()),
('manganese','manganese','Manganese','[]','mineral','mg',2,'minimum',1,0,260,unixepoch(),unixepoch()),
('selenium','selenium','Selenium','[]','mineral','mcg',0,'minimum',1,0,270,unixepoch(),unixepoch()),
('iodine','iodine','Iodine','[]','mineral','mcg',0,'minimum',1,0,280,unixepoch(),unixepoch()),
('vitamin_a','vitamin_a','Vitamin A','[]','vitamin','mcg RAE',0,'minimum',1,0,290,unixepoch(),unixepoch()),
('vitamin_c','vitamin_c','Vitamin C','[]','vitamin','mg',1,'minimum',1,1,300,unixepoch(),unixepoch()),
('vitamin_d','vitamin_d','Vitamin D','[]','vitamin','mcg',1,'minimum',1,1,310,unixepoch(),unixepoch()),
('vitamin_e','vitamin_e','Vitamin E','[]','vitamin','mg',1,'minimum',1,0,320,unixepoch(),unixepoch()),
('vitamin_k','vitamin_k','Vitamin K','[]','vitamin','mcg',0,'minimum',0,0,330,unixepoch(),unixepoch()),
('thiamin','thiamin','Thiamin','["vitamin B1"]','vitamin','mg',2,'minimum',0,0,340,unixepoch(),unixepoch()),
('riboflavin','riboflavin','Riboflavin','["vitamin B2"]','vitamin','mg',2,'minimum',0,0,350,unixepoch(),unixepoch()),
('niacin','niacin','Niacin','["vitamin B3"]','vitamin','mg',1,'minimum',1,0,360,unixepoch(),unixepoch()),
('pantothenic_acid','pantothenic_acid','Pantothenic acid','["vitamin B5"]','vitamin','mg',1,'minimum',0,0,370,unixepoch(),unixepoch()),
('vitamin_b6','vitamin_b6','Vitamin B6','[]','vitamin','mg',2,'minimum',1,0,380,unixepoch(),unixepoch()),
('biotin','biotin','Biotin','["vitamin B7"]','vitamin','mcg',0,'minimum',0,0,390,unixepoch(),unixepoch()),
('folate','folate','Folate','["vitamin B9"]','vitamin','mcg DFE',0,'minimum',1,0,400,unixepoch(),unixepoch()),
('vitamin_b12','vitamin_b12','Vitamin B12','[]','vitamin','mcg',2,'minimum',0,1,410,unixepoch(),unixepoch()),
('choline','choline','Choline','[]','vitamin','mg',0,'minimum',1,0,420,unixepoch(),unixepoch()),
('water','water','Water','[]','other','g',1,'informational',0,0,430,unixepoch(),unixepoch()),
('caffeine','caffeine','Caffeine','[]','other','mg',0,'limit',0,0,440,unixepoch(),unixepoch()),
('serving_weight','serving_weight','Serving weight','[]','other','g',1,'informational',0,0,450,unixepoch(),unixepoch()),
('edible_portion_weight','edible_portion_weight','Edible portion weight','[]','other','g',1,'informational',0,0,460,unixepoch(),unixepoch());
--> statement-breakpoint
INSERT INTO `nutrition_data_sources` (`id`,`source_type`,`name`,`provider`,`version`,`source_url`,`citation`,`license`,`retrieved_at`,`priority`,`metadata`,`created_at`) VALUES
('legacy_recipe_fields','legacy_recipe','Legacy recipe nutrition fields','Our Recipes','1','','Values entered or imported before normalized Nutrition storage','',NULL,-100,'{"partial":true,"authoritative":false}',unixepoch());
--> statement-breakpoint
INSERT INTO `nutrition_calculation_versions` (`id`,`algorithm`,`version`,`energy_factors_version`,`retention_factors_version`,`implementation_digest`,`metadata`,`created_at`) VALUES
('legacy_recipe_fields_v1','legacy_recipe_fields','1','legacy-provided','','legacy-recipe-fields-v1','{"calculated":false,"partial":true}',unixepoch());
--> statement-breakpoint
INSERT INTO `recipe_nutrition_calculations` (`id`,`recipe_id`,`recipe_revision`,`revision`,`calculation_version_id`,`source_id`,`source_digest`,`serving_count`,`final_weight_grams`,`confidence`,`completeness`,`supersedes_calculation_id`,`calculated_by_profile_id`,`notes`,`created_at`)
SELECT 'legacy:' || `id` || ':' || `current_revision`, `id`, `current_revision`, 1, 'legacy_recipe_fields_v1', 'legacy_recipe_fields', 'legacy_recipe_fields:recipe:' || `id` || ':revision:' || `current_revision`, NULL, NULL, 0.5,
  ((`nutrition_calories` IS NOT NULL) + (`nutrition_protein_grams` IS NOT NULL) + (`nutrition_carbohydrate_grams` IS NOT NULL) + (`nutrition_fat_grams` IS NOT NULL) + (`nutrition_saturated_fat_grams` IS NOT NULL) + (`nutrition_fiber_grams` IS NOT NULL) + (`nutrition_sugar_grams` IS NOT NULL) + (`nutrition_sodium_milligrams` IS NOT NULL)) / 8.0,
  NULL, `last_edited_by_profile_id`, 'Snapshot of legacy recipe fields during migration 0016; not a product nutrition record.', unixepoch()
FROM `recipes`
WHERE `nutrition_calories` IS NOT NULL OR `nutrition_protein_grams` IS NOT NULL OR `nutrition_carbohydrate_grams` IS NOT NULL OR `nutrition_fat_grams` IS NOT NULL OR `nutrition_saturated_fat_grams` IS NOT NULL OR `nutrition_fiber_grams` IS NOT NULL OR `nutrition_sugar_grams` IS NOT NULL OR `nutrition_sodium_milligrams` IS NOT NULL;
--> statement-breakpoint
INSERT INTO `recipe_nutrient_values` (`calculation_id`,`nutrient_code`,`amount`,`confidence`,`completeness`)
SELECT 'legacy:' || `id` || ':' || `current_revision`, 'energy_kcal', `nutrition_calories`, 0.5, 1 FROM `recipes` WHERE `nutrition_calories` IS NOT NULL
UNION ALL SELECT 'legacy:' || `id` || ':' || `current_revision`, 'protein', `nutrition_protein_grams`, 0.5, 1 FROM `recipes` WHERE `nutrition_protein_grams` IS NOT NULL
UNION ALL SELECT 'legacy:' || `id` || ':' || `current_revision`, 'carbohydrate', `nutrition_carbohydrate_grams`, 0.5, 1 FROM `recipes` WHERE `nutrition_carbohydrate_grams` IS NOT NULL
UNION ALL SELECT 'legacy:' || `id` || ':' || `current_revision`, 'total_fat', `nutrition_fat_grams`, 0.5, 1 FROM `recipes` WHERE `nutrition_fat_grams` IS NOT NULL
UNION ALL SELECT 'legacy:' || `id` || ':' || `current_revision`, 'saturated_fat', `nutrition_saturated_fat_grams`, 0.5, 1 FROM `recipes` WHERE `nutrition_saturated_fat_grams` IS NOT NULL
UNION ALL SELECT 'legacy:' || `id` || ':' || `current_revision`, 'fiber', `nutrition_fiber_grams`, 0.5, 1 FROM `recipes` WHERE `nutrition_fiber_grams` IS NOT NULL
UNION ALL SELECT 'legacy:' || `id` || ':' || `current_revision`, 'total_sugars', `nutrition_sugar_grams`, 0.5, 1 FROM `recipes` WHERE `nutrition_sugar_grams` IS NOT NULL
UNION ALL SELECT 'legacy:' || `id` || ':' || `current_revision`, 'sodium', `nutrition_sodium_milligrams`, 0.5, 1 FROM `recipes` WHERE `nutrition_sodium_milligrams` IS NOT NULL;
