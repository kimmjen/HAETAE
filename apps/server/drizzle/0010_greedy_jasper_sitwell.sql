ALTER TABLE `project_wiki` ADD `last_message_ts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `project_wiki` ADD `last_message_uuid` text DEFAULT '' NOT NULL;