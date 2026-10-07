CREATE TABLE `chef_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`quest_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`quest_id`) REFERENCES `chef_quests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chef_delivery_once_idx` ON `chef_deliveries` (`quest_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `chef_quests` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`slot` integer NOT NULL,
	`ingredient_id` text NOT NULL,
	`reward` integer NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chef_quest_slot_idx` ON `chef_quests` (`day`,`slot`);