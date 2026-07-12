CREATE TABLE `notebooklm_content` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`notebook_id` text NOT NULL,
	`content_type` text NOT NULL,
	`ref` text,
	`generated_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notebooklm_content_notebook_idx` ON `notebooklm_content` (`notebook_id`);--> statement-breakpoint
CREATE TABLE `notebooklm_notebooks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`notebook_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`owner` text,
	`notebook_created_at` text,
	`mirrored_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notebooklm_notebooks_notebook_id_unique` ON `notebooklm_notebooks` (`notebook_id`);--> statement-breakpoint
CREATE INDEX `notebooklm_notebooks_notebook_idx` ON `notebooklm_notebooks` (`notebook_id`);--> statement-breakpoint
CREATE TABLE `notebooklm_qa` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`notebook_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`asked_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notebooklm_qa_notebook_idx` ON `notebooklm_qa` (`notebook_id`);--> statement-breakpoint
CREATE TABLE `notebooklm_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`notebook_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_type` text,
	`title` text DEFAULT '' NOT NULL,
	`status` text,
	`mirrored_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notebooklm_sources_unique_idx` ON `notebooklm_sources` (`notebook_id`,`source_id`);--> statement-breakpoint
CREATE INDEX `notebooklm_sources_notebook_idx` ON `notebooklm_sources` (`notebook_id`);