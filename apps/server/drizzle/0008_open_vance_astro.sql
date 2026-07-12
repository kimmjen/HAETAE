CREATE TABLE `project_wiki` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_path` text NOT NULL,
	`content` text NOT NULL,
	`messages_covered` integer DEFAULT 0 NOT NULL,
	`generated_at` integer NOT NULL,
	`summary` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_wiki_project_path_unique` ON `project_wiki` (`project_path`);--> statement-breakpoint
CREATE INDEX `project_wiki_project_idx` ON `project_wiki` (`project_path`);--> statement-breakpoint
CREATE INDEX `project_wiki_generated_at_idx` ON `project_wiki` (`generated_at`);