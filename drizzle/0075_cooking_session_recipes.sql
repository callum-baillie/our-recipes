ALTER TABLE cook_sessions ADD COLUMN owner_user_id text;
--> statement-breakpoint
ALTER TABLE cook_sessions ADD COLUMN effective_recipe text;
--> statement-breakpoint
ALTER TABLE cook_sessions ADD COLUMN effective_revision integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE cooking_session_changes (
 id text PRIMARY KEY NOT NULL,
 session_id text NOT NULL REFERENCES cook_sessions(id) ON DELETE CASCADE,
 user_id text NOT NULL,
 intent_hash text NOT NULL,
 revision integer NOT NULL,
 before text NOT NULL,
 after text NOT NULL,
 created_at integer NOT NULL
);
