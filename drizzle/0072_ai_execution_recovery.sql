ALTER TABLE ai_chat_turns ADD COLUMN lease_token text;
--> statement-breakpoint
ALTER TABLE ai_chat_turns ADD COLUMN lease_expires_at integer;
--> statement-breakpoint
ALTER TABLE ai_chat_turns ADD COLUMN deadline_at integer;
--> statement-breakpoint
ALTER TABLE ai_chat_turns ADD COLUMN recovery_json text;
--> statement-breakpoint
ALTER TABLE ai_action_preview_images ADD COLUMN source_digest text;
--> statement-breakpoint
ALTER TABLE ai_action_preview_images ADD COLUMN owner_user_id text;
--> statement-breakpoint
CREATE TABLE ai_execution_traces (
  id text PRIMARY KEY NOT NULL,
  parent_trace_id text,
  parent_job_id text,
  turn_id text,
  profile_id text NOT NULL,
  owner_user_id text,
  workload text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  options_json text NOT NULL,
  status text NOT NULL,
  created_at integer NOT NULL,
  completed_at integer
);

--> statement-breakpoint
ALTER TABLE ai_action_proposals ADD COLUMN turn_id text;
--> statement-breakpoint
ALTER TABLE ai_jobs ADD COLUMN turn_id text;
--> statement-breakpoint
ALTER TABLE ai_decision_records ADD COLUMN turn_id text;
