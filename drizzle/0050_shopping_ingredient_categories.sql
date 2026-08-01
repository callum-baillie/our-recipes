ALTER TABLE `recipe_ingredients` ADD `shopping_category` text DEFAULT 'Other' NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `shopping_aisles` (`id`,`name`,`position`,`created_at`,`updated_at`) VALUES
(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), 'Fresh produce', 0, unixepoch(), unixepoch()),
(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), 'Bakery', 1, unixepoch(), unixepoch()),
(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), 'Meat & seafood', 2, unixepoch(), unixepoch()),
(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), 'Deli & chilled', 3, unixepoch(), unixepoch()),
(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), 'Dairy & eggs', 4, unixepoch(), unixepoch()),
(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), 'Frozen', 5, unixepoch(), unixepoch()),
(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), 'Canned & jarred', 6, unixepoch(), unixepoch()),
(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), 'Dry goods & grains', 7, unixepoch(), unixepoch()),
(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), 'Baking', 8, unixepoch(), unixepoch()),
(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), 'Herbs & spices', 9, unixepoch(), unixepoch()),
(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), 'Sauces & condiments', 10, unixepoch(), unixepoch()),
(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), 'Snacks', 11, unixepoch(), unixepoch()),
(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), 'Drinks', 12, unixepoch(), unixepoch()),
(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), 'Household', 13, unixepoch(), unixepoch());
--> statement-breakpoint
CREATE TEMP TABLE `_general_store_seed` (
  `household_id` text PRIMARY KEY NOT NULL,
  `supermarket_profile_id` text NOT NULL,
  `actor_profile_id` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `_general_store_seed` (`household_id`,`supermarket_profile_id`,`actor_profile_id`)
SELECT household.`id`,
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  actor.`id`
FROM `households` household
JOIN (SELECT `id` FROM `profiles` WHERE `archived_at` IS NULL ORDER BY `created_at` LIMIT 1) actor
WHERE NOT EXISTS (
  SELECT 1 FROM `supermarket_profiles` profile
  WHERE profile.`household_id` = household.`id` AND profile.`archived_at` IS NULL
);
--> statement-breakpoint
INSERT INTO `supermarket_profiles` (`id`,`household_id`,`name`,`normalized_name`,`location_label`,`normalized_location`,`notes`,`archived_at`,`created_by_profile_id`,`updated_by_profile_id`,`created_at`,`updated_at`)
SELECT seed.`supermarket_profile_id`, seed.`household_id`, 'General grocery store', 'general grocery store', '', '', 'A ready-to-use store route. Rename, reorder, or customize any section.', NULL, seed.`actor_profile_id`, seed.`actor_profile_id`, unixepoch(), unixepoch()
FROM `_general_store_seed` seed;
--> statement-breakpoint
INSERT INTO `supermarket_profile_aisles` (`id`,`supermarket_profile_id`,`aisle_id`,`display_name`,`position`,`match_terms`,`created_at`,`updated_at`)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  seed.`supermarket_profile_id`,
  aisle.`id`,
  aisle.`name`,
  CASE aisle.`name`
    WHEN 'Fresh produce' THEN 0 WHEN 'Bakery' THEN 1 WHEN 'Meat & seafood' THEN 2
    WHEN 'Deli & chilled' THEN 3 WHEN 'Dairy & eggs' THEN 4 WHEN 'Frozen' THEN 5
    WHEN 'Canned & jarred' THEN 6 WHEN 'Dry goods & grains' THEN 7 WHEN 'Baking' THEN 8
    WHEN 'Herbs & spices' THEN 9 WHEN 'Sauces & condiments' THEN 10 WHEN 'Snacks' THEN 11
    WHEN 'Drinks' THEN 12 ELSE 13
  END,
  CASE aisle.`name`
    WHEN 'Fresh produce' THEN '["fresh produce","fruit","vegetable","vegetables","berries","potato","onion","garlic","tomato","leafy greens","salad","fresh herbs"]'
    WHEN 'Bakery' THEN '["bakery","bread","rolls","buns","bagels","pita","tortilla","croissant"]'
    WHEN 'Meat & seafood' THEN '["meat","seafood","chicken","turkey","beef","pork","lamb","sausage","bacon","fish","salmon","tuna","shrimp","prawn"]'
    WHEN 'Deli & chilled' THEN '["deli","chilled","tofu","hummus","fresh pasta","prepared food"]'
    WHEN 'Dairy & eggs' THEN '["dairy","eggs","milk","cheese","yogurt","yoghurt","butter","cream","custard"]'
    WHEN 'Frozen' THEN '["frozen","ice cream","frozen fruit","frozen vegetables"]'
    WHEN 'Canned & jarred' THEN '["canned","tinned","jarred","beans","chickpeas","canned tomatoes","coconut milk","stock","broth"]'
    WHEN 'Dry goods & grains' THEN '["dry goods","grains","rice","pasta","noodles","oats","cereal","lentils","quinoa","couscous","seeds","nuts","peanut butter"]'
    WHEN 'Baking' THEN '["baking","flour","sugar","baking powder","baking soda","yeast","vanilla","cocoa","chocolate chips"]'
    WHEN 'Herbs & spices' THEN '["herbs","spices","salt","pepper","oregano","paprika","cumin","cinnamon","chili powder","seasoning"]'
    WHEN 'Sauces & condiments' THEN '["sauces","condiments","olive oil","cooking oil","vinegar","salsa","mustard","ketchup","mayonnaise","soy sauce","hot sauce"]'
    WHEN 'Snacks' THEN '["snacks","crisps","chips","crackers","popcorn","sweets","candy"]'
    WHEN 'Drinks' THEN '["drinks","beverages","coffee","tea","juice","soda","water","wine","beer"]'
    ELSE '["household","cleaning","paper towels","toilet paper","dish soap","foil","baking paper","trash bags"]'
  END,
  unixepoch(),
  unixepoch()
FROM `_general_store_seed` seed
JOIN `shopping_aisles` aisle
WHERE aisle.`name` IN ('Fresh produce','Bakery','Meat & seafood','Deli & chilled','Dairy & eggs','Frozen','Canned & jarred','Dry goods & grains','Baking','Herbs & spices','Sauces & condiments','Snacks','Drinks','Household');
--> statement-breakpoint
INSERT INTO `household_list_settings` (`household_id`,`default_supermarket_profile_id`,`completed_items_behavior`,`open_pantry_purchase_on_check`,`keep_screen_awake`,`updated_by_profile_id`,`created_at`,`updated_at`)
SELECT seed.`household_id`, seed.`supermarket_profile_id`, 'completed_section', true, false, seed.`actor_profile_id`, unixepoch(), unixepoch()
FROM `_general_store_seed` seed
WHERE NOT EXISTS (
  SELECT 1 FROM `household_list_settings` settings WHERE settings.`household_id` = seed.`household_id`
);
--> statement-breakpoint
UPDATE `household_list_settings`
SET `default_supermarket_profile_id` = (
  SELECT seed.`supermarket_profile_id` FROM `_general_store_seed` seed
  WHERE seed.`household_id` = `household_list_settings`.`household_id`
),
`updated_at` = unixepoch()
WHERE `default_supermarket_profile_id` IS NULL
  AND `household_id` IN (SELECT `household_id` FROM `_general_store_seed`);
--> statement-breakpoint
UPDATE `shopping_lists`
SET `supermarket_profile_id` = (
  SELECT seed.`supermarket_profile_id` FROM `_general_store_seed` seed LIMIT 1
)
WHERE `supermarket_profile_id` IS NULL AND EXISTS (SELECT 1 FROM `_general_store_seed`);
--> statement-breakpoint
DROP TABLE `_general_store_seed`;
