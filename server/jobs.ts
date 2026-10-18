import { and, eq, inArray } from "drizzle-orm";
import { generationChunks, generationJobs } from "../drizzle/schema";
import { getDb } from "./db";
import { getChunks, getProvider, updateChunk, updateJob } from "./studio";
import { synthesize } from "./providers";
import { storagePut } from "./storage";

export function splitScript(input: string, maxChars = 2600) {
  const text = input.trim(); if (!text) return [];
  const sentences = text.split(/(?<=[။!?၊\n])\s*/u).filter(Boolean);
  const chunks: string[] = []; let current = "";
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) { chunks.push(current.trim()); current = ""; }
      for (let i = 0; i < sentence.length; i += maxChars) chunks.push(sentence.slice(i, i + maxChars));
    } else if ((current + " " + sentence).trim().length > maxChars) {
      if (current) chunks.push(current.trim()); current = sentence;
    } else current = `${current} ${sentence}`.trim();
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

function combineWav(buffers: Buffer[]) {
  if (buffers.length === 1) return buffers[0];
  const headers = buffers.map(b => ({
    riff: b.subarray(0, 4).toString("ascii"), wave: b.subarray(8, 12).toString("ascii"),
    channels: b.readUInt16LE(22), sampleRate: b.readUInt32LE(24), bits: b.readUInt16LE(34), dataOffset: b.indexOf(Buffer.from("data")),
  }));
  if (headers.some(h => h.riff !== "RIFF" || h.wave !== "WAVE" || h.dataOffset < 0)) throw new Error("Generated audio is not a supported WAV file");
  const first = headers[0];
  if (headers.some(h => h.channels !== first.channels || h.sampleRate !== first.sampleRate || h.bits !== first.bits)) throw new Error("Generated audio chunks have incompatible formats");
  const pcm = buffers.map((b, i) => b.subarray(headers[i].dataOffset + 8));
  const out = Buffer.from(buffers[0].subarray(0, headers[0].dataOffset + 8));
  const data = Buffer.concat(pcm); out.writeUInt32LE(36 + data.length, 4); out.writeUInt32LE(data.length, headers[0].dataOffset + 4);
  return Buffer.concat([out, data]);
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Provider request failed";
  if (message.startsWith("Failed query") || message.includes("params:") || message.length > 240) return "Server error while saving or validating generated audio";
  return message.replace(/(AIza|key|token|authorization)[^\s,;]*/gi, "$1 [redacted]").slice(0, 240);
}

const active = new Set<number>();
export function enqueueJob(jobId: number) {
  if (active.has(jobId)) return;
  active.add(jobId);
  void processJob(jobId).finally(() => active.delete(jobId));
}

async function processJob(jobId: number) {
  const db = await getDb();
  if (!db) return;
  try {
    const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
    if (!job || job.status === "cancelled" || job.status === "completed") return;
    await updateJob(job.userId, jobId, { status: "running", stage: "requesting_provider", progress: Math.max(job.progress, 5), error: null });
    const primary = job.providerId ? await getProvider(job.userId, job.providerId) : undefined;
    const backup = job.backupProviderId ? await getProvider(job.userId, job.backupProviderId) : undefined;
    const chunks = await getChunks(job.userId, jobId);
    if (!chunks.length) throw new Error("No generation chunks were created");
    const buffers: Buffer[] = [];
    let usedProvider = primary; let fallbackReason: string | undefined;
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      const [fresh] = await db.select().from(generationChunks).where(and(eq(generationChunks.id, chunk.id), eq(generationChunks.userId, job.userId))).limit(1);
      const [current] = await db.select({ status: generationJobs.status }).from(generationJobs).where(and(eq(generationJobs.id, jobId), eq(generationJobs.userId, job.userId))).limit(1);
      if (current?.status === "cancelled") return;
      if (fresh?.status === "completed" && fresh.audioData) { buffers.push(Buffer.from(fresh.audioData, "base64")); continue; }
      const providers = [usedProvider, backup].filter(Boolean) as NonNullable<typeof primary>[];
      let success: Awaited<ReturnType<typeof synthesize>> | null = null; let errorText = "No tested provider available";
      for (const provider of providers) {
        try {
          if (!provider.enabled || provider.status !== "tts_passed") { errorText = `${provider.name} is not tested for Burmese TTS`; continue; }
          await updateChunk(job.userId, chunk.id, { status: "running", attempts: (fresh?.attempts ?? 0) + 1 });
          await updateJob(job.userId, jobId, { stage: "requesting_provider", progress: Math.max(5, Math.round((index / chunks.length) * 70)) });
          success = await synthesize(provider, chunk.text, job.voiceId, job.style ?? undefined, job.speed ?? undefined);
          usedProvider = provider;
          break;
        } catch (error) {
          errorText = safeError(error);
          if (provider.id === primary?.id && backup) fallbackReason = `${provider.name} failed: ${errorText}`;
        }
      }
      if (!success) { await updateChunk(job.userId, chunk.id, { status: "failed", error: errorText }); throw new Error(errorText); }
      await updateJob(job.userId, jobId, { stage: "receiving_audio", progress: Math.max(55, Math.round(((index + 0.6) / chunks.length) * 85)) });
      if (!success.audio.length) throw new Error("Provider returned empty audio");
      await updateJob(job.userId, jobId, { stage: "validating_audio", progress: Math.max(80, Math.round(((index + 0.9) / chunks.length) * 95)) });
      buffers.push(success.audio);
      await updateChunk(job.userId, chunk.id, { status: "completed", audioMime: success.mimeType, providerUsed: success.provider, modelUsed: success.model, error: null });
      await updateJob(job.userId, jobId, { completedChunks: index + 1, progress: Math.round(((index + 1) / chunks.length) * 100), providerUsed: success.provider, modelUsed: success.model, fallbackReason: fallbackReason ?? null });
    }
    await updateJob(job.userId, jobId, { stage: "storing_audio", progress: 99 });
    const audio = combineWav(buffers);
    if (!audio.length) throw new Error("Generated audio is empty after validation");
    const stored = await storagePut(`burvoice/audio/${job.userId}/${jobId}`, audio, "audio/wav");
    console.info("[TTS job audio stored]", { jobId, userId: job.userId, bytes: stored.key ? audio.length : 0 });
    await updateJob(job.userId, jobId, { status: "completed", stage: "completed", progress: 100, completedChunks: chunks.length, audioMime: "audio/wav", audioData: null, audioStorageKey: stored.key, audioBytes: audio.length, providerUsed: usedProvider?.name ?? null, modelUsed: usedProvider?.model ?? null, fallbackReason: fallbackReason ?? null, error: null });
  } catch (error) {
    const [job] = await db.select({ userId: generationJobs.userId, status: generationJobs.status }).from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
    console.error("[TTS job failed]", { jobId, userId: job?.userId, code: (error as any)?.cause?.code ?? (error as any)?.code, message: safeError(error) });
    if (job && job.status !== "cancelled" && job.status !== "completed") {
      try { await updateJob(job.userId, jobId, { status: "failed", stage: "failed", error: safeError(error) }); } catch { /* avoid an unhandled worker rejection */ }
    }
  }
}

let workerStarted = false;
export function startJobWorker() {
  if (workerStarted) return;
  workerStarted = true;
  const poll = async () => {
    const db = await getDb(); if (!db) return;
    const pending = await db.select({ id: generationJobs.id }).from(generationJobs).where(inArray(generationJobs.status, ["queued", "running"])).limit(20);
    pending.forEach(row => enqueueJob(row.id));
  };
  void poll();
  const timer = setInterval(() => void poll(), 2000);
  timer.unref?.();
}
