export const RECIPE_REACTION_SCORES = {
  dislike: 1,
  like: 3,
  staple: 5,
} as const;

export type RecipeReactionScore =
  (typeof RECIPE_REACTION_SCORES)[keyof typeof RECIPE_REACTION_SCORES];
