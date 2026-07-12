CREATE TABLE `project_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_path` text NOT NULL,
	`content` text NOT NULL,
	`model` text NOT NULL,
	`generated_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_notes_project_path_unique` ON `project_notes` (`project_path`);--> statement-breakpoint
CREATE INDEX `project_notes_project_idx` ON `project_notes` (`project_path`);