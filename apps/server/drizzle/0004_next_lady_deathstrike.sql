CREATE TABLE `usage_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`message_id` text NOT NULL,
	`project_path` text NOT NULL,
	`model` text NOT NULL,
	`ts` integer NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_creation_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd_micro` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_events_session_message_uniq` ON `usage_events` (`session_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `usage_events_ts_idx` ON `usage_events` (`ts`);--> statement-breakpoint
CREATE INDEX `usage_events_project_idx` ON `usage_events` (`project_path`);--> statement-breakpoint
CREATE INDEX `usage_events_model_idx` ON `usage_events` (`model`);--> statement-breakpoint
CREATE TABLE `usage_file_cursor` (
	`file_path` text PRIMARY KEY NOT NULL,
	`last_offset` integer DEFAULT 0 NOT NULL,
	`last_mtime` integer DEFAULT 0 NOT NULL
);
