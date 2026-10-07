CREATE TABLE `bank_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`hour` integer NOT NULL,
	`slot` integer NOT NULL,
	`product_code` text NOT NULL,
	`discount` integer NOT NULL,
	`price` integer NOT NULL,
	FOREIGN KEY (`product_code`) REFERENCES `products`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_offer_slot_idx` ON `bank_offers` (`hour`,`slot`);--> statement-breakpoint
CREATE TABLE `bank_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`offer_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`offer_id`) REFERENCES `bank_offers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_purchase_once_idx` ON `bank_purchases` (`offer_id`,`user_id`);