CREATE TABLE `file_backups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_path` text NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `file_backups_path_idx` ON `file_backups` (`file_path`);--> statement-breakpoint
CREATE INDEX `file_backups_path_created_idx` ON `file_backups` (`file_path`,`created_at`);