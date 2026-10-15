CREATE TABLE integration_accounts (
 id TEXT PRIMARY KEY NOT NULL,
 owner_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 provider TEXT NOT NULL DEFAULT 'vesync',
 label TEXT NOT NULL,
 encrypted_session TEXT NOT NULL,
 sync_interval_minutes INTEGER NOT NULL DEFAULT 0,
 next_sync_at INTEGER,
 last_attempt_at INTEGER,
 last_success_at INTEGER,
 last_error TEXT,
 lease_token TEXT,
 lease_until INTEGER,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX integration_accounts_owner_idx ON integration_accounts(owner_user_id);
--> statement-breakpoint
CREATE INDEX integration_accounts_due_idx ON integration_accounts(next_sync_at);
--> statement-breakpoint
ALTER TABLE nutrition_scale_connections ADD COLUMN account_id TEXT REFERENCES integration_accounts(id) ON DELETE CASCADE;
