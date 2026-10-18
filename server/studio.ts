import crypto from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { generationChunks, generationJobs, providerTests, ttsProviders, voiceCharacters } from "../drizzle/schema";
import { getDb } from "./db";

// Use the platform-managed server secret. A custom project secret is optional and never required for UI startup.
const MASTER_SECRET = process.env.BURVOICE_ENCRYPTION_KEY || process.env.MANUS_JWT_SECRET;
const key = () => {
  if (!MASTER_SECRET) throw new Error("Platform-managed server secret is not available");
  return crypto.createHash("sha256").update(MASTER_SECRET).digest();
};

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string) {
  const [ivRaw, tagRaw, dataRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error("Encrypted value is malformed");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, "base64url")), decipher.final()]).toString("utf8");
}

export const maskSecret = (value: string) => value.length < 8 ? "••••••••" : `${"•".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;

export async function listProviders(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  const rows = await db.select({ id: ttsProviders.id, name: ttsProviders.name, kind: ttsProviders.kind, endpoint: ttsProviders.endpoint, model: ttsProviders.model, enabled: ttsProviders.enabled, primary: ttsProviders.primary, backup: ttsProviders.backup, status: ttsProviders.status, lastSuccessfulAt: ttsProviders.lastSuccessfulAt, lastError: ttsProviders.lastError, encryptedApiKey: ttsProviders.encryptedApiKey }).from(ttsProviders).where(eq(ttsProviders.userId, userId)).orderBy(desc(ttsProviders.updatedAt));
  return rows.map(({ encryptedApiKey, ...provider }) => ({ ...provider, hasApiKey: Boolean(encryptedApiKey) }));
}

export async function getProvider(userId: number, id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(ttsProviders).where(and(eq(ttsProviders.id, id), eq(ttsProviders.userId, userId))).limit(1);
  return rows[0];
}

export async function recordTest(userId: number, providerId: number, kind: "connection" | "burmese_tts" | "voice_preview", status: "passed" | "failed" | "not_tested", message: string) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  await db.insert(providerTests).values({ userId, providerId, kind, status, message: message.slice(0, 500) });
}

export async function updateProviderStatus(userId: number, id: number, status: typeof ttsProviders.$inferInsert.status, error?: string, successful = false) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  await db.update(ttsProviders).set({ status, lastError: error?.slice(0, 1000) ?? null, lastSuccessfulAt: successful ? new Date() : undefined }).where(and(eq(ttsProviders.id, id), eq(ttsProviders.userId, userId)));
}

export async function createJob(userId: number, input: { providerId: number | null; backupProviderId: number | null; text: string; voiceId: string; style?: string; speed?: number; chunks: string[] }) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  const [job] = await db.insert(generationJobs).values({ userId, providerId: input.providerId, backupProviderId: input.backupProviderId, text: input.text, voiceId: input.voiceId, style: input.style ?? null, speed: input.speed ?? null, totalChunks: input.chunks.length }).$returningId();
  await db.insert(generationChunks).values(input.chunks.map((text, sequence) => ({ jobId: job.id, userId, sequence, text })));
  return job.id;
}

export async function getJob(userId: number, id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  const [job] = await db.select().from(generationJobs).where(and(eq(generationJobs.id, id), eq(generationJobs.userId, userId))).limit(1);
  return job;
}

export async function getChunks(userId: number, jobId: number) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  return db.select().from(generationChunks).where(and(eq(generationChunks.jobId, jobId), eq(generationChunks.userId, userId))).orderBy(asc(generationChunks.sequence));
}

export async function listJobs(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  return db.select({ id: generationJobs.id, text: generationJobs.text, voiceId: generationJobs.voiceId, status: generationJobs.status, stage: generationJobs.stage, progress: generationJobs.progress, providerUsed: generationJobs.providerUsed, modelUsed: generationJobs.modelUsed, audioMime: generationJobs.audioMime, createdAt: generationJobs.createdAt, error: generationJobs.error }).from(generationJobs).where(eq(generationJobs.userId, userId)).orderBy(desc(generationJobs.createdAt)).limit(50);
}

export async function updateJob(userId: number, id: number, values: Partial<typeof generationJobs.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  await db.update(generationJobs).set(values).where(and(eq(generationJobs.id, id), eq(generationJobs.userId, userId)));
}

export async function updateChunk(userId: number, id: number, values: Partial<typeof generationChunks.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  await db.update(generationChunks).set(values).where(and(eq(generationChunks.id, id), eq(generationChunks.userId, userId)));
}

export async function listCharacters(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  return db.select().from(voiceCharacters).where(eq(voiceCharacters.userId, userId)).orderBy(desc(voiceCharacters.updatedAt));
}

export async function createCharacter(userId: number, values: Omit<typeof voiceCharacters.$inferInsert, "userId">) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  const [row] = await db.insert(voiceCharacters).values({ ...values, userId }).$returningId();
  return row.id;
}

export async function deleteCharacter(userId: number, id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is not available");
  await db.delete(voiceCharacters).where(and(eq(voiceCharacters.id, id), eq(voiceCharacters.userId, userId)));
}
