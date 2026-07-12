CREATE TABLE `memories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`summary_uuid` text,
	`session_id` text NOT NULL,
	`project_path` text NOT NULL,
	`content` text NOT NULL,
	`source` text DEFAULT 'compact_summary' NOT NULL,
	`compact_trigger` text,
	`compact_pre_tokens` integer,
	`compact_post_tokens` integer,
	`ts` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memories_summary_uuid_unique` ON `memories` (`summary_uuid`);--> statement-breakpoint
CREATE INDEX `memories_project_ts_idx` ON `memories` (`project_path`,`ts`);--> statement-breakpoint
CREATE INDEX `memories_session_idx` ON `memories` (`session_id`);