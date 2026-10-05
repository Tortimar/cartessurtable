CREATE TABLE `auctions` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`start_price` integer NOT NULL,
	`current_bid` integer,
	`leader_id` text,
	`ends_at` integer NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`leader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `auction_status_idx` ON `auctions` (`status`,`ends_at`);--> statement-breakpoint
CREATE TABLE `bids` (
	`id` text PRIMARY KEY NOT NULL,
	`auction_id` text NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`auction_id`) REFERENCES `auctions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bid_auction_idx` ON `bids` (`auction_id`);--> statement-breakpoint
CREATE TABLE `booster_openings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cards` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bo_user_idx` ON `booster_openings` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `factories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`interval_sec` integer NOT NULL,
	`capacity` integer NOT NULL,
	`last_collected_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `factory_user_idx` ON `factories` (`user_id`);--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`popularity` integer DEFAULT 0 NOT NULL,
	`rarity` text DEFAULT 'COMMON' NOT NULL,
	`base_value` integer DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`buyer_id` text,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `listing_status_idx` ON `listings` (`status`,`ingredient_id`);--> statement-breakpoint
CREATE TABLE `product_ingredients` (
	`product_code` text NOT NULL,
	`ingredient_id` text NOT NULL,
	PRIMARY KEY(`product_code`, `ingredient_id`),
	FOREIGN KEY (`product_code`) REFERENCES `products`(`code`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pi_ingredient_idx` ON `product_ingredients` (`ingredient_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`image_url` text,
	`popularity` integer DEFAULT 0 NOT NULL,
	`rarity` text DEFAULT 'COMMON' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_ingredients` (
	`user_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `ingredient_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_products` (
	`user_id` text NOT NULL,
	`product_code` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `product_code`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_code`) REFERENCES `products`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`coins` integer DEFAULT 500 NOT NULL,
	`booster_stock` integer DEFAULT 10 NOT NULL,
	`last_booster_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);