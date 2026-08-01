import type { ImageSourcePropType } from 'react-native';

export type Recipe = {
  id: string;
  revision?: number;
  title: string;
  subtitle: string;
  minutes: number;
  prepMinutes?: number;
  cookMinutes?: number;
  restMinutes?: number;
  servings: number;
  meal: string;
  image: ImageSourcePropType;
  tags: string[];
  ingredients: string[];
  steps: string[];
  stepCategories?: RecipeStepCategory[];
};
export type RecipeStepCategory =
  'prep' | 'chop' | 'mix' | 'boil' | 'simmer' | 'roast' | 'bake' | 'fry' | 'rest' | 'serve';
export type RecipeDraft = {
  title: string;
  summary: string;
  servings: string;
  prepMinutes: number;
  cookMinutes: number;
  restMinutes?: number;
  ingredients: string[];
  steps: string[];
  sourceName?: string;
  sourceUrl?: string;
  notice?: string;
  importId?: string;
};
export type RecipeCollection = {
  id: string;
  name: string;
  description: string;
  recipeCount: number;
  coverImage: { id: string; recipeId: string; altText?: string } | null;
  recipes?: { id: string; title: string; summary: string; position: number }[];
};
export type RecipeTag = { name: string; color: string; usageCount: number };
export type HouseholdProfile = {
  id: string;
  displayName: string;
  color: string;
  units: 'metric' | 'imperial';
  temperatureUnit: 'C' | 'F';
  locale: string;
  timezone: string;
  archivedAt?: string | null;
};
export type PantryItem = {
  id: string;
  name: string;
  amount: string;
  location: 'Pantry' | 'Fridge' | 'Freezer';
  expires: string;
  low?: boolean;
  icon: string;
  version?: number;
};
export type MealPlanItem = {
  id: string;
  day: number;
  date?: string;
  meal: string;
  recipeId: string | null;
  title?: string;
  time: string;
  servings: number;
};
export type ShoppingItem = {
  id: string;
  name: string;
  amount: string;
  aisle: string;
  done: boolean;
  source: string;
  quantity?: number | null;
  unit?: string;
  note?: string;
  aisleId?: string | null;
  shoppingState?: 'to_buy' | 'in_cart' | 'cant_find' | 'sourced';
};
export type ShoppingList = {
  id: string;
  name: string;
  status: 'active' | 'planned' | 'completed';
  supermarket?: { id?: string; name: string; locationLabel?: string } | null;
  items: ShoppingItem[];
};
export type Settings = Record<string, boolean | string | number>;

export type NutritionCache = {
  profiles: unknown[];
  household: unknown | null;
  profileDetails: Record<string, unknown>;
};
