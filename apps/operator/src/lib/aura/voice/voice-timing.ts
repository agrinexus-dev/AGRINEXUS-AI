/**
 * The ONE
 * shared shape every stage of the voice pipeline appends its own timestamps
 * to, keyed by a single `voiceRequestId` generated once per Farmer voice
 * interaction ("single request correlation ID"). Pure
 * types/constants only — no client/server marker needed, safe to import
 * from either side.
 *
 * Deliberately NOT a new persistence/telemetry architecture ("do
 * not implement anything outside this change") — every timestamp here is
 * only ever `console.log`ged (client) or logged server-side, tagged with
 * this same id so the two can be correlated by hand/by grep during this
 * diagnostic's own live testing. Nothing is written to a database, nothing
 * is sent to a third party.
 *
 * All timestamps are high-resolution monotonic milliseconds
 * (`performance.now()` — Part 3's own "do not rely exclusively on
 * Date.now() if a more accurate monotonic timer is available"), relative to
 * each environment's own time origin (the client's page-load time; the
 * server process's own start time) — never compared cross-environment
 * directly, only used to compute DURATIONS within the same environment
 * (e.g. `stt_request_complete - stt_request_start`, both client-side), per
 * Part 4's own calculated-metrics list.
 */

export function newVoiceRequestId(): string {
  return `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Client-side timestamps only — see this file's own doc comment for why these never leave the browser except as bare numbers in a console.log. */
export interface VoiceClientTimings {
  voiceRequestId: string;
  recording_start: number;
  recording_stop: number;
  stt_request_start: number;
  stt_request_complete: number;
  aura_request_start: number;
  /** `null` when the assistant reply never produced any visible content before completing (e.g. a deterministic/instant command reply) — see `farmer-aura-page.tsx`'s own doc comment on how this is detected without modifying the shared chat store. */
  aura_first_response: number | null;
  aura_complete: number;
  tts_request_start: number;
  tts_complete: number;
  /** `null` when TTS failed or was skipped — Part "TTS failure keeps text visible", never fabricated. */
  browser_play_start: number | null;
  browser_play_error: string | null;
}

/** The HTTP header every voice-pipeline fetch call carries the correlation id in — Part 3's own "must follow the request through the pipeline where technically possible." Never a body field (keeps every existing request schema untouched). */
export const VOICE_REQUEST_ID_HEADER = "x-voice-request-id";
