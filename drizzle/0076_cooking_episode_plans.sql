ALTER TABLE cook_sessions ADD COLUMN cooking_restrictions text;
--> statement-breakpoint
ALTER TABLE cook_sessions ADD COLUMN context_revision integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE cooking_episode_operations (
 id text PRIMARY KEY NOT NULL,
 session_id text NOT NULL REFERENCES cook_sessions(id) ON DELETE CASCADE,
 user_id text NOT NULL,
 profile_id text NOT NULL,
 intent_hash text NOT NULL,
 created_at integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE kitchen_accepted_plans (
 id text PRIMARY KEY NOT NULL REFERENCES cooking_episode_operations(id) ON DELETE CASCADE,
 session_id text NOT NULL REFERENCES cook_sessions(id) ON DELETE CASCADE,
 user_id text NOT NULL,
 request text NOT NULL,
 allocation text NOT NULL,
 created_at integer NOT NULL
);
