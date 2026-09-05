CREATE TABLE `external_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_path` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `external_sources_project_idx` ON `external_sources` (`project_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_sources_project_url_uniq` ON `external_sources` (`project_path`,`url`);