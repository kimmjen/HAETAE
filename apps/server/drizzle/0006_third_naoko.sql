CREATE TABLE `session_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`parent_uuid` text,
	`session_id` text NOT NULL,
	`project_path` text NOT NULL,
	`type` text NOT NULL,
	`subtype` text,
	`content` text,
	`ts` integer NOT NULL,
	`is_compact_summary` integer DEFAULT false NOT NULL,
	`compact_trigger` text,
	`compact_pre_tokens` integer,
	`compact_post_tokens` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_messages_uuid_uniq` ON `session_messages` (`uuid`);--> statement-breakpoint
CREATE INDEX `session_messages_session_idx` ON `session_messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `session_messages_project_ts_idx` ON `session_messages` (`project_path`,`ts`);--> statement-breakpoint
CREATE INDEX `session_messages_compact_summary_idx` ON `session_messages` (`is_compact_summary`);