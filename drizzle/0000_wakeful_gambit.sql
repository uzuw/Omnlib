CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`media_id` integer,
	`action` text NOT NULL,
	`value` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activity_user_time_idx` ON `activity_log` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_media_idx` ON `activity_log` (`media_id`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_type` text NOT NULL,
	`title` text NOT NULL,
	`native_title` text,
	`synopsis` text,
	`cover_url` text,
	`banner_url` text,
	`year` integer,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`genres` text,
	`avg_rating` real,
	`episodes_total` integer,
	`chapters_total` integer,
	`volumes_total` integer,
	`creator` text,
	`provider_source` text NOT NULL,
	`provider_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_provider_uniq` ON `media` (`provider_source`,`provider_id`);--> statement-breakpoint
CREATE INDEX `media_type_idx` ON `media` (`media_type`);--> statement-breakpoint
CREATE INDEX `media_title_idx` ON `media` (`title`);--> statement-breakpoint
CREATE TABLE `media_episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_id` integer NOT NULL,
	`number` integer NOT NULL,
	`title` text,
	`aired_at` integer,
	`synopsis` text,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_uniq` ON `media_episodes` (`media_id`,`number`);--> statement-breakpoint
CREATE TABLE `media_external_ids` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_id` integer NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ext_ids_uniq` ON `media_external_ids` (`media_id`,`provider`);--> statement-breakpoint
CREATE INDEX `ext_ids_provider_idx` ON `media_external_ids` (`provider`,`external_id`);--> statement-breakpoint
CREATE TABLE `media_relations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`target_id` integer NOT NULL,
	`relation_type` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `relations_uniq` ON `media_relations` (`source_id`,`target_id`,`relation_type`);--> statement-breakpoint
CREATE INDEX `relations_target_idx` ON `media_relations` (`target_id`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`last_run_at` integer,
	`last_success_at` integer,
	`cursor` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_state_provider_unique` ON `sync_state` (`provider`);--> statement-breakpoint
CREATE TABLE `user_media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`media_id` integer NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`progress_unit` text DEFAULT 'episode' NOT NULL,
	`total` integer,
	`rating` real,
	`started_at` integer,
	`completed_at` integer,
	`notes` text,
	`rewatch_count` integer DEFAULT 0 NOT NULL,
	`imported_from` text,
	`imported_ref` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_media_uniq` ON `user_media` (`user_id`,`media_id`);--> statement-breakpoint
CREATE INDEX `user_media_user_idx` ON `user_media` (`user_id`,`status`);