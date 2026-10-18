import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { generationChunks, generationJobs, providerTests, ttsProviders } from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { BURMESE_SAMPLE, listVoices, synthesize } from "./providers";
import { createCharacter, createJob, deleteCharacter, encryptSecret, getChunks, getJob, getProvider, listCharacters, listJobs, listProviders, maskSecret, recordTest, updateJob, updateProviderStatus } from "./studio";
import { enqueueJob, splitScript } from "./jobs";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { storageGetSignedUrl } from "./storage";

const requireProvider = async (userId: number, id: number) => {
  const provider = await getProvider(userId, id);
  if (!provider) throw new TRPCError({ code: "NOT_FOUND", message: "Provider not found" });
  return provider;
};
const sanitize = (error: unknown) => error instanceof Error ? error.message.slice(0, 180) : "Provider request failed";

export const appRouter = router({
  system: router({ health: publicProcedure.query(() => ({ ok: true })) }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 }); return { success: true } as const; }),
  }),
  providers: router({
    list: protectedProcedure.query(({ ctx }) => listProviders(ctx.user.id)),
    tests: protectedProcedure.input(z.object({ providerId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      await requireProvider(ctx.user.id, input.providerId);
      return db.select({ id: providerTests.id, kind: providerTests.kind, status: providerTests.status, message: providerTests.message, createdAt: providerTests.createdAt }).from(providerTests).where(and(eq(providerTests.userId, ctx.user.id), eq(providerTests.providerId, input.providerId))).orderBy(providerTests.createdAt);
    }),
    create: protectedProcedure.input(z.object({ name: z.string().min(1).max(120), kind: z.enum(["gemini", "narakeet"]), apiKey: z.string().min(8), model: z.string().max(160).optional(), endpoint: z.string().url() })).mutation(async ({ ctx, input }) => {
      const url = new URL(input.endpoint); if (url.protocol !== "https:") throw new TRPCError({ code: "BAD_REQUEST", message: "Provider endpoint must use HTTPS" });
      if (input.kind === "gemini" && url.hostname !== "generativelanguage.googleapis.com") throw new TRPCError({ code: "BAD_REQUEST", message: "Gemini must use the official HTTPS endpoint" });
      if (input.kind === "narakeet" && url.hostname !== "api.narakeet.com") throw new TRPCError({ code: "BAD_REQUEST", message: "Narakeet must use the official HTTPS endpoint" });
      const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      const id = await db.insert(ttsProviders).values({ userId: ctx.user.id, name: input.name, kind: input.kind, endpoint: input.endpoint.replace(/\/$/, ""), model: input.model ?? (input.kind === "gemini" ? "gemini-3.8-flash-tts" : null), encryptedApiKey: encryptSecret(input.apiKey) }).$returningId();
      return { id: id[0].id, maskedKey: maskSecret(input.apiKey) };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(1).max(120).optional(), model: z.string().max(160).optional(), apiKey: z.string().min(8).optional(), endpoint: z.string().url().optional() })).mutation(async ({ ctx, input }) => {
      const provider = await requireProvider(ctx.user.id, input.id); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
      const values: any = {}; if (input.name) values.name = input.name; if (input.model) values.model = input.model; if (input.apiKey) values.encryptedApiKey = encryptSecret(input.apiKey); if (input.endpoint) { const url = new URL(input.endpoint); if (url.protocol !== "https:") throw new TRPCError({ code: "BAD_REQUEST", message: "Provider endpoint must use HTTPS" }); values.endpoint = input.endpoint.replace(/\/$/, ""); }
      if (!Object.keys(values).length) return { ok: true };
      await db.update(ttsProviders).set({ ...values, status: "not_tested", lastError: null }).where(and(eq(ttsProviders.id, provider.id), eq(ttsProviders.userId, ctx.user.id))); return { ok: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" }); await requireProvider(ctx.user.id, input.id); await db.delete(ttsProviders).where(and(eq(ttsProviders.id, input.id), eq(ttsProviders.userId, ctx.user.id))); return { ok: true }; }),
    setFlags: protectedProcedure.input(z.object({ id: z.number().int().positive(), enabled: z.boolean().optional(), primary: z.boolean().optional(), backup: z.boolean().optional() })).mutation(async ({ ctx, input }) => { const p = await requireProvider(ctx.user.id, input.id); if ((input.primary || input.backup) && p.status !== "tts_passed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Test Burmese TTS successfully before selecting primary or backup" }); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" }); const values: any = {}; if (input.enabled !== undefined) values.enabled = input.enabled; if (input.primary) values.primary = true; if (input.backup) values.backup = true; await db.update(ttsProviders).set(values).where(and(eq(ttsProviders.id, input.id), eq(ttsProviders.userId, ctx.user.id))); return { ok: true }; }),
    testConnection: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const p = await requireProvider(ctx.user.id, input.id); try { await listVoices(p as any); await updateProviderStatus(ctx.user.id, p.id, "connected", undefined, true); await recordTest(ctx.user.id, p.id, "connection", "passed", "Provider responded and voice catalog was readable"); return { status: "Connected" as const }; } catch (e) { const msg = sanitize(e); const status = msg === "Invalid Key" ? "invalid_key" : msg === "Unsupported Model" ? "unsupported_model" : msg === "Quota Exceeded" ? "quota_exceeded" : "not_tested"; await updateProviderStatus(ctx.user.id, p.id, status, msg); await recordTest(ctx.user.id, p.id, "connection", "failed", msg); throw new TRPCError({ code: "BAD_REQUEST", message: msg }); } }),
    testBurmese: protectedProcedure.input(z.object({ id: z.number().int().positive(), voiceId: z.string().min(1).max(160) })).mutation(async ({ ctx, input }) => { const p = await requireProvider(ctx.user.id, input.id); try { const result = await synthesize(p as any, BURMESE_SAMPLE, input.voiceId); if (!result.audio.length) throw new Error("Provider returned unusable audio"); await updateProviderStatus(ctx.user.id, p.id, "tts_passed", undefined, true); await recordTest(ctx.user.id, p.id, "burmese_tts", "passed", `Burmese audio generated with ${result.model}`); return { status: "Burmese TTS Passed" as const, mimeType: result.mimeType, audioBase64: result.audio.toString("base64"), provider: result.provider, model: result.model }; } catch (e) { const msg = sanitize(e); await updateProviderStatus(ctx.user.id, p.id, msg === "Invalid Key" ? "invalid_key" : msg === "Unsupported Model" ? "unsupported_model" : msg === "Quota Exceeded" ? "quota_exceeded" : "tts_failed", msg); await recordTest(ctx.user.id, p.id, "burmese_tts", "failed", msg); throw new TRPCError({ code: "BAD_REQUEST", message: msg }); } }),
    voices: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => { const p = await requireProvider(ctx.user.id, input.id); try { return await listVoices(p as any); } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: sanitize(e) }); } }),
  }),
  jobs: router({
    list: protectedProcedure.query(({ ctx }) => listJobs(ctx.user.id)),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => { const job = await getJob(ctx.user.id, input.id); if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" }); return job; }),
    create: protectedProcedure.input(z.object({ text: z.string().min(1), providerId: z.number().int().positive().optional(), backupProviderId: z.number().int().positive().optional(), voiceId: z.string().min(1), style: z.string().max(500).optional(), speed: z.number().int().min(50).max(200).optional() })).mutation(async ({ ctx, input }) => { const providers = await listProviders(ctx.user.id); const primary = input.providerId ?? providers.find(p => p.primary && p.enabled && p.status === "tts_passed")?.id ?? null; const backup = input.backupProviderId ?? providers.find(p => p.backup && p.enabled && p.status === "tts_passed")?.id ?? null; const chunks = splitScript(input.text); if (!chunks.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Script is empty" }); const id = await createJob(ctx.user.id, { providerId: primary, backupProviderId: backup, text: input.text, voiceId: input.voiceId, style: input.style, speed: input.speed, chunks }); enqueueJob(id); return { id, chunks: chunks.length }; }),
    cancel: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await updateJob(ctx.user.id, input.id, { status: "cancelled", stage: "cancelled", error: null }); return { ok: true }; }),
    retry: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const job = await getJob(ctx.user.id, input.id); if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" }); if (job.status !== "failed" && job.status !== "cancelled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only failed or cancelled jobs can be retried" }); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" }); await db.update(generationChunks).set({ status: "queued", error: null }).where(and(eq(generationChunks.jobId, input.id), eq(generationChunks.userId, ctx.user.id))); await updateJob(ctx.user.id, input.id, { status: "queued", stage: "queued", progress: 0, completedChunks: 0, error: null }); enqueueJob(input.id); return { ok: true }; }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const job = await getJob(ctx.user.id, input.id); if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" }); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" }); await db.delete(generationChunks).where(and(eq(generationChunks.jobId, input.id), eq(generationChunks.userId, ctx.user.id))); await db.delete(generationJobs).where(and(eq(generationJobs.id, input.id), eq(generationJobs.userId, ctx.user.id))); return { ok: true }; }),
    audio: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => { const job = await getJob(ctx.user.id, input.id); if (!job || job.status !== "completed" || (!job.audioStorageKey && !job.audioData)) throw new TRPCError({ code: "NOT_FOUND", message: "Audio is not ready" }); if (job.audioStorageKey) { try { return { mimeType: job.audioMime ?? "audio/wav", url: await storageGetSignedUrl(job.audioStorageKey), bytes: job.audioBytes ?? undefined, provider: job.providerUsed, model: job.modelUsed }; } catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Audio storage download is temporarily unavailable" }); } } return { mimeType: job.audioMime ?? "audio/wav", base64: job.audioData!, provider: job.providerUsed, model: job.modelUsed }; }),
  }),
  characters: router({
    list: protectedProcedure.query(({ ctx }) => listCharacters(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().min(1).max(120), description: z.string().max(500).optional(), providerId: z.number().int().positive().optional(), voiceId: z.string().min(1).max(160), style: z.string().max(500).optional(), speed: z.number().int().min(50).max(200).default(100) })).mutation(async ({ ctx, input }) => ({ id: await createCharacter(ctx.user.id, { ...input, description: input.description ?? null, providerId: input.providerId ?? null, style: input.style ?? null }) })),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await deleteCharacter(ctx.user.id, input.id); return { ok: true }; }),
  }),
});
export type AppRouter = typeof appRouter;
