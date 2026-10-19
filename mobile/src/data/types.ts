import type { ImageSourcePropType } from 'react-native';

export type Recipe = {
  id: string;
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
  lastCookedAt?: string | null;
  personalRating?: number | null;
  title: string;
  subtitle: string;
  minutes: number;
  prepMinutes?: number;
  cookMinutes?: number;
  restMinutes?: number;
  servings: number;
  servingsLabel?: string;
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
export type PantryPolicy = {
  id: string;
  name: string;
  mode: 'none' | 'always_have' | 'always_buy';
  trigger: 'below_target' | 'reorder_point' | 'empty';
  targetStock: number | null;
  reorderThreshold: number | null;
  preferredPurchaseQuantity: number | null;
  stockUnit: string;
  stock: number;
  state: 'healthy' | 'due' | 'review';
  needsSetup: boolean;
};
export type ShoppingPolicyBreakdown = {
  mode: 'always_have' | 'always_buy';
  trigger: 'below_target' | 'reorder_point' | 'empty';
  recipeRequirement: number;
  targetStock: number | null;
  purchaseIncrement: number | null;
  policyContribution: number | null;
  usablePantry: number;
  pendingCoverage: number;
  recordedCoverage: number;
  unroundedPurchaseGoal: number | null;
  roundedPurchaseGoal: number | null;
  finalBuyQuantity: number | null;
  unit: string;
  needsReview: boolean;
  reviewReason: string | null;
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
  policyBreakdown?: ShoppingPolicyBreakdown | null;
};
export type ShoppingList = {
  settings?: {
    keepScreenAwake: boolean;
    openPantryPurchaseOnCheck: boolean;
    completedItemsBehavior: string;
  };
  id: string;
  name: string;
  status: 'active' | 'planned' | 'completed';
  supermarket?: { id?: string; name: string; locationLabel?: string } | null;
  items: ShoppingItem[];
  isNextShop?: boolean;
  policyReviews?: {
    productId: string;
    productName: string;
    shoppingListItemId: string | null;
    state: 'active' | 'needs_review' | 'satisfied' | 'dismissed' | 'moved';
    reviewReason: string | null;
  }[];
};
export type Settings = Record<string, boolean | string | number>;

export type NutritionCache = {
  profiles: unknown[];
  household: unknown | null;
  profileDetails: Record<string, unknown>;
};
