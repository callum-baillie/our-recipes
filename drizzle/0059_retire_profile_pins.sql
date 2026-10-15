UPDATE profile_security SET pin_salt = '', pin_hash = '', pin_version = 0;
--> statement-breakpoint
DELETE FROM profile_pin_attempts;
