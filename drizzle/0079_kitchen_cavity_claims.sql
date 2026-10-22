ALTER TABLE kitchen_resource_claims RENAME TO kitchen_resource_claims_legacy;
--> statement-breakpoint
CREATE TABLE kitchen_resource_claims (
 resource_id text NOT NULL,
 kitchen_id text NOT NULL REFERENCES kitchens(id) ON DELETE RESTRICT,
 episode_id text NOT NULL,
 phase_id text NOT NULL,
 user_id text NOT NULL,
 started_at integer NOT NULL,
 allocation text,
 PRIMARY KEY(resource_id, episode_id, phase_id)
);
--> statement-breakpoint
INSERT INTO kitchen_resource_claims(resource_id,kitchen_id,episode_id,phase_id,user_id,started_at)
 SELECT resource_id,kitchen_id,episode_id,phase_id,user_id,started_at FROM kitchen_resource_claims_legacy;
--> statement-breakpoint
DROP TABLE kitchen_resource_claims_legacy;
