ALTER TABLE nutrition_profiles ADD COLUMN body_composition_estimate TEXT;
--> statement-breakpoint
ALTER TABLE nutrition_body_measurements ADD COLUMN body_composition_estimate TEXT;
