import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { isSupportedAudioMimeType } from "@/lib/aura/audio/audio-constraints";
import { synthesizeSpeechRequest } from "@/lib/aura/router/aura-router";
import { AuraRouterAllFailedError } from "@/lib/aura/router/types";
import { VOICE_REQUEST_ID_HEADER } from "@/lib/aura/voice/voice-timing";

/**
 * `POST /api/aura/voice/speak` — the `text_to_speech` twin of
 * `/api/aura/voice/transcribe`'s own doc comment (same auth model, same
 * "never leak routing diagnostics to the Farmer" rule — a successful
 * response is only ever `{ audioBase64, mimeType }`).
 *
 * Part "TTS": "If TTS fails, KEEP THE TEXT RESPONSE. Never make voice
 * playback failure equal to AURA failure." This route enforces that at the
 * boundary that matters — it returns a normal 502 with a generic message
 * on failure, and the client (`farmer-aura-page.tsx`) is written to treat
 * that failure as "skip playback, the text answer is already shown and
 * unaffected" rather than surfacing any error to the Farmer at all.
 *
 * A reasonable length cap (4000 characters — well beyond any real AURA
 * reply this project produces, generously bounding what gets sent to a
 * paid-adjacent synthesis call) guards against a pathological request; the
 * router's own configured TTS endpoint(s) are picked exactly like every
 * other capability, never hard-coded here.
 */
const requestSchema = z.object({
  text: z.string().min(1).max(4000),
});

export async function POST(request: Request): Promise<Response> {
  // See `/api/aura/voice/transcribe/route.ts`'s own doc comment on
  // this exact pattern (an optional voice-request-id header).
  const tts_server_start = performance.now();
  const voiceRequestId = request.headers.get(VOICE_REQUEST_ID_HEADER);

  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await synthesizeSpeechRequest(body.text, { signal: request.signal });

    // — "do not assume HTTP 200 = success" applies at every layer, not just
    // the provider adapter's own internal check. This is the last point
    // before a response is honestly told to the Farmer's browser
    // "this is real, playable audio" — re-verify that claim here rather
    // than trusting it transitively. `HTTP 200 + no audio`, `+ invalid
    // base64`, `+ unsupported MIME`, and `+ zero-byte decoded output` are
    // ALL treated as the same real TTS failure the router's own
    // all-endpoints-failed path already produces — never forwarded to the
    // client as if they were success.
    let decodedLength: number;
    try {
      decodedLength = Buffer.from(result.audioBase64, "base64").length;
    } catch {
      decodedLength = 0;
    }
    if (decodedLength === 0 || !isSupportedAudioMimeType(result.mimeType)) {
      console.error(`[AURA][voice] text-to-speech produced an unplayable response (mimeType=${result.mimeType}, decodedBytes=${decodedLength})`);
      return Response.json({ error: "Voice playback is unavailable right now." }, { status: 502 });
    }

    const tts_server_complete = performance.now();
    console.info(
      `[AURA][voice][timing] stage=tts voiceRequestId=${voiceRequestId ?? "n/a"} provider=${result.provider} model=${result.model} ` +
        `attempts=${result.attempts.length} fallback=${result.fallbackCount > 0 ? "yes" : "no"} providerLatencyMs=${result.latencyMs.toFixed(1)} ` +
        `wrapMs=${result.wrapMs !== undefined ? result.wrapMs.toFixed(1) : "n/a"} tts_server_ms=${(tts_server_complete - tts_server_start).toFixed(1)} ` +
        `responseBytes=${decodedLength} mimeType=${result.mimeType}`,
    );
    if (result.attempts.length > 1) {
      for (const [index, attempt] of result.attempts.entries()) {
        console.info(
          `[AURA][voice][timing] stage=tts-attempt voiceRequestId=${voiceRequestId ?? "n/a"} attempt=${index + 1} provider=${attempt.provider} ` +
            `model=${attempt.model} success=${attempt.success} failureReason=${attempt.failureReason ?? "n/a"} latencyMs=${attempt.latencyMs.toFixed(1)}`,
        );
      }
    }

    return Response.json({ audioBase64: result.audioBase64, mimeType: result.mimeType });
  } catch (error) {
    if (error instanceof AuraRouterAllFailedError) {
      console.error(
        `[AURA][voice][timing] stage=tts voiceRequestId=${voiceRequestId ?? "n/a"} status=all-failed ` +
          `attempts=${error.attempts.map((a) => `${a.provider}:${a.failureReason ?? "unknown"}:${a.latencyMs.toFixed(1)}ms`).join(", ") || "no endpoint configured"}`,
      );
    } else {
      console.error(`[AURA][voice][timing] stage=tts voiceRequestId=${voiceRequestId ?? "n/a"} status=error`, error instanceof Error ? error.message : error);
    }
    return Response.json({ error: "Voice playback is unavailable right now." }, { status: 502 });
  }
}
