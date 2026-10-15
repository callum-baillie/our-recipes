ALTER TABLE nutrition_profiles ADD COLUMN advanced_body_metrics TEXT NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE nutrition_profiles ADD COLUMN weight_goal_pace TEXT;
--> statement-breakpoint
ALTER TABLE nutrition_body_measurements ADD COLUMN advanced_body_metrics TEXT NOT NULL DEFAULT '{}';
--> statement-breakpoint
CREATE TABLE nutrition_scale_connections (
  id TEXT PRIMARY KEY NOT NULL,
  nutrition_profile_id TEXT REFERENCES nutrition_profiles(id),
  binding_hash TEXT NOT NULL,
  encrypted_session TEXT NOT NULL,
  device_config TEXT NOT NULL DEFAULT '',
  selected_user TEXT,
  pending_expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
