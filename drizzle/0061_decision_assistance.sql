CREATE TABLE ai_decision_records (
  id text PRIMARY KEY NOT NULL,
  owner_user_id text NOT NULL,
  profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task text NOT NULL,
  subject_key text NOT NULL,
  context_hash text NOT NULL,
  evidence_json text NOT NULL,
  result_json text NOT NULL,
  correction_json text,
  version integer NOT NULL DEFAULT 1,
  created_at integer NOT NULL,
  expires_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX ai_decision_scope_idx ON ai_decision_records(owner_user_id, profile_id, task, subject_key, created_at);
--> statement-breakpoint
CREATE INDEX ai_decision_cache_idx ON ai_decision_records(owner_user_id, profile_id, context_hash, expires_at);
--> statement-breakpoint
CREATE TABLE ai_decision_feedback (
  id text PRIMARY KEY NOT NULL,
  decision_id text NOT NULL REFERENCES ai_decision_records(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL,
  action text NOT NULL,
  value_json text NOT NULL,
  created_at integer NOT NULL
);
