DROP INDEX `file_backups_path_idx`;--> statement-breakpoint
DROP INDEX `file_backups_path_created_idx`;--> statement-breakpoint
ALTER TABLE `file_backups` ADD `scope` text DEFAULT 'global' NOT NULL;--> statement-breakpoint
CREATE INDEX `file_backups_scope_path_idx` ON `file_backups` (`scope`,`file_path`);--> statement-breakpoint
CREATE INDEX `file_backups_scope_path_created_idx` ON `file_backups` (`scope`,`file_path`,`created_at`);