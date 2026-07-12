CREATE TABLE `project_eval_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_path` text NOT NULL,
	`score` integer NOT NULL,
	`model` text NOT NULL,
	`generated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `project_eval_history_project_idx` ON `project_eval_history` (`project_path`,`generated_at`);