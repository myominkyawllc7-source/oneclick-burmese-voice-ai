import axios from "axios";
import { decryptSecret } from "./studio";

export type Voice = { id: string; name: string; gender?: string; pitch?: string; style?: string; description?: string };
export type TtsResult = { audio: Buffer; mimeType: string; provider: string; model: string };
export type ProviderRecord = { id: number; name: string; kind: "gemini" | "narakeet"; endpoint: string; model: string | null; encryptedApiKey: string; voiceConfig: string | null };

export const BURMESE_SAMPLE = "မင်္ဂလာပါ။ မြန်မာဘာသာစကားဖြင့် အသံထုတ်လုပ်မှုကို စမ်းသပ်နေပါသည်။";

function usableAudio(data: Buffer) {
  if (!data.length) throw new Error("Provider returned empty audio");
  const wav = data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WAVE";
  const compressed = data.length > 32;
  if (!wav && !compressed) throw new Error("Provider returned unusable audio");
}

function classifyError(error: any) {
  const status = error?.response?.status;
  const body = JSON.stringify(error?.response?.data ?? "").toLowerCase();
  if (status === 401 || status === 403 || body.includes("api key") || body.includes("invalid key")) throw new Error("Invalid Key");
  if (status === 429 || body.includes("quota") || body.includes("rate limit")) throw new Error("Quota Exceeded");
  if (status === 404 || body.includes("model")) throw new Error("Unsupported Model");
  throw new Error("Provider request failed");
}

export async function geminiVoices(provider: ProviderRecord): Promise<Voice[]> {
  const apiKey = decryptSecret(provider.encryptedApiKey);
  try {
    const { data } = await axios.get(`${provider.endpoint.replace(/\/$/, "")}/v1beta/voices`, { headers: { "x-goog-api-key": apiKey }, timeout: 15000 });
    return (data.voices ?? []).map((v: any) => {
      const rawId = String(v.id ?? v.voiceName ?? v.name ?? "");
      const id = rawId.replace(/^voices\//, "");
      return { id, name: v.displayName ?? v.voiceName ?? id, gender: v.gender, pitch: v.pitch, style: v.persona ?? v.style, description: v.description };
    }).filter((v: Voice) => Boolean(v.id));
  } catch (error) { classifyError(error); return []; }
}

export async function geminiTts(provider: ProviderRecord, text: string, voice: string, style?: string): Promise<TtsResult> {
  const apiKey = decryptSecret(provider.encryptedApiKey);
  const model = provider.model || "gemini-3.8-flash-tts";
  try {
    const { data } = await axios.post(`${provider.endpoint.replace(/\/$/, "")}/v1beta/interactions`, {
      model,
      input: [{ type: "user_input", content: [{ type: "text", text, ...(style ? { annotations: [{ type: "speech_metadata", style }] } : {}) }] }],
      response_format: { type: "audio", mime_type: "audio/wav", sample_rate: 24000 },
      generation_config: { speech_config: [{ voice }] },
    }, { headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" }, timeout: 120000 });
    const base64 = data?.output_audio?.data ?? data?.steps?.flatMap((s: any) => s.content ?? []).find((c: any) => c.type === "audio")?.data;
    if (!base64) throw new Error("Provider returned no audio");
    const audio = Buffer.from(base64, "base64"); usableAudio(audio);
    return { audio, mimeType: "audio/wav", provider: provider.name, model };
  } catch (error) { if (error instanceof Error && error.message.startsWith("Provider returned")) throw error; classifyError(error); throw error; }
}

export async function narakeetVoices(_provider: ProviderRecord): Promise<Voice[]> {
  return [
    { id: "Zeya", name: "Zeya", gender: "male", description: "Burmese male voice" },
    { id: "Sanda", name: "Sanda", gender: "female", description: "Burmese female voice" },
  ];
}

export async function narakeetTts(provider: ProviderRecord, text: string, voice: string, speed?: number): Promise<TtsResult> {
  const apiKey = decryptSecret(provider.encryptedApiKey);
  const endpoint = provider.endpoint.replace(/\/$/, "") || "https://api.narakeet.com";
  try {
    const response = await axios.post(`${endpoint}/text-to-speech/wav?voice=${encodeURIComponent(voice)}${speed ? `&speed=${speed}` : ""}`, text, { headers: { "x-api-key": apiKey, "Content-Type": "text/plain" }, timeout: 180000 });
    if (!response.data?.statusUrl) throw new Error("Narakeet did not return a status URL");
    for (let i = 0; i < 60; i++) {
      const poll = await axios.get(response.data.statusUrl, { timeout: 15000 });
      if (!poll.data.finished) { await new Promise(r => setTimeout(r, 2500)); continue; }
      if (!poll.data.succeeded || !poll.data.result) throw new Error("Narakeet generation failed");
      const audioResponse = await axios.get(poll.data.result, { responseType: "arraybuffer", timeout: 120000 });
      const audio = Buffer.from(audioResponse.data); usableAudio(audio);
      return { audio, mimeType: "audio/wav", provider: provider.name, model: "narakeet-wav" };
    }
    throw new Error("Narakeet generation timed out");
  } catch (error) { if (error instanceof Error && error.message.includes("Narakeet")) throw error; classifyError(error); throw error; }
}

export async function listVoices(provider: ProviderRecord) { return provider.kind === "gemini" ? geminiVoices(provider) : narakeetVoices(provider); }
export async function synthesize(provider: ProviderRecord, text: string, voice: string, style?: string, speed?: number) { return provider.kind === "gemini" ? geminiTts(provider, text, voice, style) : narakeetTts(provider, text, voice, speed); }
