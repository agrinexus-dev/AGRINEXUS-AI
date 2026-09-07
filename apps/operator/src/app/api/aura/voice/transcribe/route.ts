import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { validateAudioPayload } from "@/lib/aura/audio/audio-validation";
import { transcribeAudio } from "@/lib/aura/router/aura-router";
import { AuraRouterAllFailedError } from "@/lib/aura/router/types";
import { containsDevanagariScript } from "@/lib/aura/voice/language-detection";
import { VOICE_REQUEST_ID_HEADER } from "@/lib/aura/voice/voice-timing";

/**
 * The Farmer-facing "I couldn't confidently understand the language"
 * fallback. Reuses the EXISTING error-surfacing path this route
 * already has (a non-2xx JSON `{ error }` body, already shown verbatim to
 * the Farmer by `voice-recorder-button.tsx`'s own `fail(data?.error ??...)`
 * see that file, unmodified this change) rather than inventing any new
 * client-side error UI/architecture.
 */
const LANGUAGE_AMBIGUOUS_MESSAGE = "I couldn't confidently understand the language. Please try speaking again.";

/**
 * `POST /api/aura/voice/transcribe` — Farmer Voice AURA. The
 * Farmer-facing twin of `/api/aura/router/test` for
 * `speech_to_text`: any AUTHENTICATED user may call this (no operator/admin
 * gate — every Farmer needs this for voice input), but unlike the Operator
 * test route, this NEVER returns routing diagnostics. `{ text }` is the
 * ONLY field in a successful response; provider/model/latency/attempt-chain
 * (present internally on `transcribeAudio`'s own result — the exact same
 * function the Operator test panel calls) are deliberately dropped before
 * the response leaves this route (Part "SECURITY": "Farmer only requests
 * capabilities," never sees which provider/model served it).
 *
 * The router itself (`transcribeAudio` → `listEndpointsForCapability
 * ("speech_to_text")`) picks the endpoint — this route never selects
 * Groq/Gemini/OpenRouter or a specific model, per Part "STT": "Do NOT
 * hard-code a provider inside Farmer."
 *
 * Part "AUDIO SECURITY": the raw audio bytes are held only in memory for
 * the duration of this request (validated, then handed straight to the
 * router's own `transcribe()` adapter call) — never written to disk, never
 * logged, never persisted. Only the resulting TEXT transcript is ever
 * persisted (by the client's own existing `persistUserTurn`, exactly like
 * a typed message — Part "AURA RESPONSE": "do not create a separate voice
 * conversation database").
 */
const requestSchema = z.object({
  audio: z.object({
    mimeType: z.string().min(1),
    dataBase64: z.string().min(1),
  }),
  /**
   * An OPTIONAL ISO-639-1
   * code, forwarded to `transcribeAudio` (see that function's own doc
   * comment for the live evidence this addresses). Client-supplied but
   * harmless to trust: it only ever narrows/corrects which SCRIPT the
   * provider transcribes into, never which farm data is read or which
   * action executes — the same trust model as `preferredLanguage` in
   * `AuraContext` (a display/behavior preference, not an authorization
   * input). Restricted to a short known-safe pattern regardless, so this
   * route never forwards arbitrary client text as a raw provider parameter.
   */
  language: z
    .string()
    .regex(/^[a-z]{2,3}$/)
    .optional(),
});

export async function POST(request: Request): Promise<Response> {
  // `stt_server_start`, a high-resolution monotonic timestamp (`performance
  // .now()`, per Part 3's own "do not rely exclusively on Date.now()"), and
  // the client's own correlation id (a bare header, never a body field —
  // every existing caller/schema is untouched). Both are PURELY diagnostic:
  // neither is read by any decision this route makes.
  const stt_server_start = performance.now();
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

  const validation = validateAudioPayload(body.audio.mimeType, body.audio.dataBase64);
  if (!validation.ok) {
    return Response.json({ error: validation.reason }, { status: 400 });
  }

  try {
    // Part 7 — `transcribeAudio`'s own `attempts`/`latencyMs`/`fallbackCount`
    // already record exactly which endpoint(s) were tried and how long each
    // took (`aura-router.ts`, unchanged this change — this route only reads
    // that existing data, never changes how it's computed). `latencyMs`
    // below IS this attempt's own `stt_provider_start`→`stt_provider_complete`
    // span; a separate pair of timestamps isn't needed since the router
    // already isolates it per-attempt.
    let result = await transcribeAudio(body.audio, { signal: request.signal, language: body.language });

    console.info(
      `[AURA][voice][timing] stage=stt voiceRequestId=${voiceRequestId ?? "n/a"} provider=${result.provider} model=${result.model} ` +
        `attempts=${result.attempts.length} fallback=${result.fallbackCount > 0 ? "yes" : "no"} providerLatencyMs=${result.latencyMs.toFixed(1)} ` +
        `transcriptLength=${result.text.length} detectedLanguage=${result.detectedLanguage ?? "none"}`,
    );
    if (result.attempts.length > 1) {
      for (const [index, attempt] of result.attempts.entries()) {
        console.info(
          `[AURA][voice][timing] stage=stt-attempt voiceRequestId=${voiceRequestId ?? "n/a"} attempt=${index + 1} provider=${attempt.provider} ` +
            `model=${attempt.model} success=${attempt.success} failureReason=${attempt.failureReason ?? "n/a"} latencyMs=${attempt.latencyMs.toFixed(1)}`,
        );
      }
    }

    // The one recovery path this route adds. TRIGGER (all three must hold,
    // so this can
    // never fire for a normal English turn or an already-working Urdu
    // turn): (1) the Farmer/client sent NO language hint at all — this is
    // genuinely a first-turn/cold-start request, never a repeat of an
    // already-hinted one; (2) Whisper's OWN `verbose_json.language` field
    // did not normalize to a supported value (the "reported
    // Hindi/nothing" case); (3) the transcript
    // it returned is in Devanagari script — the exact, already-reproduced
    // (the earlier) Urdu-misheard-as-Hindi signature.
    //
    // WHAT THIS DOES NOT DO: it never reinterprets or relabels the
    // Devanagari text above as Urdu — that text is discarded outright. What
    // it DOES do is make one fresh, independent, ALREADY-established-safe
    // STT call on the ORIGINAL AUDIO with an explicit `language: "ur"` hint
    // — the exact same mechanism `voice-recorder-button.tsx` has used since
    // for a Farmer who already has Urdu context, and which
    // An earlier change's live testing twice confirmed reliably produces a
    // genuine Urdu-script transcript for genuine Urdu speech. The result is
    // ONLY accepted if the provider's own language field now normalizes to
    // "ur" AND the fresh transcript itself still contains no Devanagari —
    // two independent, real checks, not an assumption. If either fails, no
    // guess is made either way — the honest "couldn't confidently
    // understand" fallback below is returned instead, exactly per that
    // milestone's own explicit "do not manufacture a false-positive Urdu
    // detector" instruction.
    //
    // Residual, honestly-disclosed limitation (see the milestone report):
    // spoken Hindi and spoken Urdu are phonetically close enough that this
    // same recovery call could also "succeed" on genuine Hindi audio, since
    // script alone cannot distinguish the two without a language-ID model
    // (explicitly out of scope). This product supports no Hindi speakers in
    // any capacity, so this trade-off only ever affects an already
    // out-of-scope input, never a real English or Urdu Farmer.
    const noHintProvided = !body.language;
    const firstAttemptAmbiguous = noHintProvided && !result.detectedLanguage && containsDevanagariScript(result.text);

    if (firstAttemptAmbiguous) {
      console.info(`[AURA][voice][timing] stage=stt-recovery voiceRequestId=${voiceRequestId ?? "n/a"} trigger=devanagari-no-hint action=retry-with-ur-hint`);
      try {
        const recovered = await transcribeAudio(body.audio, { signal: request.signal, language: "ur" });
        const recoveredIsConfidentUrdu = recovered.detectedLanguage === "ur" && !containsDevanagariScript(recovered.text);
        console.info(
          `[AURA][voice][timing] stage=stt-recovery voiceRequestId=${voiceRequestId ?? "n/a"} outcome=${recoveredIsConfidentUrdu ? "accepted" : "rejected"} ` +
            `recoveredDetectedLanguage=${recovered.detectedLanguage ?? "none"} recoveredTranscriptLength=${recovered.text.length}`,
        );
        if (recoveredIsConfidentUrdu) {
          result = recovered;
        } else {
          return Response.json({ error: LANGUAGE_AMBIGUOUS_MESSAGE }, { status: 502 });
        }
      } catch (recoveryError) {
        // The recovery attempt itself failing (provider error/timeout) is
        // still just "could not confidently understand" from the Farmer's
        // perspective — never surfaced as a different/scarier error, and
        // never falls back to showing the original Devanagari transcript.
        console.error(
          `[AURA][voice][timing] stage=stt-recovery voiceRequestId=${voiceRequestId ?? "n/a"} status=error`,
          recoveryError instanceof Error ? recoveryError.message : recoveryError,
        );
        return Response.json({ error: LANGUAGE_AMBIGUOUS_MESSAGE }, { status: 502 });
      }
    } else if (result.detectedLanguage === "ur" && containsDevanagariScript(result.text)) {
      // Defense-in-depth: even on an ALREADY-hinted request
      // (the Farmer's client sent `language: "ur"` itself, e.g. a later
      // turn), never let a Devanagari transcript reach the Farmer labeled
      // as Urdu — the strict "Urdu experience must be Urdu/Arabic script,
      // never Devanagari" requirement holds regardless of how the request
      // got here.
      console.info(`[AURA][voice][timing] stage=stt-recovery voiceRequestId=${voiceRequestId ?? "n/a"} outcome=rejected reason=devanagari-despite-hint`);
      return Response.json({ error: LANGUAGE_AMBIGUOUS_MESSAGE }, { status: 502 });
    }

    const stt_server_complete = performance.now();
    console.info(`[AURA][voice][timing] stage=stt-final voiceRequestId=${voiceRequestId ?? "n/a"} stt_server_ms=${(stt_server_complete - stt_server_start).toFixed(1)}`);

    // `detectedLanguage` is already normalized to
    // the product's two supported values (or `undefined`) at the source
    // (`groq-provider.ts`) — never provider/model details, so this stays
    // within the existing "Farmer only gets capabilities" rule this
    // route's own doc comment already establishes.
    return Response.json({ text: result.text, detectedLanguage: result.detectedLanguage });
  } catch (error) {
    // Part "SECURITY": never expose provider stack traces/raw provider
    // errors to the Farmer — same one safe, generic message regardless of
    // WHY every speech-to-text endpoint failed (none configured, all
    // rate-limited, all timed out,...). The real reason is still fully
    // diagnosable server-side via the router's own attempts array, logged
    // below exactly like `/api/aura/chat/route.ts`'s own failure logging.
    if (error instanceof AuraRouterAllFailedError) {
      console.error(
        `[AURA][voice][timing] stage=stt voiceRequestId=${voiceRequestId ?? "n/a"} status=all-failed ` +
          `attempts=${error.attempts.map((a) => `${a.provider}:${a.failureReason ?? "unknown"}:${a.latencyMs.toFixed(1)}ms`).join(", ") || "no endpoint configured"}`,
      );
    } else {
      console.error(`[AURA][voice][timing] stage=stt voiceRequestId=${voiceRequestId ?? "n/a"} status=error`, error instanceof Error ? error.message : error);
    }
    return Response.json({ error: "I couldn't understand that recording. Please try again or type your message instead." }, { status: 502 });
  }
}
