CREATE TABLE `project_eval` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_path` text NOT NULL,
	`content` text NOT NULL,
	`score` integer NOT NULL,
	`model` text NOT NULL,
	`generated_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_eval_project_path_unique` ON `project_eval` (`project_path`);--> statement-breakpoint
CREATE INDEX `project_eval_project_idx` ON `project_eval` (`project_path`);