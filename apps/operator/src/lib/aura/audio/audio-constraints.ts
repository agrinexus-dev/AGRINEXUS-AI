/**
 * The audio-attachment twin of
 * `../images/image-constraints.ts`. Same reasoning, same shared-constants
 * pattern (imported by both the client recorder and the server-side
 * validator, never duplicated between them), no `"use client"`/`"server-
 * only"` marker since these are plain constants/types safe on either side.
 *
 * MIME types cover what `MediaRecorder` actually produces across real
 * browsers today (verified against each browser's own documented default,
 * not guessed): Chrome/Edge/Firefox default to `audio/webm` (Opus), Safari
 * (desktop and iOS) defaults to `audio/mp4` (AAC) since it never shipped
 * WebM support. `audio/ogg` and `audio/wav` are included for completeness —
 * a `MediaRecorder` can be asked for either where the browser supports it,
 * and this project's own Operator Router Test panel already generates a
 * real `audio/wav` sample.
 */

export const SUPPORTED_AUDIO_MIME_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg"] as const;
export type SupportedAudioMimeType = (typeof SUPPORTED_AUDIO_MIME_TYPES)[number];

export function isSupportedAudioMimeType(value: string): value is SupportedAudioMimeType {
  // A browser's `MediaRecorder.mimeType` commonly includes a `;codecs=...`
  // suffix (e.g. `audio/webm;codecs=opus`) — only the base type before any
  // `;` is checked against the allow-list, matching how the server-side
  // signature check below also only cares about the container format.
  const base = value.split(";")[0]?.trim() ?? value;
  return (SUPPORTED_AUDIO_MIME_TYPES as readonly string[]).includes(base);
}

/**
 * A push-to-talk clip for a single farmer utterance is expected to be a few
 * seconds to well under a minute — 8 MB raw comfortably covers a genuinely
 * long utterance (Opus/AAC at typical voice bitrates run well under
 * 32kbps, so 8 MB is minutes of audio, not seconds) while staying under the
 * same practical request-body ceiling `image-constraints.ts`'s own
 * `MAX_IMAGE_RAW_BYTES` doc comment already explains for this deployment
 * shape (no custom Next.js body-size config exists in this project).
 */
export const MAX_AUDIO_RAW_BYTES = 8 * 1024 * 1024;

/** Same base64-inflation accounting as `image-constraints.ts`'s `MAX_IMAGE_BASE64_LENGTH`. */
export const MAX_AUDIO_BASE64_LENGTH = Math.ceil((MAX_AUDIO_RAW_BYTES * 4) / 3) + 16;

/**
 * A push-to-talk MVP (Part "PUSH TO TALK": no continuous/background
 * listening) has no reason to ever record longer than a couple of minutes
 * of a single utterance — this is a client-side safety cap (stops the
 * recorder automatically) so an accidental "forgot to tap stop" doesn't
 * quietly grow an upload past `MAX_AUDIO_RAW_BYTES` or waste a farmer's
 * data. Not a security boundary (the server's own size check is that) —
 * just a sane UX guard.
 */
export const MAX_RECORDING_SECONDS = 90;
