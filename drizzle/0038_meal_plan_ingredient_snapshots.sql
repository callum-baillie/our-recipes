ALTER TABLE `meal_plan_entries` ADD `recipe_ingredients_snapshot` text DEFAULT '{"baseServings":"","ingredients":[]}' NOT NULL;
--> statement-breakpoint
UPDATE `meal_plan_entries`
SET `recipe_ingredients_snapshot`=COALESCE((
  SELECT json_object(
    'baseServings', `recipes`.`servings`,
    'ingredients', json(COALESCE((
      SELECT json_group_array(json_object(
        'ingredientId', `recipe_ingredients`.`id`,
        'item', `recipe_ingredients`.`item`,
        'quantity', `recipe_ingredients`.`quantity`,
        'unit', `recipe_ingredients`.`unit`,
        'note', `recipe_ingredients`.`note`,
        'productId', `recipe_ingredient_product_mappings`.`product_id`,
        'productName', `pantry_products`.`display_name`,
        'isOptional', COALESCE(`recipe_ingredient_product_mappings`.`is_optional`, 0)
      ))
      FROM `recipe_ingredients`
      LEFT JOIN `recipe_ingredient_product_mappings`
        ON `recipe_ingredient_product_mappings`.`recipe_ingredient_id`=`recipe_ingredients`.`id`
      LEFT JOIN `pantry_products`
        ON `pantry_products`.`id`=`recipe_ingredient_product_mappings`.`product_id`
      WHERE `recipe_ingredients`.`recipe_id`=`recipes`.`id`
    ), '[]'))
  )
  FROM `recipes`
  WHERE `recipes`.`id`=`meal_plan_entries`.`recipe_id`
), '{"baseServings":"","ingredients":[]}')
WHERE `recipe_id` IS NOT NULL;
