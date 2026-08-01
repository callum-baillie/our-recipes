UPDATE `user`
SET `role` = 'parent', `updated_at` = unixepoch() * 1000
WHERE `role` = 'user';
--> statement-breakpoint
UPDATE `nutrition_profiles`
SET `profile_type` = 'adult', `version` = `version` + 1, `updated_at` = unixepoch() * 1000
WHERE `profile_type` = 'guest';
--> statement-breakpoint
CREATE TRIGGER `auth_last_admin_role_guard`
BEFORE UPDATE OF `role` ON `user`
WHEN OLD.`role` = 'admin'
  AND NEW.`role` <> 'admin'
  AND (
    SELECT count(*)
    FROM `user` AS `u`
    INNER JOIN `profile_auth_links` AS `l` ON `l`.`user_id` = `u`.`id`
    INNER JOIN `profiles` AS `p` ON `p`.`id` = `l`.`profile_id`
    WHERE `u`.`role` = 'admin' AND `u`.`banned` = 0 AND `p`.`archived_at` IS NULL
  ) <= 1
BEGIN
  SELECT RAISE(ABORT, 'last_admin_required');
END;
--> statement-breakpoint
CREATE TRIGGER `auth_last_admin_ban_guard`
BEFORE UPDATE OF `banned` ON `user`
WHEN OLD.`role` = 'admin'
  AND OLD.`banned` = 0
  AND NEW.`banned` = 1
  AND (
    SELECT count(*)
    FROM `user` AS `u`
    INNER JOIN `profile_auth_links` AS `l` ON `l`.`user_id` = `u`.`id`
    INNER JOIN `profiles` AS `p` ON `p`.`id` = `l`.`profile_id`
    WHERE `u`.`role` = 'admin' AND `u`.`banned` = 0 AND `p`.`archived_at` IS NULL
  ) <= 1
BEGIN
  SELECT RAISE(ABORT, 'last_admin_required');
END;
--> statement-breakpoint
CREATE TRIGGER `auth_last_admin_delete_guard`
BEFORE DELETE ON `user`
WHEN OLD.`role` = 'admin'
  AND OLD.`banned` = 0
  AND (
    SELECT count(*)
    FROM `user` AS `u`
    INNER JOIN `profile_auth_links` AS `l` ON `l`.`user_id` = `u`.`id`
    INNER JOIN `profiles` AS `p` ON `p`.`id` = `l`.`profile_id`
    WHERE `u`.`role` = 'admin' AND `u`.`banned` = 0 AND `p`.`archived_at` IS NULL
  ) <= 1
BEGIN
  SELECT RAISE(ABORT, 'last_admin_required');
END;
--> statement-breakpoint
CREATE TRIGGER `auth_last_admin_profile_archive_guard`
BEFORE UPDATE OF `archived_at` ON `profiles`
WHEN OLD.`archived_at` IS NULL
  AND NEW.`archived_at` IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM `profile_auth_links` AS `l`
    INNER JOIN `user` AS `u` ON `u`.`id` = `l`.`user_id`
    WHERE `l`.`profile_id` = OLD.`id` AND `u`.`role` = 'admin' AND `u`.`banned` = 0
  )
  AND (
    SELECT count(*)
    FROM `user` AS `u`
    INNER JOIN `profile_auth_links` AS `l` ON `l`.`user_id` = `u`.`id`
    INNER JOIN `profiles` AS `p` ON `p`.`id` = `l`.`profile_id`
    WHERE `u`.`role` = 'admin' AND `u`.`banned` = 0 AND `p`.`archived_at` IS NULL
  ) <= 1
BEGIN
  SELECT RAISE(ABORT, 'last_admin_required');
END;
--> statement-breakpoint
CREATE TRIGGER `auth_last_admin_profile_delete_guard`
BEFORE DELETE ON `profiles`
WHEN EXISTS (
    SELECT 1
    FROM `profile_auth_links` AS `l`
    INNER JOIN `user` AS `u` ON `u`.`id` = `l`.`user_id`
    WHERE `l`.`profile_id` = OLD.`id` AND `u`.`role` = 'admin' AND `u`.`banned` = 0
  )
  AND (
    SELECT count(*)
    FROM `user` AS `u`
    INNER JOIN `profile_auth_links` AS `l` ON `l`.`user_id` = `u`.`id`
    INNER JOIN `profiles` AS `p` ON `p`.`id` = `l`.`profile_id`
    WHERE `u`.`role` = 'admin' AND `u`.`banned` = 0 AND `p`.`archived_at` IS NULL
  ) <= 1
BEGIN
  SELECT RAISE(ABORT, 'last_admin_required');
END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_guest_insert_guard`
BEFORE INSERT ON `nutrition_profiles`
WHEN NEW.`profile_type` = 'guest'
BEGIN
  SELECT RAISE(ABORT, 'guest_profile_type_removed');
END;
--> statement-breakpoint
CREATE TRIGGER `nutrition_guest_update_guard`
BEFORE UPDATE OF `profile_type` ON `nutrition_profiles`
WHEN NEW.`profile_type` = 'guest'
BEGIN
  SELECT RAISE(ABORT, 'guest_profile_type_removed');
END;
