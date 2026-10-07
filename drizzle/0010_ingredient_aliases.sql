CREATE TABLE `ingredient_aliases` (
	`raw_id` text PRIMARY KEY NOT NULL,
	`card_id` text,
	`reason` text,
	`updated_at` integer NOT NULL
);
