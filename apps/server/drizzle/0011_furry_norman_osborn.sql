CREATE TABLE `project_wiki_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_path` text NOT NULL,
	`content` text NOT NULL,
	`summary` text,
	`model` text NOT NULL,
	`messages_covered` integer NOT NULL,
	`last_message_ts` integer NOT NULL,
	`last_message_uuid` text NOT NULL,
	`generated_at` integer NOT NULL,
	`archived_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `project_wiki_history_project_idx` ON `project_wiki_history` (`project_path`,`archived_at`);