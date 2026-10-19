// Mirrors the server nutrient definitions; contract tests detect drift.
export const nutrientCatalog = [
  {
    code: 'energy_kcal',
    name: 'Calories',
    unit: 'kcal',
  },
  {
    code: 'energy_kj',
    name: 'Energy',
    unit: 'kJ',
  },
  {
    code: 'protein',
    name: 'Protein',
    unit: 'g',
  },
  {
    code: 'carbohydrate',
    name: 'Total carbohydrate',
    unit: 'g',
  },
  {
    code: 'fiber',
    name: 'Dietary fiber',
    unit: 'g',
  },
  {
    code: 'total_sugars',
    name: 'Total sugars',
    unit: 'g',
  },
  {
    code: 'added_sugars',
    name: 'Added sugars',
    unit: 'g',
  },
  {
    code: 'sugar_alcohols',
    name: 'Sugar alcohols',
    unit: 'g',
  },
  {
    code: 'total_fat',
    name: 'Total fat',
    unit: 'g',
  },
  {
    code: 'saturated_fat',
    name: 'Saturated fat',
    unit: 'g',
  },
  {
    code: 'monounsaturated_fat',
    name: 'Monounsaturated fat',
    unit: 'g',
  },
  {
    code: 'polyunsaturated_fat',
    name: 'Polyunsaturated fat',
    unit: 'g',
  },
  {
    code: 'trans_fat',
    name: 'Trans fat',
    unit: 'g',
  },
  {
    code: 'omega_3',
    name: 'Omega-3 fatty acids',
    unit: 'g',
  },
  {
    code: 'omega_6',
    name: 'Omega-6 fatty acids',
    unit: 'g',
  },
  {
    code: 'cholesterol',
    name: 'Cholesterol',
    unit: 'mg',
  },
  {
    code: 'alcohol',
    name: 'Alcohol',
    unit: 'g',
  },
  {
    code: 'sodium',
    name: 'Sodium',
    unit: 'mg',
  },
  {
    code: 'potassium',
    name: 'Potassium',
    unit: 'mg',
  },
  {
    code: 'calcium',
    name: 'Calcium',
    unit: 'mg',
  },
  {
    code: 'iron',
    name: 'Iron',
    unit: 'mg',
  },
  {
    code: 'magnesium',
    name: 'Magnesium',
    unit: 'mg',
  },
  {
    code: 'phosphorus',
    name: 'Phosphorus',
    unit: 'mg',
  },
  {
    code: 'zinc',
    name: 'Zinc',
    unit: 'mg',
  },
  {
    code: 'copper',
    name: 'Copper',
    unit: 'mg',
  },
  {
    code: 'manganese',
    name: 'Manganese',
    unit: 'mg',
  },
  {
    code: 'selenium',
    name: 'Selenium',
    unit: 'mcg',
  },
  {
    code: 'iodine',
    name: 'Iodine',
    unit: 'mcg',
  },
  {
    code: 'vitamin_a',
    name: 'Vitamin A',
    unit: 'mcg RAE',
  },
  {
    code: 'vitamin_c',
    name: 'Vitamin C',
    unit: 'mg',
  },
  {
    code: 'vitamin_d',
    name: 'Vitamin D',
    unit: 'mcg',
  },
  {
    code: 'vitamin_e',
    name: 'Vitamin E',
    unit: 'mg',
  },
  {
    code: 'vitamin_k',
    name: 'Vitamin K',
    unit: 'mcg',
  },
  {
    code: 'thiamin',
    name: 'Thiamin',
    unit: 'mg',
  },
  {
    code: 'riboflavin',
    name: 'Riboflavin',
    unit: 'mg',
  },
  {
    code: 'niacin',
    name: 'Niacin',
    unit: 'mg',
  },
  {
    code: 'pantothenic_acid',
    name: 'Pantothenic acid',
    unit: 'mg',
  },
  {
    code: 'vitamin_b6',
    name: 'Vitamin B6',
    unit: 'mg',
  },
  {
    code: 'biotin',
    name: 'Biotin',
    unit: 'mcg',
  },
  {
    code: 'folate',
    name: 'Folate',
    unit: 'mcg DFE',
  },
  {
    code: 'vitamin_b12',
    name: 'Vitamin B12',
    unit: 'mcg',
  },
  {
    code: 'choline',
    name: 'Choline',
    unit: 'mg',
  },
  {
    code: 'water',
    name: 'Water',
    unit: 'g',
  },
  {
    code: 'caffeine',
    name: 'Caffeine',
    unit: 'mg',
  },
  {
    code: 'serving_weight',
    name: 'Serving weight',
    unit: 'g',
  },
  {
    code: 'edible_portion_weight',
    name: 'Edible portion weight',
    unit: 'g',
  },
] as const;
