CREATE TABLE `buy_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`requester_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`filled` integer DEFAULT 0 NOT NULL,
	`unit_price` integer NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `buy_request_status_idx` ON `buy_requests` (`status`,`ingredient_id`);--> statement-breakpoint
CREATE INDEX `buy_request_user_idx` ON `buy_requests` (`requester_id`,`status`);