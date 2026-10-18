CREATE TABLE `generation_chunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`userId` int NOT NULL,
	`sequence` int NOT NULL,
	`text` text NOT NULL,
	`status` enum('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`audioMime` varchar(80),
	`audioData` longtext,
	`providerUsed` varchar(120),
	`modelUsed` varchar(160),
	`error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generation_chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`providerId` int,
	`backupProviderId` int,
	`text` text NOT NULL,
	`voiceId` varchar(160) NOT NULL,
	`style` varchar(500),
	`speed` int,
	`status` enum('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
	`progress` int NOT NULL DEFAULT 0,
	`totalChunks` int NOT NULL DEFAULT 0,
	`completedChunks` int NOT NULL DEFAULT 0,
	`error` text,
	`fallbackReason` text,
	`audioMime` varchar(80),
	`audioData` longtext,
	`providerUsed` varchar(120),
	`modelUsed` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generation_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `provider_tests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`providerId` int NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('connection','burmese_tts','voice_preview') NOT NULL,
	`status` enum('passed','failed','not_tested') NOT NULL,
	`message` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `provider_tests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tts_providers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`kind` enum('gemini','narakeet') NOT NULL,
	`endpoint` varchar(500) NOT NULL,
	`model` varchar(160),
	`encryptedApiKey` text NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`primary` boolean NOT NULL DEFAULT false,
	`backup` boolean NOT NULL DEFAULT false,
	`status` enum('not_tested','connected','invalid_key','unsupported_model','quota_exceeded','tts_passed','tts_failed') NOT NULL DEFAULT 'not_tested',
	`lastSuccessfulAt` timestamp,
	`lastError` text,
	`voiceConfig` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tts_providers_id` PRIMARY KEY(`id`)
);
