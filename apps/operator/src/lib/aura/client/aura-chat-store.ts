"use client";

import { create } from "zustand";

import { executeAction, isActionable, resolveMissionClarification } from "../actions/action-executor";
import { usePendingActionStore } from "../actions/pending-action-store";
import { extractMostRecentPlotId, looksLikeInformationalQuestion, parseCommand } from "../commands/command-parser";
import { DEFAULT_IMAGE_ANALYSIS_QUESTION } from "../images/image-constraints";
import type { PreparedImageAttachment } from "../images/prepare-image-attachment";
import { classifyIntentViaApi } from "../intent/intent-client";
import { classifyTaskCategory, INTENT_CLASSIFIER_MODEL, selectModelForCategory } from "../routing/task-router";
import type { AuraContext, AuraMessage, AuraMissionRef } from "../types";
import type { ConversationLanguage } from "../voice/language-detection";
import { streamChatViaApi } from "./aura-api-client";
import { useAuraSettingsStore } from "./aura-settings-store";

export type AuraPanelView = "chat" | "settings";

interface AuraChatState {
  isOpen: boolean;
  view: AuraPanelView;
  messages: AuraMessage[];
  isStreaming: boolean;
  /**
   * Which real mission a
   * message's AURA Mission Card should render/subscribe to, keyed by
   * message id. Deliberately client-side, in-session-only state, never
   * persisted to the `AuraMessage` database row (see `AuraMissionRef`'s own
   * doc comment in `types.ts`) — a mission card is a live view over the
   * REAL mission stores, not a second record of mission state, so nothing
   * is lost of substance if it doesn't survive a reload: the mission itself
   * (and its permanent history once completed/cancelled) is entirely
   * unaffected, and the message's own plain-text content already says what
   * happened either way.
   */
  missionRefsByMessageId: Record<string, AuraMissionRef>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setView: (view: AuraPanelView) => void;
  /**
   * `extraHeaders` — OPTIONAL, forwarded verbatim to
   * `streamChatViaApi`'s own new optional parameter; every existing caller
   * (typed Farmer messages, the Operator floating panel, image sends) omits
   * it and is completely unaffected. Exists solely so `farmer-aura-page.tsx`
   * can tag a voice-originated send with its own `x-voice-request-id` for
   * cross-stage latency correlation, without this store needing to know
   * anything about voice at all.
   */
  /**
   * `imageResponseLanguage` — OPTIONAL, forwarded verbatim onto
   * the request body's own `imageResponseLanguage` field (only meaningful
   * alongside `image`; see `ChatRequestBody`'s own doc comment). Every
   * existing caller (typed text, voice, the Operator floating panel, and
   * every image send that predates this change) omits it and is
   * completely unaffected — same additive convention `extraHeaders` above
   * already established.
   */
  sendMessage: (
    text: string,
    context: AuraContext,
    image?: PreparedImageAttachment,
    extraHeaders?: Record<string, string>,
    imageResponseLanguage?: ConversationLanguage,
  ) => Promise<void>;
  clearConversation: () => void;
  /**
   * Replaces the in-memory transcript wholesale with a
   * conversation loaded from persistent storage (`aura-conversation-
   * store.ts`), e.g. opening a previous chat or restoring the active one
   * after a refresh. Distinct from `clearConversation` (which empties the
   * transcript for a brand-new chat) and from `sendMessage` (which only ever
   * appends) — this is the one place the whole array is replaced.
   */
  loadMessages: (messages: AuraMessage[]) => void;
  /**
   * Appends a plain assistant
   * message reporting the outcome of a mission-control action the farmer
   * triggered by clicking the Mission Card's own Pause/Resume/Cancel button
   * rather than typing it. Never calls a provider, never re-parses a
   * command — `AuraMissionCard` has already called the exact same
   * `pauseMissionById`/`resumeMissionById`/`cancelMissionById` the
   * corresponding TYPED command uses (Security rule 33: one execution
   * path), this only keeps the chat transcript a coherent, complete record
   * of what happened regardless of how the farmer triggered it.
   */
  appendAssistantNote: (content: string) => void;
}

let activeAbortController: AbortController | null = null;

/**
 * A one-shot signal, re-armed after ANY AURA reply (image-analysis or
 * plain conversational text) that itself ends by asking the farmer a
 * question — most commonly the image-diagnosis flow's own "is this
 * happening in your field?" followed later by "which crop is
 * affected?", but written generally rather than hardcoded to one
 * exact phrase (see `endsWithQuestion` below). The VERY NEXT plain-text
 * farmer reply is overwhelmingly likely to be answering THAT question
 * ("yes"/"no"/"my tomatoes"), not issuing a fresh natural-language
 * field-inspection report — but live testing found the existing LLM
 * intent-classifier fallback (`intent/intent-client.ts`, built for a
 * DIFFERENT purpose — detecting a genuine "there are bugs in field B"
 * report) sometimes misreads exactly that kind of reply as one, purely
 * because it mentions "field"/plausible farm vocabulary, and proposes an
 * unrelated field-inspection clarification instead of letting the reply
 * reach AURA as a normal conversational answer. This flag skips ONLY that
 * classifier fallback for the single next text turn — never the
 * deterministic command parser itself (still fully active, so a genuinely
 * unrelated real command right after an image still works), and never the
 * pending-action confirm/cancel path. Consumed (reset to false) the
 * instant the next text turn is sent, then re-armed again if THAT reply
 * also ends in a question — so a multi-turn "which crop? → which field?"
 * sequence stays protected turn by turn, without any persisted
 * or structured diagnosis-state object tracking the
 * conversation's "phase" explicitly.
 */
let awaitingFieldConfirmationReply = false;

/**
 * A lightweight, honest heuristic — not a claim about the reply's MEANING,
 * only its shape — used solely to decide whether the NEXT farmer message
 * should skip the intent-classifier fallback (see `awaitingFieldConfirmation
 * Reply` above). Checks the last ~200 characters for a "?" rather than
 * requiring the literal final character to be one — live testing found a
 * real reply often continues with a closing sentence AFTER its actual
 * question (e.g. "...currently appearing in your field? If so, let me know
 * which plot, and I can check for matching inspections."), which a strict
 * `endsWith("?")` would have missed entirely.
 */
function endsWithQuestion(content: string): boolean {
  return content.trim().slice(-200).includes("?");
}

function createMessage(role: AuraMessage["role"], content: string): AuraMessage {
  return { id: crypto.randomUUID(), role, content, createdAt: Date.now() };
}

/** Most-recent-first, deduplication happens downstream (`resolveActiveMissionAcrossStores`) — this just walks the transcript backward collecting every tagged ref it finds. */
function recentMissionRefsFrom(messages: AuraMessage[], refsByMessageId: Record<string, AuraMissionRef>): AuraMissionRef[] {
  const result: AuraMissionRef[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const ref = refsByMessageId[messages[i]!.id];
    if (ref) result.push(ref);
  }
  return result;
}

/** Orchestrates a single send: appends the user message and a placeholder assistant message, then streams deltas into that placeholder as they arrive. Provider/model/temperature/streaming preference come from `aura-settings-store` at send time, not baked into this store. */
export const useAuraChatStore = create<AuraChatState>((set, get) => ({
  isOpen: false,
  view: "chat",
  messages: [],
  isStreaming: false,
  missionRefsByMessageId: {},

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setView: (view) => set({ view }),

  clearConversation: () => {
    activeAbortController?.abort();
    set({ messages: [], isStreaming: false });
  },

  loadMessages: (messages) => {
    activeAbortController?.abort();
    // `missionRefsByMessageId` is deliberately NOT reset
    // here anymore. It's keyed by real, globally-unique message ids (the
    // same ids returned by `/api/aura/conversations/:id`, itself already
    // farm+user-scoped server-side — see that route's own doc comment), so
    // an entry left over from a DIFFERENT conversation can never be looked
    // up against THIS one's messages; it just sits there, inert, until
    // that original message is loaded again. Clearing the whole map on
    // every switch (the earlier behavior) meant a mission card
    // rendered once would silently revert to plain text the moment the
    // farmer switched to another conversation and back — a real bug this
    // phase's own "cards after conversation switching" test caught live.
    // Still never persisted past a full page reload (see `AuraMissionRef`'s
    // own doc comment in `types.ts` for why that remains a known, accepted
    // limitation, not fixed here).
    set({ messages, isStreaming: false });
  },

  appendAssistantNote: (content) => {
    const note = createMessage("assistant", content);
    set((state) => ({ messages: [...state.messages, note] }));
  },

  sendMessage: async (
    text: string,
    context: AuraContext,
    image?: PreparedImageAttachment,
    extraHeaders?: Record<string, string>,
    imageResponseLanguage?: ConversationLanguage,
  ) => {
    const trimmed = text.trim();
    if ((!trimmed && !image) || get().isStreaming) return;

    const settings = useAuraSettingsStore.getState();
    // Captured BEFORE the new user/assistant messages are appended below —
    // The pronoun fallback (see `hadPendingAction`/`parsedCommand`
    // just below) must only ever look at what was ACTUALLY said in earlier
    // turns, never at this message itself.
    const priorMessages = get().messages;
    // An image sent with no typed question gets this safe default instruction
    // as its actual message content, so what's PERSISTED, what's DISPLAYED
    // in the transcript, and what's actually ANALYZED are always the exact
    // same text — never a placeholder that diverges from the real request.
    const effectiveText = trimmed || (image ? DEFAULT_IMAGE_ANALYSIS_QUESTION : trimmed);
    const userMessage: AuraMessage = { ...createMessage("user", effectiveText), ...(image ? { image: { mimeType: image.mimeType, dataBase64: image.dataBase64 } } : {}) };
    const assistantMessage = createMessage("assistant", "");

    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      isStreaming: true,
    }));

    if (image) {
      // An image attachment is ALWAYS
      // sent straight to the real AURA Router as an image-capability
      // request. It deliberately never reaches deterministic command
      // parsing, pending-action resolution, or the LLM intent-classifier
      // fallback below (all three exist only to detect FIELD-OPERATION
      // commands in plain farmer text) — "no action execution" is
      // guaranteed by construction here: this path cannot reach any code
      // that dispatches a mission/robot/drone action, full stop.
      //
      // AURA Disease & Pest Intelligence
 // Conversation fix — because this branch skips the normal
      // "hadPendingAction → clear a stale proposal" guard below (the
      // rule: "a pending proposal must not survive an unrelated
      // intervening message"), an image upload must clear it here
      // instead — otherwise a stale mission-confirmation proposal from
      // BEFORE the image was sent could still be sitting there when the
      // farmer later replies "Yes"/"No" about the diagnosis (a PLAIN TEXT
      // follow-up, which DOES go through the normal command parser), and
      // that reply would be wrongly interpreted as confirming/cancelling
      // the old, unrelated proposal instead of reaching AURA as a real
      // reply about the field-confirmation question.
      usePendingActionStore.getState().clear();
      activeAbortController = new AbortController();

      function appendImageDelta(delta: string) {
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === assistantMessage.id ? { ...message, content: message.content + delta } : message,
          ),
        }));
      }

      try {
        await streamChatViaApi(
          {
            // Ignored server-side (Part 13 — "Operator routing must remain
            // authoritative"); the AURA Router alone decides the real
            // endpoint for an image request. Present only to satisfy
            // `ChatRequestBody`'s existing shape, unchanged for the text path.
            provider: "gemini",
            model: "gemini-3.6-flash",
            temperature: settings.temperature,
            stream: settings.streamingEnabled,
            messages: [...get().messages.filter((m) => m.id !== assistantMessage.id)],
            context,
            // The Farmer's explicit per-image-turn answer-language
            // choice, if one was made (see `ChatRequestBody.imageResponseLanguage`'s
            // own doc comment); `undefined` for every image send that predates
            // this change, in which case the server behaves exactly as it
            // did before (`context.preferredLanguage` alone decides).
            imageResponseLanguage,
          },
          appendImageDelta,
          activeAbortController.signal,
          extraHeaders,
        );
        // See `awaitingFieldConfirmationReply`'s own
        // doc comment above for exactly what this does and why.
        awaitingFieldConfirmationReply = endsWithQuestion(get().messages.find((m) => m.id === assistantMessage.id)?.content ?? "");
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "AURA hit an unexpected error.";
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === assistantMessage.id ? { ...message, content: message.content || `⚠️ ${messageText}` } : message,
          ),
        }));
      } finally {
        set({ isStreaming: false });
        activeAbortController = null;
      }
      return;
    }

    // Consume the one-shot flag NOW, for every
    // plain-text turn, regardless of what this turn turns out to be
    // (recognized command, pending-action reply, or a genuine question) —
    // it must never leak into a THIRD turn. `skipIntentClassifierThisTurn`
    // is used further below, at the one call site it actually guards.
    const skipIntentClassifierThisTurn = awaitingFieldConfirmationReply;
    awaitingFieldConfirmationReply = false;

    // Tried FIRST, before any other parsing: if AURA just asked "which
    // mission would you like me to pause?", this message gets one chance to
    // answer that specific question ("Field B.", "The drone.") before
    // anything else. Returns `null` (leaves the pending action untouched)
    // when this message doesn't unambiguously name one of the candidates —
    // the normal flow below then runs exactly as it would have otherwise,
    // including its own "clear a stale pending action" step just after this.
    const clarification = await resolveMissionClarification(trimmed, context.userRole);
    if (clarification) {
      set((state) => ({
        messages: state.messages.map((message) => (message.id === assistantMessage.id ? { ...message, content: clarification.message } : message)),
        missionRefsByMessageId: clarification.missionRef
          ? { ...state.missionRefsByMessageId, [assistantMessage.id]: clarification.missionRef }
          : state.missionRefsByMessageId,
        isStreaming: false,
      }));
      return;
    }

    // Action Layer: a recognized, executable command is
    // handled entirely here — real UI capabilities (camera, layers,
    // navigation) only exist client-side, so execution can't happen in the
    // API route. This never reaches the network or a provider. Anything
    // NOT actionable (unrecognized text, or a command the parser knows but
    // has no executor for yet) falls through unchanged to the existing
    // provider-call path below.
    // `context.currentPage` (already collected fresh for
    // every send, same `AuraContext` every other part of AURA reads) is the
    // one contextual signal `parseCommand` can safely use to resolve a
    // "create/start/stop a mission" phrase that names no vehicle kind at
    // all — see command-parser.ts's own doc comment on `ParserContext`.
    const hadPendingAction = usePendingActionStore.getState().hasPending();
    // Most-recently-named plot across the last few real turns
    // (most recent first), used only as `request-field-inspection`'s own
    // narrow pronoun fallback (see `command-parser.ts`'s doc comments on
    // `ParserContext.recentPlotId`/`extractMostRecentPlotId`).
    const recentPlotId = extractMostRecentPlotId(priorMessages.slice(-6).reverse().map((message) => message.content));
    // Every mission THIS
    // conversation has dispatched and tagged so far, most-recent-first (see
    // `missionRefsByMessageId`/`recentMissionRefsFrom` above) — the raw
    // candidate list `resolveActiveMissionAcrossStores` (action-executor.ts)
    // narrows down for a pronoun-style mission-control request.
    const recentMissionRefs = recentMissionRefsFrom(priorMessages, get().missionRefsByMessageId);
    const parsedCommand = parseCommand(trimmed, {
      currentPage: context.currentPage,
      hasPendingAction: hadPendingAction,
      recentPlotId,
      recentMissionRefs,
    });

    // a pending proposal ("Rover 02 is available — would you like me to
    // send it?") must not survive an unrelated intervening message. Before
    // this fix, the ONLY expiry was the 5-minute TTL in
    // `pending-action-store.ts` — a farmer who asked "What's the weather?"
    // (or anything else) in between, then later sent a bare "yes" within
    // that window, would have silently confirmed the STALE proposal. Only
    // an IMMEDIATE confirm/cancel reply may act on a pending proposal now;
    // any other message (including a brand-new action request, which
    // proposes its own new pending action below) clears it first.
    //
    // "Use the drone instead." is ALSO an immediate reply to
    // the pending proposal (not an unrelated new message), so it needs the
    // same exemption confirm/cancel already have: `resolveVehicleOverride`
    // (action-executor.ts) reads this exact pending action to re-resolve it
    // with the new vehicle preference. Without this, the guard above would
    // clear the proposal a heartbeat before the override handler ever saw
    // it, and every override would fail with "I don't have a pending
    // mission proposal to change the vehicle for" — live-tested and fixed
    // ().
    if (
      hadPendingAction &&
      parsedCommand.commandId !== "confirm-pending-action" &&
      parsedCommand.commandId !== "cancel-pending-action" &&
      parsedCommand.commandId !== "override-pending-vehicle"
    ) {
      usePendingActionStore.getState().clear();
    }

    if (isActionable(parsedCommand.commandId)) {
      // AURA Natural-Language-Actions phase — `executeAction` is now async
      // (mission-creation cases await a real backend-persistence
      // verification before ever claiming success — see that function's own
      // doc comment). `isStreaming` stays true for the whole await, which
      // also disables the ChatInput's send button for the duration — the
      // same re-entrancy guard at the top of this function (`get().isStreaming`)
      // means a rapid double-submit can't run this twice concurrently.
      const result = await executeAction(parsedCommand, context.userRole);
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === assistantMessage.id ? { ...message, content: result.message } : message,
        ),
        // Tags this exact reply with the real mission a
        // successful dispatch created, so `AuraMissionCard` can render next
        // to it and so a LATER pronoun reference ("Pause it.") can find it
        // again via `recentMissionRefsFrom` above.
        missionRefsByMessageId: result.missionRef
          ? { ...state.missionRefsByMessageId, [assistantMessage.id]: result.missionRef }
          : state.missionRefsByMessageId,
        isStreaming: false,
      }));
      return;
    }

    // AURA Intelligence phase, Parts 2–4 — the LLM intent-classifier
    // fallback: only attempted when the deterministic parser found NOTHING
    // ("deterministic-first" order) and the message doesn't look
    // like a plain informational question (those already get a real,
    // context-grounded answer from the conversational path below — running
    // classification first would only add latency/cost for no benefit, per
    // Part 26). A short, low-signal message ("ok", "thanks") is skipped for
    // the same efficiency reason — it's exceedingly unlikely to be a field-
    // inspection request the deterministic parser would have missed.
    //
    // The classifier's own output is UNTRUSTED (see `intent-classifier.ts`'s
    // doc comment) — it is converted into the SAME `commandId:
    // "request-field-inspection"` shape the deterministic parser already
    // produces and passed through the EXACT SAME `executeAction` call above,
    // never a separate execution path.
    //
    // Also skipped when `skipIntentClassifierThisTurn`
    // is set (see that flag's own doc comment): a reply to AURA's own
    // "is this happening in your field?" question naturally mentions
    // "field" without being a genuine field-inspection report, which this
    // classifier was never designed to distinguish.
    if (!skipIntentClassifierThisTurn && !parsedCommand.recognized && !looksLikeInformationalQuestion(trimmed) && trimmed.split(/\s+/).length >= 3) {
      const classified = await classifyIntentViaApi(
        trimmed,
        context.plots.map((plot) => plot.label),
        get().messages.filter((m) => m.id !== assistantMessage.id && m.id !== userMessage.id),
        INTENT_CLASSIFIER_MODEL.provider,
        INTENT_CLASSIFIER_MODEL.model,
      );
      if (classified?.isFieldInspectionRequest) {
        const result = await executeAction(
          {
            recognized: true,
            commandId: "request-field-inspection",
            label: "Request Field Inspection",
            params: {
              requestedPlotLabel: classified.targetPlotLabel ?? undefined,
              reportedProblemKeyword: classified.problemKeyword ?? undefined,
              requestedVehicleKind: classified.preferredVehicleKind ?? undefined,
            },
          },
          context.userRole,
        );
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === assistantMessage.id ? { ...message, content: result.message } : message,
          ),
          missionRefsByMessageId: result.missionRef
            ? { ...state.missionRefsByMessageId, [assistantMessage.id]: result.missionRef }
            : state.missionRefsByMessageId,
          isStreaming: false,
        }));
        return;
      }
    }

    activeAbortController = new AbortController();

    function appendDelta(delta: string) {
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === assistantMessage.id ? { ...message, content: message.content + delta } : message,
        ),
      }));
    }

    // AURA Intelligence, Model Routing & Reasoning phase, Sections 4–6 — the
    // task router (benchmark-driven, see that file's own doc comment)
    // chooses provider/model for this specific question's category,
    // REPLACING a blind read of the Farmer/Operator's own AURA Settings
    // selection for the automatic send path. Settings' provider/model
    // picker is untouched (still fully functional UI/store) but is no
    // longer what an automatic send uses — this is an intentional
    // architectural change the spec requires ("AURA Router →
    // Task Classification → Appropriate provider/model"), not an
    // oversight. `temperature`/`streamingEnabled` remain genuine user
    // preferences, unrelated to routing, and are still read from Settings.
    // `chatWithFallback`/`streamChatWithFallback` (unchanged)
    // still transparently fall back to OpenRouter if the router's chosen
    // Groq model fails — routing picks the STARTING provider/model, never
    // replaces the existing fallback chain.
    const category = classifyTaskCategory(trimmed);
    const routed = selectModelForCategory(category);

    try {
      await streamChatViaApi(
        {
          provider: routed.provider,
          model: routed.model,
          temperature: settings.temperature,
          stream: settings.streamingEnabled,
          messages: [...get().messages.filter((m) => m.id !== assistantMessage.id)],
          context,
        },
        appendDelta,
        activeAbortController.signal,
        extraHeaders,
      );
      // See `awaitingFieldConfirmationReply`'s own
      // doc comment above: a plain conversational reply (e.g. continuing a
      // diagnosis conversation with "which crop is affected?") re-arms the
      // same protection for the farmer's next reply, exactly like an image
      // analysis's own closing question already does.
      awaitingFieldConfirmationReply = endsWithQuestion(get().messages.find((m) => m.id === assistantMessage.id)?.content ?? "");
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "AURA hit an unexpected error.";
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === assistantMessage.id
            ? { ...message, content: message.content || `⚠️ ${messageText}` }
            : message,
        ),
      }));
    } finally {
      set({ isStreaming: false });
      activeAbortController = null;
    }
  },
}));
