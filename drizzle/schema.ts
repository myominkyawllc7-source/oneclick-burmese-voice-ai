import { boolean, int, longtext, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const ttsProviders = mysqlTable("tts_providers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  kind: mysqlEnum("kind", ["gemini", "narakeet"]).notNull(),
  endpoint: varchar("endpoint", { length: 500 }).notNull(),
  model: varchar("model", { length: 160 }),
  encryptedApiKey: text("encryptedApiKey").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  primary: boolean("primary").default(false).notNull(),
  backup: boolean("backup").default(false).notNull(),
  status: mysqlEnum("status", ["not_tested", "connected", "invalid_key", "unsupported_model", "quota_exceeded", "tts_passed", "tts_failed"]).default("not_tested").notNull(),
  lastSuccessfulAt: timestamp("lastSuccessfulAt"),
  lastError: text("lastError"),
  voiceConfig: text("voiceConfig"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const providerTests = mysqlTable("provider_tests", {
  id: int("id").autoincrement().primaryKey(),
  providerId: int("providerId").notNull(),
  userId: int("userId").notNull(),
  kind: mysqlEnum("kind", ["connection", "burmese_tts", "voice_preview"]).notNull(),
  status: mysqlEnum("status", ["passed", "failed", "not_tested"]).notNull(),
  message: varchar("message", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const voiceCharacters = mysqlTable("voice_characters", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: varchar("description", { length: 500 }),
  providerId: int("providerId"),
  voiceId: varchar("voiceId", { length: 160 }).notNull(),
  style: varchar("style", { length: 500 }),
  speed: int("speed").default(100).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const generationJobs = mysqlTable("generation_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  providerId: int("providerId"),
  backupProviderId: int("backupProviderId"),
  text: text("text").notNull(),
  voiceId: varchar("voiceId", { length: 160 }).notNull(),
  style: varchar("style", { length: 500 }),
  speed: int("speed"),
  status: mysqlEnum("status", ["queued", "running", "completed", "failed", "cancelled"]).default("queued").notNull(),
  stage: varchar("stage", { length: 40 }).default("queued").notNull(),
  progress: int("progress").default(0).notNull(),
  totalChunks: int("totalChunks").default(0).notNull(),
  completedChunks: int("completedChunks").default(0).notNull(),
  error: text("error"),
  fallbackReason: text("fallbackReason"),
  audioMime: varchar("audioMime", { length: 80 }),
  audioData: longtext("audioData"),
  audioStorageKey: varchar("audioStorageKey", { length: 240 }),
  audioBytes: int("audioBytes"),
  providerUsed: varchar("providerUsed", { length: 120 }),
  modelUsed: varchar("modelUsed", { length: 160 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const generationChunks = mysqlTable("generation_chunks", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  userId: int("userId").notNull(),
  sequence: int("sequence").notNull(),
  text: text("text").notNull(),
  status: mysqlEnum("status", ["queued", "running", "completed", "failed", "cancelled"]).default("queued").notNull(),
  attempts: int("attempts").default(0).notNull(),
  audioMime: varchar("audioMime", { length: 80 }),
  audioData: longtext("audioData"),
  providerUsed: varchar("providerUsed", { length: 120 }),
  modelUsed: varchar("modelUsed", { length: 160 }),
  error: text("error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type TtsProvider = typeof ttsProviders.$inferSelect;
export type GenerationJob = typeof generationJobs.$inferSelect;
