CREATE TABLE `user` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `email_verified` integer DEFAULT false NOT NULL,
  `image` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `role` text DEFAULT 'user' NOT NULL,
  `banned` integer DEFAULT false NOT NULL,
  `ban_reason` text,
  `ban_expires` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_user_email_unique` ON `user` (`email`);
--> statement-breakpoint
CREATE TABLE `session` (
  `id` text PRIMARY KEY NOT NULL,
  `expires_at` integer NOT NULL,
  `token` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `ip_address` text,
  `user_agent` text,
  `user_id` text NOT NULL,
  `impersonated_by` text,
  FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_session_token_unique` ON `session` (`token`);
--> statement-breakpoint
CREATE INDEX `auth_session_user_idx` ON `session` (`user_id`);
--> statement-breakpoint
CREATE TABLE `account` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `user_id` text NOT NULL,
  `access_token` text,
  `refresh_token` text,
  `id_token` text,
  `access_token_expires_at` integer,
  `refresh_token_expires_at` integer,
  `scope` text,
  `password` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_account_user_idx` ON `account` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_account_provider_unique` ON `account` (`provider_id`,`account_id`);
--> statement-breakpoint
CREATE TABLE `verification` (
  `id` text PRIMARY KEY NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_verification_identifier_idx` ON `verification` (`identifier`);
--> statement-breakpoint
CREATE TABLE `rate_limit` (
  `id` text PRIMARY KEY NOT NULL,
  `key` text NOT NULL,
  `count` integer NOT NULL,
  `last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_rate_limit_key_unique` ON `rate_limit` (`key`);
--> statement-breakpoint
CREATE TABLE `apikey` (
  `id` text PRIMARY KEY NOT NULL,
  `config_id` text DEFAULT 'default' NOT NULL,
  `name` text,
  `start` text,
  `reference_id` text NOT NULL,
  `prefix` text,
  `key` text NOT NULL,
  `refill_interval` integer,
  `refill_amount` integer,
  `last_refill_at` integer,
  `enabled` integer DEFAULT true NOT NULL,
  `rate_limit_enabled` integer DEFAULT true NOT NULL,
  `rate_limit_time_window` integer DEFAULT 60000 NOT NULL,
  `rate_limit_max` integer DEFAULT 120 NOT NULL,
  `request_count` integer DEFAULT 0 NOT NULL,
  `remaining` integer,
  `last_request` integer,
  `expires_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `permissions` text,
  `metadata` text
);
--> statement-breakpoint
CREATE INDEX `auth_apikey_config_idx` ON `apikey` (`config_id`);
--> statement-breakpoint
CREATE INDEX `auth_apikey_reference_idx` ON `apikey` (`reference_id`);
--> statement-breakpoint
CREATE INDEX `auth_apikey_key_idx` ON `apikey` (`key`);
--> statement-breakpoint
CREATE TABLE `passkey` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text,
  `public_key` text NOT NULL,
  `user_id` text NOT NULL,
  `credential_id` text NOT NULL,
  `counter` integer NOT NULL,
  `device_type` text NOT NULL,
  `backed_up` integer NOT NULL,
  `transports` text,
  `created_at` integer,
  `aaguid` text,
  FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_passkey_user_idx` ON `passkey` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_passkey_credential_unique` ON `passkey` (`credential_id`);
--> statement-breakpoint
CREATE TABLE `profile_auth_links` (
  `profile_id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`profile_id`) REFERENCES `profiles` (`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_auth_links_user_unique` ON `profile_auth_links` (`user_id`);
--> statement-breakpoint
CREATE TABLE `profile_security` (
  `profile_id` text PRIMARY KEY NOT NULL,
  `pin_salt` text NOT NULL,
  `pin_hash` text NOT NULL,
  `pin_version` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`profile_id`) REFERENCES `profiles` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profile_pin_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `profile_id` text NOT NULL,
  `window_started_at` integer NOT NULL,
  `failed_attempts` integer DEFAULT 0 NOT NULL,
  `locked_until` integer,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`profile_id`) REFERENCES `profiles` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_pin_attempt_session_profile_unique` ON `profile_pin_attempts` (`session_id`,`profile_id`);
--> statement-breakpoint
CREATE INDEX `profile_pin_attempt_profile_idx` ON `profile_pin_attempts` (`profile_id`);
--> statement-breakpoint
CREATE TABLE `auth_recovery_codes` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `code_hash` text NOT NULL,
  `code_prefix` text NOT NULL,
  `created_at` integer NOT NULL,
  `used_at` integer,
  `expires_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_recovery_code_user_idx` ON `auth_recovery_codes` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_recovery_code_hash_unique` ON `auth_recovery_codes` (`code_hash`);
--> statement-breakpoint
CREATE TABLE `auth_security_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text,
  `profile_id` text,
  `api_key_id` text,
  `event` text NOT NULL,
  `request_id` text,
  `details` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`profile_id`) REFERENCES `profiles` (`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `auth_security_event_user_idx` ON `auth_security_events` (`user_id`);
--> statement-breakpoint
CREATE INDEX `auth_security_event_created_idx` ON `auth_security_events` (`created_at`);
--> statement-breakpoint
CREATE TABLE `api_idempotency_records` (
  `id` text PRIMARY KEY NOT NULL,
  `key_hash` text NOT NULL,
  `method` text NOT NULL,
  `path` text NOT NULL,
  `request_hash` text NOT NULL,
  `status` integer NOT NULL,
  `response_body` text NOT NULL,
  `user_id` text,
  `api_key_id` text,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_idempotency_key_unique` ON `api_idempotency_records` (`key_hash`,`method`,`path`);
--> statement-breakpoint
CREATE INDEX `api_idempotency_expires_idx` ON `api_idempotency_records` (`expires_at`);
