UPDATE `supermarket_profile_aisles`
SET `match_terms` = '["fresh produce","fruit","vegetable","vegetables","berries","potato","celery","onion","garlic","ginger","tomato","peach","pear","orange","lemon","lime","leafy greens","salad","fresh herbs","parsley","cilantro","coriander"]'
WHERE `display_name` = 'Fresh produce'
  AND `supermarket_profile_id` IN (
    SELECT `id` FROM `supermarket_profiles` WHERE `normalized_name` = 'general grocery store'
  );
--> statement-breakpoint
UPDATE `supermarket_profile_aisles`
SET `match_terms` = '["dairy","eggs","milk","cheese","cheddar","mozzarella","yogurt","yoghurt","butter","cream","half and half","custard"]'
WHERE `display_name` = 'Dairy & eggs'
  AND `supermarket_profile_id` IN (
    SELECT `id` FROM `supermarket_profiles` WHERE `normalized_name` = 'general grocery store'
  );
--> statement-breakpoint
UPDATE `supermarket_profile_aisles`
SET `match_terms` = '["canned","tinned","jarred","beans","chickpeas","canned tomatoes","crushed tomatoes","diced tomatoes","tomato paste","coconut milk","stock","broth"]'
WHERE `display_name` = 'Canned & jarred'
  AND `supermarket_profile_id` IN (
    SELECT `id` FROM `supermarket_profiles` WHERE `normalized_name` = 'general grocery store'
  );
--> statement-breakpoint
UPDATE `supermarket_profile_aisles`
SET `match_terms` = '["dry goods","grains","rice","pasta","noodles","oats","cereal","granola","lentils","quinoa","couscous","seeds","nuts","pecans","peanut butter"]'
WHERE `display_name` = 'Dry goods & grains'
  AND `supermarket_profile_id` IN (
    SELECT `id` FROM `supermarket_profiles` WHERE `normalized_name` = 'general grocery store'
  );
--> statement-breakpoint
UPDATE `supermarket_profile_aisles`
SET `match_terms` = '["sauces","condiments","olive oil","cooking oil","vinegar","salsa","mustard","ketchup","mayonnaise","soy sauce","hot sauce","pesto","honey","maple syrup"]'
WHERE `display_name` = 'Sauces & condiments'
  AND `supermarket_profile_id` IN (
    SELECT `id` FROM `supermarket_profiles` WHERE `normalized_name` = 'general grocery store'
  );
--> statement-breakpoint
CREATE TEMP TABLE `_shopping_item_category_refinement` (
  `shopping_list_item_id` text PRIMARY KEY NOT NULL,
  `display_name` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `_shopping_item_category_refinement` (`shopping_list_item_id`,`display_name`)
SELECT item.`id`,
  CASE
    WHEN lower(item.`item`) LIKE '%mozzarella%' OR lower(item.`item`) LIKE '%cheddar%' OR lower(item.`item`) LIKE '%half-and-half%' OR lower(item.`item`) LIKE '%half and half%' THEN 'Dairy & eggs'
    WHEN lower(item.`item`) LIKE '%granola%' OR lower(item.`item`) LIKE '%pecan%' THEN 'Dry goods & grains'
    WHEN lower(item.`item`) LIKE '%honey%' OR lower(item.`item`) LIKE '%maple syrup%' THEN 'Sauces & condiments'
    ELSE 'Fresh produce'
  END
FROM `shopping_list_items` item
JOIN `shopping_lists` list ON list.`id` = item.`list_id`
JOIN `supermarket_profiles` profile ON profile.`id` = list.`supermarket_profile_id`
WHERE item.`aisle_id` IS NULL
  AND profile.`normalized_name` = 'general grocery store'
  AND (
    lower(item.`item`) LIKE '%celery%'
    OR lower(item.`item`) LIKE '%parsley%'
    OR lower(item.`item`) LIKE '%ginger%'
    OR lower(item.`item`) LIKE '%peach%'
    OR lower(item.`item`) LIKE '%mozzarella%'
    OR lower(item.`item`) LIKE '%cheddar%'
    OR lower(item.`item`) LIKE '%half-and-half%'
    OR lower(item.`item`) LIKE '%half and half%'
    OR lower(item.`item`) LIKE '%granola%'
    OR lower(item.`item`) LIKE '%pecan%'
    OR lower(item.`item`) LIKE '%honey%'
    OR lower(item.`item`) LIKE '%maple syrup%'
  );
--> statement-breakpoint
UPDATE `shopping_list_items`
SET `aisle_id` = (
  SELECT membership.`aisle_id`
  FROM `_shopping_item_category_refinement` classification
  JOIN `shopping_lists` list ON list.`id` = `shopping_list_items`.`list_id`
  JOIN `supermarket_profile_aisles` membership
    ON membership.`supermarket_profile_id` = list.`supermarket_profile_id`
   AND membership.`display_name` = classification.`display_name`
  WHERE classification.`shopping_list_item_id` = `shopping_list_items`.`id`
)
WHERE `id` IN (SELECT `shopping_list_item_id` FROM `_shopping_item_category_refinement`);
--> statement-breakpoint
DROP TABLE `_shopping_item_category_refinement`;
--> statement-breakpoint
UPDATE `shopping_list_items`
SET `aisle_id` = (
  SELECT membership.`aisle_id`
  FROM `shopping_lists` list
  JOIN `supermarket_profile_aisles` membership
    ON membership.`supermarket_profile_id` = list.`supermarket_profile_id`
   AND membership.`display_name` = 'Canned & jarred'
  WHERE list.`id` = `shopping_list_items`.`list_id`
)
WHERE lower(`item`) IN ('crushed tomatoes', 'diced tomatoes', 'tomato paste')
  AND lower(trim(`unit`)) IN ('can', 'cans', 'tin', 'tins')
  AND `list_id` IN (
    SELECT list.`id`
    FROM `shopping_lists` list
    JOIN `supermarket_profiles` profile ON profile.`id` = list.`supermarket_profile_id`
    WHERE profile.`normalized_name` = 'general grocery store'
  );
--> statement-breakpoint
UPDATE `shopping_list_items`
SET `aisle_id` = (
  SELECT membership.`aisle_id`
  FROM `shopping_lists` list
  JOIN `supermarket_profile_aisles` membership
    ON membership.`supermarket_profile_id` = list.`supermarket_profile_id`
   AND membership.`display_name` = 'Sauces & condiments'
  WHERE list.`id` = `shopping_list_items`.`list_id`
)
WHERE lower(`item`) LIKE '%pesto%'
  AND `list_id` IN (
    SELECT list.`id`
    FROM `shopping_lists` list
    JOIN `supermarket_profiles` profile ON profile.`id` = list.`supermarket_profile_id`
    WHERE profile.`normalized_name` = 'general grocery store'
  );
