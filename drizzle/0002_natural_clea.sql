CREATE TABLE `voice_characters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(500),
	`providerId` int,
	`voiceId` varchar(160) NOT NULL,
	`style` varchar(500),
	`speed` int NOT NULL DEFAULT 100,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `voice_characters_id` PRIMARY KEY(`id`)
);
