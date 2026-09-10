CREATE TABLE `media_relation_staging` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_source` text NOT NULL,
	`source_provider_id` text NOT NULL,
	`target_provider_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`target_title` text,
	`target_type` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staging_uniq` ON `media_relation_staging` (`provider_source`,`source_provider_id`,`target_provider_id`,`relation_type`);