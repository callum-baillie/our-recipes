export type MealType = string;

export type MealTypeOption = {
  value: MealType;
  label: string;
  description?: string;
  defaultVisible: boolean;
};

export const MEAL_OPTIONS: MealTypeOption[] = [
  { value: 'breakfast', label: 'Breakfast', defaultVisible: true },
  { value: 'lunch', label: 'Lunch', defaultVisible: true },
  { value: 'dinner', label: 'Dinner', defaultVisible: true },
  { value: 'dessert', label: 'Dessert', defaultVisible: true },
  { value: 'snack', label: 'Snack', defaultVisible: true },
  {
    value: 'brunch',
    label: 'Brunch',
    description: 'A late-morning meal combining breakfast and lunch.',
    defaultVisible: false,
  },
  {
    value: 'supper',
    label: 'Supper',
    description: 'An evening meal, often lighter or later than dinner.',
    defaultVisible: false,
  },
  {
    value: 'tiffin',
    label: 'Tiffin',
    description: 'A small meal or packed midday meal used in Indian English.',
    defaultVisible: false,
  },
  {
    value: 'suhoor',
    label: 'Suhoor',
    description: 'The pre-dawn meal before a Ramadan fast.',
    defaultVisible: false,
  },
  {
    value: 'iftar',
    label: 'Iftar',
    description: 'The sunset meal that breaks a Ramadan fast.',
    defaultVisible: false,
  },
];

export const DEFAULT_VISIBLE_MEAL_TYPES = MEAL_OPTIONS.filter(
  (option) => option.defaultVisible,
).map((option) => option.value);

export function mealTypeLabel(meal: MealType, options: MealTypeOption[] = MEAL_OPTIONS): string {
  const known = options.find((option) => option.value === meal)?.label;
  if (known) return known;
  return meal
    .replace(/^custom-/u, '')
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toLocaleUpperCase()}${part.slice(1)}`)
    .join(' ');
}
