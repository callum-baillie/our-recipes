CREATE TABLE scanner_stations (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  binding_id text NOT NULL UNIQUE,
  api_key_id text NOT NULL,
  user_id text NOT NULL,
  profile_id text NOT NULL REFERENCES profiles(id),
  active integer NOT NULL DEFAULT 1,
  state text,
  last_seen_at integer,
  created_at integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX scanner_station_key_unique ON scanner_stations(api_key_id);
--> statement-breakpoint
CREATE TABLE scanner_operations (
  id text PRIMARY KEY NOT NULL,
  station_id text NOT NULL,
  user_id text NOT NULL,
  profile_id text NOT NULL REFERENCES profiles(id),
  intent_hash text NOT NULL,
  result text NOT NULL,
  command text,
  binding_id text,
  outcome text NOT NULL DEFAULT 'succeeded',
  http_status integer NOT NULL DEFAULT 200,
  created_at integer NOT NULL,
  undone_by text
);
--> statement-breakpoint
CREATE INDEX scanner_operation_station_time ON scanner_operations(station_id, created_at);
--> statement-breakpoint
CREATE TABLE scanner_station_events (
  id text PRIMARY KEY NOT NULL,
  station_id text NOT NULL REFERENCES scanner_stations(id),
  boot_id text NOT NULL,
  sequence integer NOT NULL,
  payload text NOT NULL,
  created_at integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX scanner_event_sequence_unique ON scanner_station_events(station_id, boot_id, sequence);
--> statement-breakpoint
CREATE TABLE scanner_station_controls (
  id text PRIMARY KEY NOT NULL,
  station_id text NOT NULL REFERENCES scanner_stations(id),
  boot_id text NOT NULL,
  state_revision integer NOT NULL,
  command text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at integer NOT NULL,
  created_at integer NOT NULL
);
