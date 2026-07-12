CREATE TABLE `project_roots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`absolute_path` text NOT NULL,
	`added_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_roots_absolute_path_unique` ON `project_roots` (`absolute_path`);