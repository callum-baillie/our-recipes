UPDATE `pantry_products`
SET `restock_mode` = 'none',
    `restock_trigger` = 'below_target'
WHERE `restock_mode` = 'always_have'
  AND `is_staple` = 1
  AND `suggest_grocery_restock` = 1
  AND (
    `target_stock` IS NULL
    OR `target_stock` <= 0
    OR `reorder_threshold` IS NULL
    OR `reorder_threshold` < 0
    OR `reorder_threshold` >= `target_stock`
    OR trim(`stock_unit`) = ''
  );
