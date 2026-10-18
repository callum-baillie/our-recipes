CREATE TABLE ai_runtime_settings (
  id text PRIMARY KEY NOT NULL,
  settings text NOT NULL,
  version integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE ai_user_settings (
  user_id text PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  enabled integer DEFAULT 1 NOT NULL,
  preferences text DEFAULT '{}' NOT NULL,
  version integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
-- Preserve explicit processing preferences from the previous automation settings.
INSERT INTO ai_user_settings (user_id, enabled, preferences, version)
SELECT t.user_id, CASE WHEN u.role = 'child' THEN 0 ELSE 1 END,
 json_object('processing', json_object('executionMode', COALESCE(json_extract(t.settings, '$.executionMode'), 'auto'), 'batchMinItems', COALESCE(json_extract(t.settings, '$.batchMinItems'), 4)), 'workloads', json('[]')), 1
FROM task_preferences t JOIN user u ON u.id = t.user_id;
--> statement-breakpoint
-- Persist the real account owner for durable jobs created before account AI controls.
UPDATE ai_jobs SET payload = json_set(payload, '$.ownerUserId',
 (SELECT user_id FROM profile_auth_links WHERE profile_id = ai_jobs.profile_id))
WHERE kind IN ('recipe_images', 'recipe_batch_generation') AND json_valid(payload);
