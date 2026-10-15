ALTER TABLE ai_profile_settings ADD COLUMN share_pantry integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE ai_workload_settings
SET model = 'gpt-6-luna',
    reasoning_effort = CASE WHEN workload IN ('recipe_review', 'nutrition_estimation', 'nutrition_summary') THEN 'low' ELSE 'medium' END,
    version = version + 1,
    updated_at = unixepoch()
WHERE version = 1 AND created_at = updated_at AND (
  (workload IN ('chat', 'meal_plan_generation') AND model = 'gpt-5.6-terra' AND reasoning_effort = 'medium') OR
  (workload IN ('recipe_review', 'nutrition_estimation') AND model = 'gpt-5.4-mini' AND reasoning_effort IS NULL) OR
  (workload = 'recipe_generation' AND model = 'gpt-5.6-luna' AND reasoning_effort = 'medium') OR
  (workload = 'nutrition_summary' AND model = 'gpt-5.6-luna' AND reasoning_effort = 'low')
);
