CREATE TABLE `trade_items` (
	`id` text PRIMARY KEY NOT NULL,
	`trade_id` text NOT NULL,
	`side` text NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text NOT NULL,
	`quantity` integer NOT NULL,
	FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trade_items_trade_idx` ON `trade_items` (`trade_id`);--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`offer_coins` integer DEFAULT 0 NOT NULL,
	`request_coins` integer DEFAULT 0 NOT NULL,
	`message` text,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trade_to_idx` ON `trades` (`to_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `trade_from_idx` ON `trades` (`from_user_id`,`status`);