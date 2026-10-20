export const summaryInputCategories = {
  nutrition: ['shareNutritionGoals', 'shareNutritionAggregates', 'shareRawDiary', 'shareWeight'],
  meal_plans: ['shareMealPlans'],
  shopping_lists: ['shareShoppingLists'],
  recipes: ['shareSharedRecipes'],
} as const;
export type SummaryDomain = keyof typeof summaryInputCategories;
export type SummaryAvailability = {
  domain: SummaryDomain;
  status:
    | 'disabled_workload'
    | 'disabled_output'
    | 'missing_permission'
    | 'no_eligible_evidence'
    | 'ready';
};
/** Availability explains missing permissions without inspecting unshared records. */
export function summaryAvailability(input: {
  enabled: boolean;
  outputs: Record<SummaryDomain, boolean>;
  permitted: Record<SummaryDomain, boolean>;
  evidence: Record<SummaryDomain, boolean>;
}): SummaryAvailability[] {
  return (Object.keys(summaryInputCategories) as SummaryDomain[]).map((domain) => ({
    domain,
    status: !input.outputs[domain]
      ? 'disabled_output'
      : !input.enabled
        ? 'disabled_workload'
        : !input.permitted[domain]
          ? 'missing_permission'
          : input.evidence[domain]
            ? 'ready'
            : 'no_eligible_evidence',
  }));
}
