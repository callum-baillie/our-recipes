CREATE TEMP TABLE `_shopping_item_category_backfill` (
  `shopping_list_item_id` text PRIMARY KEY NOT NULL,
  `display_name` text
);
--> statement-breakpoint
INSERT INTO `_shopping_item_category_backfill` (`shopping_list_item_id`,`display_name`)
SELECT item.`id`,
  CASE
    WHEN lower(item.`item`) LIKE '%frozen%' OR lower(item.`item`) LIKE '%ice cream%' THEN 'Frozen'
    WHEN lower(item.`item`) LIKE '%milk%' OR lower(item.`item`) LIKE '%cheese%' OR lower(item.`item`) LIKE '%yogurt%' OR lower(item.`item`) LIKE '%yoghurt%' OR (lower(item.`item`) LIKE '%butter%' AND lower(item.`item`) NOT LIKE '%peanut butter%') OR lower(item.`item`) LIKE '%cream%' OR lower(item.`item`) LIKE '%egg%' THEN 'Dairy & eggs'
    WHEN lower(item.`item`) LIKE '%chicken%' OR lower(item.`item`) LIKE '%turkey%' OR lower(item.`item`) LIKE '%beef%' OR lower(item.`item`) LIKE '%pork%' OR lower(item.`item`) LIKE '%lamb%' OR lower(item.`item`) LIKE '%sausage%' OR lower(item.`item`) LIKE '%bacon%' OR lower(item.`item`) LIKE '%fish%' OR lower(item.`item`) LIKE '%salmon%' OR lower(item.`item`) LIKE '%tuna%' OR lower(item.`item`) LIKE '%shrimp%' OR lower(item.`item`) LIKE '%prawn%' THEN 'Meat & seafood'
    WHEN lower(item.`item`) LIKE '%bread%' OR (lower(item.`item`) LIKE '%roll%' AND lower(item.`item`) NOT LIKE '%rolled oat%') OR lower(item.`item`) LIKE '% bun%' OR lower(item.`item`) LIKE '%bagel%' OR lower(item.`item`) LIKE '%pita%' OR lower(item.`item`) LIKE '%tortilla%' OR lower(item.`item`) LIKE '%croissant%' THEN 'Bakery'
    WHEN lower(item.`item`) LIKE '%bean%' OR lower(item.`item`) LIKE '%chickpea%' OR lower(item.`item`) LIKE '%canned%' OR lower(item.`item`) LIKE '%tinned%' OR lower(item.`item`) LIKE '%coconut milk%' OR lower(item.`item`) LIKE '%stock%' OR lower(item.`item`) LIKE '%broth%' THEN 'Canned & jarred'
    WHEN lower(item.`item`) LIKE '%oat%' OR lower(item.`item`) LIKE '%rice%' OR lower(item.`item`) LIKE '%pasta%' OR lower(item.`item`) LIKE '%noodle%' OR lower(item.`item`) LIKE '%lentil%' OR lower(item.`item`) LIKE '%quinoa%' OR lower(item.`item`) LIKE '%couscous%' OR lower(item.`item`) LIKE '%seed%' OR lower(item.`item`) LIKE '%nut%' THEN 'Dry goods & grains'
    WHEN lower(item.`item`) LIKE '%flour%' OR lower(item.`item`) LIKE '%sugar%' OR lower(item.`item`) LIKE '%baking powder%' OR lower(item.`item`) LIKE '%baking soda%' OR lower(item.`item`) LIKE '%yeast%' OR lower(item.`item`) LIKE '%vanilla%' OR lower(item.`item`) LIKE '%cocoa%' OR lower(item.`item`) LIKE '%chocolate chip%' THEN 'Baking'
    WHEN lower(item.`item`) LIKE '%salt%' OR lower(item.`item`) LIKE '%pepper%' OR lower(item.`item`) LIKE '%oregano%' OR lower(item.`item`) LIKE '%paprika%' OR lower(item.`item`) LIKE '%cumin%' OR lower(item.`item`) LIKE '%cinnamon%' OR lower(item.`item`) LIKE '%chili powder%' OR lower(item.`item`) LIKE '%seasoning%' THEN 'Herbs & spices'
    WHEN lower(item.`item`) LIKE '% oil%' OR lower(item.`item`) LIKE '%oil' OR lower(item.`item`) LIKE '%vinegar%' OR lower(item.`item`) LIKE '%salsa%' OR lower(item.`item`) LIKE '%sauce%' OR lower(item.`item`) LIKE '%mustard%' OR lower(item.`item`) LIKE '%ketchup%' OR lower(item.`item`) LIKE '%mayonnaise%' OR lower(item.`item`) LIKE '%juice%' THEN 'Sauces & condiments'
    WHEN lower(item.`item`) LIKE '%coffee%' OR lower(item.`item`) LIKE '% tea%' OR lower(item.`item`) LIKE '%soda%' OR lower(item.`item`) LIKE '%water%' OR lower(item.`item`) LIKE '%wine%' OR lower(item.`item`) LIKE '%beer%' THEN 'Drinks'
    WHEN lower(item.`item`) LIKE '%potato%' OR lower(item.`item`) LIKE '%broccoli%' OR lower(item.`item`) LIKE '%lemon%' OR lower(item.`item`) LIKE '%tomato%' OR lower(item.`item`) LIKE '%basil%' OR lower(item.`item`) LIKE '%mushroom%' OR lower(item.`item`) LIKE '%spinach%' OR lower(item.`item`) LIKE '%lettuce%' OR lower(item.`item`) LIKE '%avocado%' OR lower(item.`item`) LIKE '%cucumber%' OR lower(item.`item`) LIKE '%onion%' OR lower(item.`item`) LIKE '%garlic%' OR lower(item.`item`) LIKE '%carrot%' OR lower(item.`item`) LIKE '%berry%' OR lower(item.`item`) LIKE '%berries%' OR lower(item.`item`) LIKE '%apple%' OR lower(item.`item`) LIKE '%banana%' THEN 'Fresh produce'
    WHEN lower(item.`item`) LIKE '%tofu%' OR lower(item.`item`) LIKE '%hummus%' THEN 'Deli & chilled'
    WHEN lower(item.`item`) LIKE '%cracker%' OR lower(item.`item`) LIKE '%popcorn%' OR lower(item.`item`) LIKE '%chips%' OR lower(item.`item`) LIKE '%crisps%' OR lower(item.`item`) LIKE '%candy%' THEN 'Snacks'
    WHEN lower(item.`item`) LIKE '%paper towel%' OR lower(item.`item`) LIKE '%toilet paper%' OR lower(item.`item`) LIKE '%dish soap%' OR lower(item.`item`) LIKE '%foil%' OR lower(item.`item`) LIKE '%trash bag%' THEN 'Household'
    ELSE NULL
  END
FROM `shopping_list_items` item
JOIN `shopping_lists` list ON list.`id` = item.`list_id`
JOIN `supermarket_profiles` profile ON profile.`id` = list.`supermarket_profile_id`
WHERE item.`aisle_id` IS NULL AND profile.`normalized_name` = 'general grocery store';
--> statement-breakpoint
DELETE FROM `_shopping_item_category_backfill` WHERE `display_name` IS NULL;
--> statement-breakpoint
UPDATE `shopping_list_items`
SET `aisle_id` = (
  SELECT membership.`aisle_id`
  FROM `_shopping_item_category_backfill` classification
  JOIN `shopping_lists` list ON list.`id` = `shopping_list_items`.`list_id`
  JOIN `supermarket_profile_aisles` membership
    ON membership.`supermarket_profile_id` = list.`supermarket_profile_id`
   AND membership.`display_name` = classification.`display_name`
  WHERE classification.`shopping_list_item_id` = `shopping_list_items`.`id`
)
WHERE `id` IN (SELECT `shopping_list_item_id` FROM `_shopping_item_category_backfill`);
--> statement-breakpoint
DROP TABLE `_shopping_item_category_backfill`;
