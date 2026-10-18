# Delivery outcomes

## 1. Secure per-user authentication and ownership
- Use the starter’s real Manus OAuth account flow with secure `webdev_app_session` cookies.
- Each authenticated user owns separate providers, voice settings, generation jobs, audio files and sanitized test history.
- Enforce ownership checks on every provider, job, audio and settings procedure.
- Do not use a shared provider key between unrelated users.

Status: IN PROGRESS

## 2. Gemini API settings and real Burmese validation
- Let a user add, replace, test and remove a Gemini API key.
- Persist the key encrypted server-side and return only a masked suffix/presence.
- Validate a real audio-capable Gemini model and a short Burmese TTS request with usable audio bytes.
- Expose Connected, Invalid Key, Unsupported Model, Quota Exceeded, Burmese TTS Passed and Burmese TTS Failed states.
- Make Gemini primary only after Burmese TTS succeeds.

Status: IN PROGRESS; real credential-dependent tests remain NOT TESTED until a user provides a provider key. The app uses the platform-managed server secret and does not require a custom encryption secret.

## 3. Modular TTS providers
- Provide API Settings → TTS Providers with add/edit/delete, enable/disable, primary/backup, connection test, Burmese voice test, status, last successful provider and sanitized error history.
- Keep Gemini and Narakeet in provider-specific adapters with different request/response formats.
- Validate HTTPS endpoints and reject unsafe or unsupported custom endpoint configurations.

Status: IN PROGRESS

## 4. Long-script generation
- Remove the 5,000-character limit and do not cap total script length at the application layer.
- Chunk by provider-safe limits while preserving Burmese punctuation and sentence boundaries.
- Persist queued jobs, chunks, retries, progress, cancellation and ordered output.
- Combine audio in the correct order and expose play/download/regenerate.
- Explain that provider quota, rate limits, cost and server resources still apply.

Status: IN PROGRESS

## 5. Voice catalog and controls
- Load actual provider voice catalogs; do not invent names or gender metadata.
- Show verified male/female options only when provider metadata supports them.
- Show Achird · low only when Gemini returns that supported voice/pitch combination.
- Update options when switching providers and expose preview, speed, volume and supported style controls.
- Display actual provider/model used for generated audio.

Status: IN PROGRESS. Per-user voice-character presets are implemented; provider-dependent catalog and preview checks remain credential-dependent.

## 6. Tested fallback
- Use only a tested primary provider first.
- On failure, attempt a configured and tested backup, preserve original job/text, show the switch reason and keep credentials out of logs.
- Never return sample/fake audio; show exact required configuration if no provider works.

Status: IN PROGRESS

## 7. Optional script/video module
- Keep the main Voice Studio focused.
- Keep script correction, video upload/sync, existing-audio input and combined-video export separate and disabled until implemented and tested.
- Do not place Movie Recap promotional text in the main interface.

Status: NOT STARTED

## 8. Real validation and deployment
- Run automated checks and real requests where credentials and provider quotas permit.
- Mark missing-credential checks NOT TESTED, never PASS.
- Verify mobile layout, database migration, build, checkpoint and persistent public publication.

Status: IN PROGRESS
