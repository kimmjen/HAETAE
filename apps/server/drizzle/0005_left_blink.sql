CREATE TABLE `usage_api_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bucket_start` integer NOT NULL,
	`bucket_width` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`workspace_id` text DEFAULT '' NOT NULL,
	`api_key_id` text DEFAULT '' NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_creation_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd_micro` integer DEFAULT 0 NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_api_events_bucket_uniq` ON `usage_api_events` (`bucket_start`,`bucket_width`,`model`,`workspace_id`,`api_key_id`);--> statement-breakpoint
CREATE INDEX `usage_api_events_bucket_idx` ON `usage_api_events` (`bucket_start`);--> statement-breakpoint
CREATE INDEX `usage_api_events_model_idx` ON `usage_api_events` (`model`);