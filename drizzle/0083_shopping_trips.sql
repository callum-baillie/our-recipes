CREATE TABLE shopping_trips (
 id text PRIMARY KEY NOT NULL,
 owner_user_id text NOT NULL,
 profile_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 occurred_on text NOT NULL,
 size text NOT NULL CHECK(size IN ('top_up', 'large')),
 note text NOT NULL,
 created_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX shopping_trip_scope_idx ON shopping_trips(owner_user_id, profile_id, occurred_on);
