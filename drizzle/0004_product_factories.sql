CREATE TABLE `product_factories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_code` text NOT NULL,
	`interval_sec` integer NOT NULL,
	`points` integer NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`last_collected_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_code`) REFERENCES `products`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pfactory_user_idx` ON `product_factories` (`user_id`);