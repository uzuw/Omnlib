CREATE TABLE `collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_source` text NOT NULL,
	`provider_id` text NOT NULL,
	`title` text NOT NULL,
	`cover_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_provider_uniq` ON `collections` (`provider_source`,`provider_id`);--> statement-breakpoint
CREATE TABLE `media_collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_collections_uniq` ON `media_collections` (`collection_id`,`media_id`);--> statement-breakpoint
ALTER TABLE `media` ADD `runtime_minutes` integer;