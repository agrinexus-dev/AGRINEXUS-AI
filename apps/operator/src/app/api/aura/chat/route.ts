import "server-only";

import { auth } from "@/lib/auth/auth";
import { parseCommand } from "@/lib/aura/commands/command-parser";
import { classifyContextNeeds } from "@/lib/aura/context/context-selector";
import { DEFAULT_IMAGE_ANALYSIS_QUESTION } from "@/lib/aura/images/image-constraints";
import { validateImagePayload } from "@/lib/aura/images/image-validation";
import { buildMessagesForProvider } from "@/lib/aura/prompt/prompt-builder";
import { createThinkBlockFilter, stripLeadingThinkBlock } from "@/lib/aura/prompt/strip-hidden-reasoning";
import type { ProviderUsage } from "@/lib/aura/providers/provider";
import { AURA_MODEL_CATALOG } from "@/lib/aura/router/model-catalog";
import { newRequestId, routeAURARequest, streamAURARequest } from "@/lib/aura/router/aura-router";
import { AuraRouterAllFailedError, type AuraCapability, type AuraRouterAttempt } from "@/lib/aura/router/types";
import { classifyTaskCategory } from "@/lib/aura/routing/task-router";
import type { ChatRequestBody } from "@/lib/aura/types";
import { conversationLanguageLabel, normalizeDetectedLanguage } from "@/lib/aura/voice/language-detection";
import { VOICE_REQUEST_ID_HEADER } from "@/lib/aura/voice/voice-timing";

const encoder = new TextEncoder();

function sseChunk(event: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

/** Fixed reply for any recognized command — command execution is handled separately. */
const COMMAND_RECOGNIZED_REPLY = "I understand this command.\n\nExecution will be available in Prompt 013C.";

/**
 * AURA's single chat endpoint. Command detection happens here, before any
 * provider is touched — a recognized command short-circuits with the fixed
 * reply above and never reaches a provider (command execution is handled
 * separately). Otherwise the request is handed to whichever
 * provider the client selected, resolved through the registry so this route
 * never contains provider-specific logic.
 */
export async function POST(request: Request): Promise<Response> {
  // T0: the instant this request is received,
  // before ANY work (including auth) happens. Every other timestamp below
  // is measured relative to this one, using the same `Date.now()`
  // convention `aura-router.ts` already uses for its own latency
  // tracking (Part 9: extend the existing diagnostic convention, don't
  // invent a second one). Never sent to the client — logged server-side
  // only via `logLatency` below, exactly like every other diagnostic this
  // route already produces (`logRouterUsage`, `logContextSelection`).
  const t0 = Date.now();
  // a bare, optional header (never a body field — every existing schema/
  // caller stays untouched); `null` for every non-voice request (typed
  // Farmer messages, Operator panel), in which case every diagnostic below
  // behaves exactly as it did before this change.
  const voiceRequestId = request.headers.get(VOICE_REQUEST_ID_HEADER);

  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { temperature, stream, messages, context, imageResponseLanguage } = body;
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");

  // real, server-side re-validation of any image attachment, independent
  // of whatever the client already checked ("client-side
  // validation is convenience only"). Runs BEFORE command parsing/routing
  // even begins — an invalid image is rejected as cheaply and clearly as
  // possible, never partially processed. `reason` here is always one of
  // `image-validation.ts`'s own pre-written, farmer-safe strings — never a
  // raw provider error, a stack trace, or anything containing the image
  // bytes themselves (Part 24/35 #11 — this route never logs the image
  // either).
  if (lastUserMessage?.image) {
    const validation = validateImagePayload(lastUserMessage.image.mimeType, lastUserMessage.image.dataBase64);
    if (!validation.ok) {
      return stream ? streamSingleError(validation.reason) : Response.json({ error: validation.reason }, { status: 400 });
    }

    // The "the language choice must NOT be UI-only... do not trust
    // client-provided language values blindly" requirement. Re-validated
    // here through the SAME allowlist `normalizeDetectedLanguage` already
    // enforces for voice STT output (`en`/`ur`/their full-word spellings
    // only — everything else, including a genuinely real language like
    // Hindi/Punjabi/Sindhi/Arabic or an arbitrary/malformed string,
    // normalizes to `undefined`). Only a VALID value overrides
    // `context.preferredLanguage` — and only for THIS request's own prompt
    // construction (`prompt-builder.ts`'s existing, unmodified
    // `languageInstructionFor`); it is never written back to the client,
    // never persisted, and never touches `auraLanguage`/any Settings
    // preference. A missing/invalid value changes nothing here: `context.
    // preferredLanguage` already carries whatever the existing
    // automatic-detection pipeline (`farmer-aura-page.tsx`'s
    // `sendAndPersist`) computed client-side for this turn, exactly as it
    // did before this change existed — this is the
    // precedence rule (explicit image choice highest priority, automatic
    // detection otherwise) implemented as a pure request-scoped override,
    // never a global/router/provider-selection change.
    const validatedImageLanguage = normalizeDetectedLanguage(imageResponseLanguage);
    if (validatedImageLanguage) {
      context.preferredLanguage = conversationLanguageLabel(validatedImageLanguage);
      // Marks
      // this override as the Farmer's own EXPLICIT choice (see
      // `AuraContext.preferredLanguageExplicit`'s own doc comment), so
      // `prompt-builder.ts` can treat it as authoritative rather than a
      // guess — fixing an earlier change's documented "image + Urdu + no typed
      // question sometimes answers in English" limitation, without
      // touching automatic per-turn detection for normal text at all
      // (this line only ever runs inside `if (lastUserMessage?.image)`,
      // for a request that ALSO passed server validation above).
      context.preferredLanguageExplicit = true;
    }
  }

  const command = lastUserMessage ? parseCommand(lastUserMessage.content) : { recognized: false };

  if (command.recognized) {
    return stream
      ? streamSingleReply(COMMAND_RECOGNIZED_REPLY)
      : Response.json({ content: COMMAND_RECOGNIZED_REPLY });
  }

  // The server independently re-derives the SAME deterministic classification
  // `aura-chat-store.ts` already uses to pick a model (`task-router.ts`'s
  // `classifyTaskCategory`), from the same real last-user-message text this
  // route already reads above — never trusts a client-supplied flag for
  // this, so it can't be spoofed into requesting a larger-than-necessary
  // (or, more importantly, a wrongly-smaller) context. A genuine history
  // question gets the full mission list; every other question gets the
  // smaller active-plus-recent default (see `prompt-builder.ts`'s
  // `buildMissionsSection`/`buildRobotMissionsSection`).
  // The client (`aura-chat-store.ts`'s `sendMessage`) already substitutes
  // `DEFAULT_IMAGE_ANALYSIS_QUESTION` before ever sending an image-only
  // message with no typed question; this is the server's own defense-in-
  // depth copy of that same rule, so an image attachment can NEVER reach
  // Gemini with an empty text part regardless of which client sent it.
  if (lastUserMessage?.image && lastUserMessage.content.trim().length === 0) {
    lastUserMessage.content = DEFAULT_IMAGE_ANALYSIS_QUESTION;
  }

  // Capability is derived SOLELY from
  // whether the real last user message actually carries an image, never
  // from a client-supplied flag (Security rule #17: "never trust client-
  // provided capability... without validation") — a Farmer typing a
  // question alongside a photo does not make this a "text" request; the
  // presence of the image is what selects the IMAGE routing chain.
  const capability: AuraCapability = lastUserMessage?.image ? "image" : "text";

  // Part 14/15/27 — "do not resend the original image indefinitely." An
  // earlier turn's image lives on as a real property of that OLDER
  // `AuraMessage` object inside `messages` (the client's own conversation
  // window, unchanged) — left as-is, it would be re-sent as REAL
  // `inline_data` bytes on every later request that still has that turn in
  // its recent-history window (the `MAX_RECENT_MESSAGES`), including
  // ones now correctly routed to the TEXT chain, wasting bandwidth/tokens
  // and defeating the whole point of only paying for image analysis once.
  // The image's OBSERVATIONS remain fully available regardless — they're
  // already plain text in that same older message's own persisted
  // assistant reply, which this stripping never touches. Only the CURRENT
  // request's own `lastUserMessage` (if any) keeps its image.
  for (const message of messages) {
    if (message !== lastUserMessage && message.image) {
      delete message.image;
    }
  }

  const category = lastUserMessage ? classifyTaskCategory(lastUserMessage.content) : "general";

  // AURA Smart Context & Token
 // Optimization — same trust model as `category` above: computed
  // server-side from the real last user message and the server-collected
  // `context` (specifically `context.plots`, the farm's own real plot data —
  // never a client-asserted plot id/name), so a farmer can't spoof which
  // context domains their own request receives, and a field reference can
  // only ever resolve to a plot that genuinely exists on THIS farm.
  const contextNeeds = lastUserMessage ? classifyContextNeeds(lastUserMessage.content, context) : undefined;
  const providerMessages = buildMessagesForProvider(messages, context, {
    includeFullMissionHistory: category === "history_query",
    contextNeeds,
    hasImageAttachment: capability === "image",
  });
  // AURA Context Intelligence & Provider
 // Utilization — a real, non-fabricated estimate of THIS
  // request's own resolved size, computed from the ACTUAL canonical
  // messages `buildMessagesForProvider` just produced (never a guess made
  // before the prompt exists). `~4 characters per token` is the same
  // standard approximation this project's own diagnostics have used since
  // Good enough to classify small/medium/large and to
  // compare against a provider's own verified ceiling (`model-catalog.ts`),
  // not offered as an exact token count. Computed for EVERY request now
  // (not just voice — Part 16 wants this as a general development
  // diagnostic), and threaded into the router below so it can actually
  // skip a structurally-incompatible endpoint instead of learning it via a
  // failed attempt.
  const approxChars = providerMessages.reduce((sum, message) => sum + message.content.length, 0);
  const estimatedInputTokens = Math.ceil(approxChars / 4);
  const contextBudget = classifyContextBudget(estimatedInputTokens);
  logContextSelection(category, contextNeeds, estimatedInputTokens, contextBudget, voiceRequestId);

  // T1: the canonical AURA request is now
  // fully constructed (context selected, images stripped, system prompt
  // options decided) — everything from here on is the router/provider's
  // own time, not this route's own request-preparation work.
  const t1 = Date.now();

  // BOTH paths
  // now run through the same `routeAURARequest`/`streamAURARequest`
  // functions (the router: 5 real endpoints — 3 independent Gemini
  // configs plus Groq/OpenRouter), never the legacy `chat-router.ts` chain
  // (still present, unused by this route — see that file's own updated
  // doc comment). `providerMessages` above (the context selection +
  // history/mission-window logic, both completely unchanged) is
  // passed through UNMODIFIED, exactly once, regardless of which path or
  // endpoint ultimately serves it (Part 9/10's central rule — verified
  // live this change
  // Verification" section). `providerId`/`model` from the client body are
  // no longer read here — provider/model selection is entirely the
  // router's job now ("the Operator controls how AURA is routed,"
  // not a per-message client field).
  if (!stream) {
    const requestId = newRequestId();
    try {
      const result = await routeAURARequest({ messages: providerMessages, temperature, capability, requestId, estimatedInputTokens }, { signal: request.signal });
      const t6 = Date.now();
      const firstFailure = result.attempts.find((attempt) => !attempt.success) ?? null;
      logRouterUsage(result.provider, result.model, result.usage);
      logFallbackIfAny(firstFailure?.provider ?? null, firstFailure?.failureReason ?? null, result.provider);
      logAttemptsIfVoice(voiceRequestId, result.attempts);
      // Non-streaming has no incremental
      // "first token": the whole response arrives as one atomic result, so
      // TTFT is genuinely not applicable here ("clearly
      // distinguish this from streaming TTFT" — never estimate one from
      // the other). `providerMs` covers T2→T6 (attempt start through
      // generation complete) in one measurement, since there's no
      // meaningful T3/T4/T5 split without incremental output.
      logLatency({
        requestId,
        capability,
        stream: false,
        prepMs: t1 - t0,
        providerMs: t6 - t1,
        ttftMs: "NOT APPLICABLE (non-streaming)",
        totalMs: t6 - t0,
        fallbackCount: result.fallbackCount,
        attemptCount: result.attempts.length,
        provider: result.provider,
        model: result.model,
        voiceRequestId,
      });
      return Response.json({
        // See `strip-hidden-reasoning.ts`'s own doc
        // comment: a real, live-observed safety net against a model
        // occasionally writing a literal `<think>...</think>` block as the
        // start of its own answer, despite the system prompt's existing
        // "never expose your reasoning" rule.
        content: stripLeadingThinkBlock(result.text),
        providerUsed: result.provider,
        fallbackFrom: firstFailure?.provider ?? null,
        fallbackReason: firstFailure?.failureReason ?? null,
      });
    } catch (error) {
      if (error instanceof AuraRouterAllFailedError) {
        logRouterAllFailed(error.attempts, voiceRequestId);
      } else {
        logProviderChainFailure(error);
      }
      return Response.json({ error: FARMER_FACING_FAILURE_MESSAGE }, { status: 502 });
    }
  }

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The ROOT CAUSE of an earlier change's reported
      // "streaming-drop race", found this change: a slow multi-attempt
      // fallback (endpoint #1 times out at the router's own per-attempt
      // bound, `ROUTER_ATTEMPT_TIMEOUT_MS.automatic` — see that constant's
      // own doc comment, `aura-router.ts` — #2 succeeds several more
      // seconds later) sends the client ZERO
      // bytes for the entire wait — a genuinely idle SSE connection for
      // 20+ seconds. Standard SSE practice (used by every production SSE
      // system for exactly this reason) is a periodic comment line
      // (`:...\n\n` — the SSE spec defines a line starting with `:` as an
      // ignorable comment, never delivered to the client's own `data:`
      // parser) so the connection is never truly idle regardless of which
      // layer — browser fetch, an intermediary proxy, Node's own HTTP
      // server — might otherwise decide an idle stream is dead. This
      // interval starts immediately and is cleared in the `finally` block
      // below, so it never outlives this one request. `HEARTBEAT_MS` is
      // set comfortably under the router's own per-attempt timeout
      // (`ROUTER_ATTEMPT_TIMEOUT_MS.automatic`, `aura-router.ts`) so at
      // least one heartbeat reaches the client during even a single slow
      // attempt, well before any real intermediary's own idle threshold
      // could plausibly be reached.
      const HEARTBEAT_MS = 8_000;
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, HEARTBEAT_MS);

      // An earlier change's defensive guard, kept: even with the heartbeat
      // fix above closing the actual gap that caused this, a genuine
      // client disconnect (farmer closes the tab, navigates away) remains
      // a real, unrelated scenario this must still handle safely — once
      // the client is gone there is nothing left to DELIVER regardless;
      // this only ensures that reality can never crash the route handler
      // or get logged as a confusing provider failure.
      let clientGone = false;
      function safeEnqueue(event: Record<string, unknown>): void {
        if (clientGone) return;
        try {
          controller.enqueue(sseChunk(event));
        } catch {
          clientGone = true;
          clearInterval(heartbeat);
        }
      }

      // Same safety net as the non-streaming
      // branch's `stripLeadingThinkBlock`, adapted for deltas arriving one
      // small chunk at a time (see `strip-hidden-reasoning.ts`'s own doc
      // comment on `createThinkBlockFilter` for exactly how).
      //
      // `.flush()` is called below the
      // moment generation is genuinely complete (both on success and on a
      // failure that happened after some deltas already arrived) — see
      // `ThinkBlockFilter.flush`'s own doc comment for exactly which real
      // bug this closes (a short complete reply being silently swallowed
      // forever, previously misdiagnosed as a "persistence" flake).
      // T2: the router attempt genuinely
      // begins (right as `streamAURARequest` is invoked, below). T4/T5 are
      // captured the FIRST time a delta reaches each respective point —
      // never re-measured on subsequent deltas — via `tFirstDeltaFromProvider`
      // (T4: the raw delta arrives from whichever adapter is streaming,
      // BEFORE the think-block filter decides anything) and
      // `tFirstDeltaDelivered` (T5: a delta actually reaches the outgoing
      // SSE stream, AFTER the filter — these two can differ by a few
      // characters' worth of buffering in the rare think-block-adjacent
      // case; reported separately rather than conflated, per Part 10's
      // "do not estimate TTFT from total latency"). Both stay `null` (never
      // a fabricated 0) if generation fails before ever yielding anything.
      const t2 = Date.now();
      let tFirstDeltaFromProvider: number | null = null;
      let tFirstDeltaDelivered: number | null = null;
      const thinkFilter = createThinkBlockFilter((delta) => {
        tFirstDeltaDelivered ??= Date.now();
        safeEnqueue({ delta });
      });
      const requestId = newRequestId();

      try {
        const result = await streamAURARequest(
          { messages: providerMessages, temperature, capability, requestId, estimatedInputTokens },
          {
            onDelta: (delta) => {
              tFirstDeltaFromProvider ??= Date.now();
              thinkFilter.onDelta(delta);
            },
          },
          { signal: request.signal },
        );
        thinkFilter.flush();
        const t6 = Date.now();
        logRouterUsage(result.provider, result.model, result.usage);
        logAttemptsIfVoice(voiceRequestId, result.attempts);
        const firstFailure = result.attempts.find((attempt) => !attempt.success) ?? null;
        if (firstFailure) {
          logFallbackIfAny(firstFailure.provider, firstFailure.failureReason, result.provider);
          // Part 22/23 — diagnostic metadata only, never a farmer-visible
          // message; the client's SSE parser reads `delta`/`error`/`done`
          // and silently ignores any other field.
          safeEnqueue({ fallbackFrom: firstFailure.provider, fallbackReason: firstFailure.failureReason, providerUsed: result.provider });
        }
        safeEnqueue({ done: true });
        logLatency({
          requestId,
          capability,
          stream: true,
          prepMs: t1 - t0,
          providerMs: t2 - t1,
          ttftServerMs: tFirstDeltaFromProvider !== null ? tFirstDeltaFromProvider - t2 : "NOT MEASURED (no delta ever received)",
          ttftDeliveredMs: tFirstDeltaDelivered !== null ? tFirstDeltaDelivered - t2 : "NOT MEASURED (no delta ever delivered)",
          generationMs: t6 - t2,
          totalMs: t6 - t0,
          fallbackCount: result.fallbackCount,
          attemptCount: result.attempts.length,
          provider: result.provider,
          model: result.model,
          voiceRequestId,
        });
      } catch (error) {
        thinkFilter.flush();
        if (error instanceof AuraRouterAllFailedError) {
          logRouterAllFailed(error.attempts, voiceRequestId);
        } else {
          logProviderChainFailure(error);
        }
        safeEnqueue({ error: FARMER_FACING_FAILURE_MESSAGE });
      } finally {
        clearInterval(heartbeat);
        if (!clientGone) {
          try {
            controller.close();
          } catch {
            // The client disconnected in the instant between our last
            // enqueue attempt and this close — nothing left to do.
          }
        }
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * The T0-T7 latency instrumentation
 * this change adds. Server-side-only (`console.info`), exactly like every
 * other diagnostic in this file (`logRouterUsage`, `logFallbackIfAny`,
 * `logContextSelection`) — Part 8's own rule ("never expose internal
 * diagnostics to the Farmer": provider, model, latency breakdown, attempt
 * count) means these fields are for Operator/Admin log inspection only,
 * never returned in any JSON/SSE payload this route sends. Two distinct
 * shapes rather than one loose bag of optional fields, so a non-streaming
 * request can never accidentally report a fabricated per-token TTFT and a
 * streaming request can never accidentally report the non-streaming
 * "not applicable" placeholder — Part 10/11's "clearly distinguish
 * streaming TTFT from non-streaming latency, never fabricate a number."
 */
interface NonStreamingLatencyLog {
  requestId: string;
  capability: AuraCapability;
  stream: false;
  prepMs: number;
  providerMs: number;
  ttftMs: string;
  totalMs: number;
  fallbackCount: number;
  attemptCount: number;
  provider: string;
  model: string;
  /** `null` for every non-voice request; see this file's own top-of-`POST` doc comment. */
  voiceRequestId?: string | null;
}

interface StreamingLatencyLog {
  requestId: string;
  capability: AuraCapability;
  stream: true;
  prepMs: number;
  providerMs: number;
  /** T4 minus T2 — first raw delta from the provider, before the think-block filter. A string only ever holds the literal "NOT MEASURED (...)" placeholder — never a fabricated number. */
  ttftServerMs: number | string;
  /** T5 minus T2 — first delta actually enqueued toward the client, after the think-block filter. Same NOT-MEASURED convention as `ttftServerMs`. */
  ttftDeliveredMs: number | string;
  generationMs: number;
  totalMs: number;
  fallbackCount: number;
  attemptCount: number;
  provider: string;
  model: string;
  voiceRequestId?: string | null;
}

function logLatency(entry: NonStreamingLatencyLog | StreamingLatencyLog): void {
  const base =
    `[AURA][latency] requestId=${entry.requestId} capability=${entry.capability} stream=${entry.stream} ` +
    `provider=${entry.provider} model=${entry.model} attempts=${entry.attemptCount} fallback=${entry.fallbackCount > 0 ? "yes" : "no"} ` +
    `prepMs=${entry.prepMs} providerMs=${entry.providerMs} totalMs=${entry.totalMs}${entry.voiceRequestId ? ` voiceRequestId=${entry.voiceRequestId}` : ""}`;
  if (entry.stream) {
    console.info(`${base} ttftServerMs=${entry.ttftServerMs} ttftDeliveredMs=${entry.ttftDeliveredMs} generationMs=${entry.generationMs}`);
  } else {
    console.info(`${base} ttftMs=${entry.ttftMs}`);
  }
}

/**
 * "if fallback occurs, record attempt
 * number, provider, model, failure category, duration" for EVERY attempt in
 * the chain, not just the first failure `logFallbackIfAny` already
 * surfaces. Only emitted for a voice-tagged request (Part 21: minimum
 * instrumentation, not a blanket verbosity increase on this route's very
 * high-volume normal traffic) and only reads the router's own existing
 * `attempts[]` array — never changes what the router tries or in what
 * order ("do NOT change fallback behavior; we are only
 * measuring it").
 */
function logAttemptsIfVoice(voiceRequestId: string | null, attempts: AuraRouterAttempt[]): void {
  if (!voiceRequestId || attempts.length <= 1) return;
  for (const [index, attempt] of attempts.entries()) {
    console.info(
      `[AURA][voice][timing] stage=aura-attempt voiceRequestId=${voiceRequestId} attempt=${index + 1} provider=${attempt.provider} ` +
        `model=${attempt.model} success=${attempt.success} failureReason=${attempt.failureReason ?? "n/a"} latencyMs=${attempt.latencyMs}`,
    );
  }
}

/** "record useful diagnostic metadata where the existing architecture supports it." No dedicated diagnostics store/UI exists yet (out of scope this change — Part 18), so this logs server-side (never to the client beyond the non-secret fields already in the JSON/SSE payload above) — visible in server logs for an Operator/Admin to inspect, never printing a key/token/credential. */
function logFallbackIfAny(fallbackFrom: string | null, fallbackReason: string | null, providerUsed: string): void {
  if (!fallbackFrom) return;
  console.info(`[AURA] provider fallback: ${fallbackFrom} -> ${providerUsed} (reason: ${fallbackReason})`);
}

/**
 * The before/after token-usage diagnostic the audit found
 * completely missing: every provider response's own reported usage now
 * reaches here (see each `*-provider.ts` file's own `extractUsage`) and is
 * logged server-side only, exactly like `logFallbackIfAny` above — never
 * returned to the client, never persisted, never containing a credential,
 * a message body, or any other sensitive value, only provider/model/token
 * counts. A field a specific response didn't report stays "n/a", never a
 * fabricated number. Shared by both the streaming and non-streaming router
 * paths — one function, not two.
 */
function logRouterUsage(provider: string, model: string, usage: ProviderUsage | null): void {
  const n = (value: number | null | undefined) => (value === null || value === undefined ? "n/a" : String(value));
  console.info(
    `[AURA][tokens] provider=${provider} model=${model} prompt=${n(usage?.promptTokens)} cached=${n(usage?.cachedTokens)} completion=${n(usage?.completionTokens)} total=${n(usage?.totalTokens)}`,
  );
}

/** Mirrors `logProviderChainFailure` below, but for the new router's structured all-endpoints-failed error — logs every attempt's endpoint/reason (never a key, never a raw response body), so a fully-failed chain is just as diagnosable as the legacy path's single final error. `voiceRequestId` is `null` for every non-voice request. */
function logRouterAllFailed(attempts: AuraRouterAttempt[], voiceRequestId: string | null = null): void {
  const summary = attempts.map((attempt) => `${attempt.endpointId}(${attempt.provider}):${attempt.failureReason ?? "unknown"}:${attempt.latencyMs}ms`).join(" -> ");
  console.error(`[AURA] router: all endpoints failed${voiceRequestId ? ` voiceRequestId=${voiceRequestId}` : ""}: ${summary || "no eligible endpoint"}`);
}

/**
 * A development-safe record of
 * WHICH context domains a given request actually included, alongside its
 * task category, so a before/after token measurement can be tied back
 * to what was actually sent, not
 * just the final token count. Same never-log-secrets discipline as
 * `logUsage`/`logFallbackIfAny` — only category names and booleans.
 */
/**
 * Part 8 — real, verified thresholds, not arbitrary round numbers: 3,500
 * comfortably clears Groq `allam-2-7b`'s real 4,096-token window with a
 * reply reserved; 7,000 comfortably clears the qwen/gpt-oss family's real,
 * live-reproduced 8,000-TPM account ceiling (`model-catalog.ts`'s own dated
 * note) with the same reserve. Anything above that is LARGE — genuinely
 * incompatible with every currently-configured Groq endpoint on this
 * account, regardless of which specific one.
 */
const CONTEXT_BUDGET_THRESHOLDS = { small: 3_500, medium: 7_000 } as const;

type ContextBudget = "small" | "medium" | "large";

function classifyContextBudget(estimatedInputTokens: number): ContextBudget {
  if (estimatedInputTokens <= CONTEXT_BUDGET_THRESHOLDS.small) return "small";
  if (estimatedInputTokens <= CONTEXT_BUDGET_THRESHOLDS.medium) return "medium";
  return "large";
}

/** Part 16 — "eligible provider families," derived from the SAME real catalog `aura-router.ts` itself consults (`findCatalogModel`), never a second/guessed source of truth. A provider family counts as eligible if ANY of its currently-available text models could take this request without a verified-ceiling rejection. */
function eligibleProviderFamilies(estimatedInputTokens: number): string[] {
  const RESERVE = 1_500;
  return AURA_MODEL_CATALOG.filter((entry) =>
    entry.models.some(
      (model) =>
        model.capabilities.includes("text") &&
        model.availability !== "unavailable" &&
        (model.contextWindowTokens === undefined || model.contextWindowTokens >= estimatedInputTokens + RESERVE),
    ),
  ).map((entry) => entry.provider);
}

function logContextSelection(
  category: string,
  needs: ReturnType<typeof classifyContextNeeds> | undefined,
  estimatedInputTokens: number,
  budget: ContextBudget,
  voiceRequestId: string | null,
): void {
  const voiceTag = voiceRequestId ? ` voiceRequestId=${voiceRequestId}` : "";
  if (!needs) {
    console.info(`[AURA][context] category=${category} needs=all (no last user message) estimatedInputTokens=${estimatedInputTokens} budget=${budget}${voiceTag}`);
    return;
  }
  const included = Object.entries(needs)
    .filter(([key, value]) => key !== "targetPlotLabel" && key !== "targetEntityName" && value === true)
    .map(([key]) => key);
  console.info(
    `[AURA][context] category=${category} included=[${included.join(",")}] targetPlot=${needs.targetPlotLabel ?? "none"} ` +
      `targetEntity=${needs.targetEntityName ?? "none"} estimatedInputTokens=${estimatedInputTokens} budget=${budget} ` +
      `eligibleProviders=[${eligibleProviderFamilies(estimatedInputTokens).join(",")}]${voiceTag}`,
  );
}

function streamSingleReply(text: string): Response {
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(sseChunk({ delta: text }));
      controller.enqueue(sseChunk({ done: true }));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * The streaming
 * twin of a plain JSON `{ error }` response, for the one case that can fail
 * before the router is ever reached (a rejected image attachment) but must
 * still speak the SSE protocol the client's `streamChatViaApi` already
 * expects when `stream: true` was requested. `message` is always one of
 * `image-validation.ts`'s own pre-written, farmer-safe strings.
 */
function streamSingleError(message: string): Response {
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(sseChunk({ error: message }));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * The ONE message ever sent to the client when EVERY provider
 * in the fallback chain has failed. Before this fix, this route forwarded
 * `error.message` straight through (`describeError`, below) — the exact
 * technical string a `*-provider.ts` file builds for its own diagnostic
 * classification (e.g. "Groq rejected the configured API key (401
 * Unauthorized — the key may be invalid or revoked.", a raw HTTP status, or
 * a provider name), never intended to be farmer-facing. That's real
 * "provider implementation error"/"API key error" leakage per this change's
 * own explicit rule, even though it never contained a literal secret value.
 * The full technical detail is still captured — see `logProviderChainFailure`
 * — just server-side only, exactly as `logFallbackIfAny` already logs a
 * successful fallback's own diagnostics.
 */
const FARMER_FACING_FAILURE_MESSAGE = "I'm having trouble connecting to my AI service right now. Please try again in a moment.";

/** Server-side-only diagnostic log for a fully-failed provider chain — never reaches the client (see `FARMER_FACING_FAILURE_MESSAGE` above). Never logs a request header/credential, only whatever message the failing provider/router already built. */
function logProviderChainFailure(error: unknown): void {
  const detail = error instanceof Error ? error.message : "AURA hit an unexpected error talking to the AI provider.";
  console.error(`[AURA] all providers failed: ${detail}`);
}
