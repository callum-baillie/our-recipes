CREATE TABLE kitchen_physical_uses (
 id text PRIMARY KEY NOT NULL,
 kitchen_id text NOT NULL REFERENCES kitchens(id) ON DELETE RESTRICT,
 episode_id text NOT NULL,
 phase_id text NOT NULL,
 user_id text NOT NULL,
 started_at integer NOT NULL,
 allocation text,
 intent_key text UNIQUE,
 released_at integer,
 release_actor_id text
);
--> statement-breakpoint
INSERT INTO kitchen_physical_uses(id,kitchen_id,episode_id,phase_id,user_id,started_at,allocation)
 SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))), kitchen_id,episode_id,phase_id,user_id,min(started_at),max(allocation)
 FROM kitchen_resource_claims GROUP BY kitchen_id,episode_id,phase_id,user_id;
--> statement-breakpoint
ALTER TABLE kitchen_resource_claims ADD COLUMN use_id text REFERENCES kitchen_physical_uses(id) ON DELETE RESTRICT;
--> statement-breakpoint
UPDATE kitchen_resource_claims SET use_id = (SELECT id FROM kitchen_physical_uses WHERE kitchen_physical_uses.kitchen_id=kitchen_resource_claims.kitchen_id AND kitchen_physical_uses.episode_id=kitchen_resource_claims.episode_id AND kitchen_physical_uses.phase_id=kitchen_resource_claims.phase_id AND kitchen_physical_uses.user_id=kitchen_resource_claims.user_id);
