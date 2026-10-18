# Verified provider facts

Google’s official Gemini TTS documentation states that the Gemini Interactions API accepts text-only input and audio-only output, with unary WAV output available from `output_audio.data` or the audio content block in the raw response. The current TTS guide documents `gemini-3.8-flash-tts`, `response_format: { type: "audio", mime_type: "audio/wav" }`, voice catalog discovery through `GET /v1beta/voices`, and prebuilt voices including Achird. It explicitly lists Burmese as supported by Gemini 3.8 Flash TTS and not by Flash-Lite TTS.

Source: https://ai.google.dev/gemini-api/docs/speech-generation
Source: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts
Source: https://ai.google.dev/gemini-api/docs/models

Narakeet’s official Burmese page lists Burmese voices including Zeya (Male) and Sanda (Female), and states that Burmese output is available in M4A, MP3 and WAV. Its official API documentation describes `POST https://api.narakeet.com/text-to-speech/wav`, `x-api-key` authentication, a `text/plain` body, long-content JSON polling via `statusUrl`, and a 1024 KB long-content limit.

Source: https://www.narakeet.com/languages/burmese-text-to-speech/
Source: https://www.narakeet.com/docs/automating/text-to-speech-api/

The originally named `https://ddt.manus.space/` returned HTTP 404 during inspection, and no reusable project resource or source checkout was available in this session.
