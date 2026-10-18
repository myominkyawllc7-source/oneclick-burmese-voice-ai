# OneClick Burmese Voice AI Studio — implementation plan

The original `ddt.manus.space` origin returned HTTP 404 and this task exposes no existing website Resource or source checkout. Use the new managed React/Express/tRPC/Drizzle starter without rewriting its working OAuth, runtime configuration, deployment, or storage helpers. If the original project later becomes available, migration is separate from this fresh build.

## Implementation approach

Use Manus OAuth for independent authenticated accounts and managed MySQL for persistent owned records. Provider keys and script/audio payloads will use authenticated AES-256-GCM encryption with a dedicated runtime master secret, never browser persistence. Every query or mutation is scoped to the authenticated user. Provider responses contain only masked key presence; no raw credentials or provider error bodies are returned or logged. Use request-origin protection, secure cookies, rate limiting, isolated job ownership and defensive validation.

Build API Settings → TTS Providers with add/edit/delete/enable/disable/primary/backup management, real connection and Burmese audio tests, model/voice discovery and a sanitized error timeline. Gemini is the preferred integration but becomes eligible as primary only after a valid Burmese audio test. Implement provider-specific Gemini and Narakeet adapters behind a shared contract. Generic custom adapters are not assumed compatible: reject unsafe or unimplemented endpoint types and enforce fixed official HTTPS origins, redirect rejection and checked provider download destinations against SSRF. Additional genuine services can be added by implementing an adapter rather than changing the queue.

Use the current official Gemini Interactions TTS schema for `gemini-3.8-flash-tts`; validate its availability through the owner's key. Official docs explicitly list Burmese for this model but not Gemini 3.8 Flash-Lite TTS. Discover actual voice metadata via `GET /v1beta/voices`; show male/female filters only on verified metadata, and show Achird · low only if the provider's catalog reports the voice and pitch. Never infer gender from voice names. Narakeet has a distinct text/plain long-content WAV polling contract and documented Burmese voices; its live catalog must be loaded through its adapter.

The Studio editor will have no 5,000-character cap and no arbitrary script-length validation. Long text is uploaded incrementally into an owned durable draft using transport-sized segments, then provider-safe chunks preserve Myanmar `။`/`၊`, paragraphs and grapheme clusters. Provider token/byte limits and a conservative per-call audio duration budget constrain chunks, not total script length. A durable MySQL lease-based job queue stores encrypted source, chunk order, attempts, progress, cancellation and output metadata. A bounded worker processes chunks serially per job with retry backoff, cancellation checks, lease recovery and idempotent database writes. Generated audio is validated as non-empty decodable PCM WAV, combined in order, encrypted in durable object storage, and served through an authenticated owner-checking download route. Provider failures may switch only to an enabled, tested configured backup, preserve text/job and record the sanitized reason and actual provider/model per chunk/output. Explain quotas, rate limits, costs and finite server resources plainly.

The Studio and audio library expose real previews, progress, retries, cancellation, play/download/regenerate, provider/model attribution, and controls only where supported. Playback volume is a local player control; speaking style/speed are adapter capabilities, not promised universal parameters. Per-user voice preferences persist independently. No sample speech substitutes for generation.

Keep script correction and video workflow separate and optional, after core security and fallback. Correction uses the user's configured Gemini API. Video upload, external audio, synchronization and export require a separately enabled module and bounded server encoding resources; if unfinished or untested, label those capabilities unavailable rather than pretending they work. Do not put Movie Recap copy in the main UI.

## Serving and deployment

Keep the starter's combined Express frontend/API container, `PORT` listener and unauthenticated `/api/health`. Commit database migrations and run them intentionally against the managed project database, which is shared by development and production. All durable user data stays in MySQL or object storage, not ephemeral container files. Provider keys are encrypted with a key derived from the platform-managed server secret `MANUS_JWT_SECRET`; no custom `BURVOICE_ENCRYPTION_KEY` setup is required. If the platform secret is unavailable, the UI still runs but provider-key mutations fail closed with a configuration message. Persist the database and storage configuration before recording a checkpoint, publish that exact checkpoint and return the confirmed persistent public URL. Real paid provider tests require the user's own credential; absent credentials produce NOT TESTED, never PASS. Real request and unit-test evidence will be distinguished in the requested report.

## Project structure

- `client/src/pages/`: Studio, audio library, API Settings/TTS Providers and optional tools pages.
- `client/src/components/studio/`: shared application shell, provider forms, voice controls, job/progress and audio UI.
- `shared/studio.ts`: browser-safe input/output contracts and capability types.
- `server/studio/`: encryption, provider services, owned persistence, durable queue, safe network and audio validation/combination modules.
- `server/studio/providers/`: Gemini and Narakeet adapters with distinct wire contracts.
- `server/routers.ts`: authenticated tRPC entry points, retaining starter auth.
- `server/_core/index.ts`: HTTP health, owner-protected downloads, API transport and worker lifecycle.
- `drizzle/`: owned provider/settings/job/chunk/error schema and deterministic migrations.
- `server/**/*.test.ts`: focused automated security, chunking, audio and adapter/queue contract evidence.
- `client/public/manus-routes.json`: synchronized Studio, library, settings and tools route declarations.
- `DELIVERY_REPORT.md`: truthful PASS/FAIL/NOT TESTED evidence and database/deployment requirements.

## Design

Three considered styles: warm editorial recording desk (probability 0.06), dark broadcast console (probability 0.04), minimal Swiss laboratory (probability 0.08). Select the warm editorial recording desk for readable, phone-friendly script work.

**Design Movement:** Contemporary editorial utility inspired by a professional recording desk.

**Core Principles:** Script-first composition, honest state feedback, quiet chrome and tactile controls. Avoid decorative images for this internal production tool.

**Color Philosophy:** Warm ivory surfaces and charcoal text support long writing sessions; an ownable burnt orange marks the generation action and selected controls, while forest green is reserved for verified successful states.

**Layout Paradigm:** An asymmetric workspace with a narrow left navigation rail, a large flowing script document, and a compact right-hand voice inspector. On Android the rail becomes a top navigation strip and the inspector stacks below the editor, with accessible tap targets and no horizontal overflow.

**Signature Elements:** A compact waveform wordmark, tiny technical mono labels, and subtle orange rule accents.

**Interaction Philosophy:** Explicit test-before-primary transitions, visible disabled states with reasons, and confirmation for delete/cancel. Clear progress, provider switches and failures are never hidden.

**Animation:** Gentle 150–200ms focus/hover changes only. Job status indicators pulse subtly when actual work is running. Respect reduced-motion settings; avoid distracting entrance effects or fake waveform playback.

**Typography System:** DM Sans for interface and headings, Noto Sans Myanmar for Burmese script, and IBM Plex Mono for technical metadata and counters. Large compact page titles, generous 1.8–2.1 Burmese line height and 14–16px control text.

**Brand Essence:** A focused, credential-owned Burmese voice workspace for writers and audio creators. Precise, warm, trustworthy.

**Brand Voice:** Direct factual copy. Examples: “Your words. A voice that fits.” and “Test Burmese speech before making this provider primary.”

**Wordmark & Logo:** OneClick paired with five short uneven vertical waveform bars; small Burmese Voice AI Studio descriptor, not a default text-only title.

**Signature Brand Color:** Burnt orange `#D75B35`.
