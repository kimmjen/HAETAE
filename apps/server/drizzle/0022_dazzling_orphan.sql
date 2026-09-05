CREATE TABLE `global_eval` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`content` text NOT NULL,
	`score` integer NOT NULL,
	`model` text NOT NULL,
	`generated_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_eval_scope_unique` ON `global_eval` (`scope`);--> statement-breakpoint
CREATE TABLE `global_topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`content` text NOT NULL,
	`model` text NOT NULL,
	`generated_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_topics_scope_unique` ON `global_topics` (`scope`);--> statement-breakpoint
CREATE TABLE `global_wiki` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`content` text NOT NULL,
	`model` text NOT NULL,
	`projects_covered` integer DEFAULT 0 NOT NULL,
	`generated_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_wiki_scope_unique` ON `global_wiki` (`scope`);