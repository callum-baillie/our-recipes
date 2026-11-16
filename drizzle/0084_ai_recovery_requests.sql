CREATE TABLE ai_recovery_requests (
 id text PRIMARY KEY NOT NULL,
 thread_id text NOT NULL REFERENCES ai_chat_threads(id) ON DELETE CASCADE,
 requester_user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 actor_profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 payload text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined','used')),
 approved_mode text CHECK(approved_mode IN ('once','permanent')),
 approved_by_user_id text REFERENCES user(id) ON DELETE CASCADE,
 baseline_version integer,
 turn_id text,
 created_at integer NOT NULL,
 expires_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX ai_recovery_request_scope ON ai_recovery_requests(requester_user_id, thread_id, status);
