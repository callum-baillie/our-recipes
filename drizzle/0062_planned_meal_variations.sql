ALTER TABLE meal_plan_entries ADD COLUMN kind text NOT NULL DEFAULT 'custom';
--> statement-breakpoint
ALTER TABLE meal_plan_entries ADD COLUMN recipe_override text;
--> statement-breakpoint
UPDATE meal_plan_entries SET kind = 'recipe' WHERE recipe_id IS NOT NULL;
--> statement-breakpoint
UPDATE meal_plan_entries SET kind = 'leftover' WHERE id IN (SELECT destination_entry_id FROM meal_plan_leftover_links);
--> statement-breakpoint
ALTER TABLE ai_chat_messages ADD COLUMN attachments_json text NOT NULL DEFAULT '[]';
