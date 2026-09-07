"use client";

import { useEffect, useRef, useState } from "react";
import { History, Play, Sparkles, Square, Trash2, Volume2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  cn,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Typography,
} from "@agrinexus/ui";

import { AuraHistoryPanel } from "@/components/farmer/aura/aura-history-panel";
import { FARMER_CONTENT_WIDTH, useFarmerThemeRoot } from "@/components/farmer/farmer-shell";
import { ChatInput } from "@/components/aura/chat/chat-input";
import { MessageList } from "@/components/aura/chat/message-list";
import type { VoiceRecordingTimings } from "@/components/aura/chat/voice-recorder-button";
import { useAuraChatStore } from "@/lib/aura/client/aura-chat-store";
import { useCollectAuraContext } from "@/lib/aura/context/collect-context";
import { useAuraConversationStore } from "@/lib/aura/conversations/aura-conversation-store";
import { useHydrateAuraDataStores } from "@/lib/aura/hydrate-stores";
import { DEFAULT_IMAGE_ANALYSIS_QUESTION } from "@/lib/aura/images/image-constraints";
import type { PreparedImageAttachment } from "@/lib/aura/images/prepare-image-attachment";
import { conversationLanguageLabel, detectTextLanguage, type ConversationLanguage } from "@/lib/aura/voice/language-detection";
import { VOICE_REQUEST_ID_HEADER, type VoiceClientTimings } from "@/lib/aura/voice/voice-timing";
import { useFarmerTranslation } from "@/lib/farmer/i18n/use-farmer-translation";

/**
 * A full-page presentation of AURA for the Farmer
 * section, built from the SAME pieces the Operator floating panel uses
 * (`useAuraChatStore`, `useCollectAuraContext`, `MessageList`, `ChatInput`)
 * rather than a second chat implementation. Both surfaces share one
 * conversation/provider/context pipeline — opening AURA from Farmer and
 * from Operator (for a multi-role account) is the same assistant, same
 * history, just a different frame around it.
 *
 * Persistence is layered on top here (not inside
 * `useAuraChatStore`, which Operator's floating panel also uses and must not
 * regress): `useAuraConversationStore` owns the real database-backed
 * conversation list, and `handleSend` persists each turn around the
 * existing, unmodified send pipeline.
 */
export function FarmerAuraPage() {
  // The one place this
  // page's own visible strings, and the strings handed down to the shared
  // ChatInput/MessageList/VoiceRecorderButton components (via their
  // optional override props — see each component's own doc comment on why
  // that's additive-only and never touches the Operator floating panel),
  // are resolved from the EXISTING `displayLanguage` preference.
  const { t, dir } = useFarmerTranslation();
  // The Farmer shell's
  // own `.farmer-theme`/`.farmer-theme.dark` root DOM node, passed as the
  // History Drawer's portal `container` below so it mounts INSIDE Farmer's
  // themed subtree instead of `document.body`, resolving Farmer's own
  // light/dark tokens instead of Operator's global ones. `null` until the
  // shell has mounted; `DrawerContent`/Radix's Portal falls back to
  // `document.body` for that brief window, same as before this fix.
  const farmerThemeRoot = useFarmerThemeRoot();
  // This ref ORIGINALLY hinted the NEXT recording with the
  // CONVERSATION's own last-detected language. Live testing — via this
  // exact multi-turn scenario — found that this carry-forward hint broke a
  // genuine language SWITCH: after an English turn set the ref to "en",
  // the Farmer's very next Urdu utterance was sent to Whisper WITH an
  // explicit `language: "en"` hint (inherited from the PREVIOUS, unrelated
  // turn), which forced an incorrect English transcription of real Urdu
  // speech — a direct violation of this product's own locked "each turn
  // determines its own language, independent of the last" requirement.
  //
  // Fix: `voiceLanguage` is now ALWAYS `undefined` — every voice turn
  // discovers its language completely fresh, exactly like every typed-text
  // turn already does via `detectTextLanguage`. This is safe for Urdu
  // specifically (previously the whole reason a hint was carried forward)
  // because `/api/aura/voice/transcribe/route.ts` now has its OWN,
  // per-request cold-start recovery: a hint-free request
  // that comes back ambiguous (unsupported language + Devanagari script)
  // automatically retries once with an explicit Urdu hint before ever
  // reaching this component — so no CLIENT-side memory of "what language
  // was last used" is needed for correctness, only for (now-removed, since
  // it caused a real bug) convenience.
  const voiceLanguage: ConversationLanguage | undefined = undefined;
  const { messages, isStreaming, sendMessage } = useAuraChatStore();
  const collectContext = useCollectAuraContext();
  useHydrateAuraDataStores();

  const fetchConversations = useAuraConversationStore((state) => state.fetchConversations);
  const restoreActiveConversation = useAuraConversationStore((state) => state.restoreActiveConversation);
  const startNewChat = useAuraConversationStore((state) => state.startNewChat);
  const persistUserTurn = useAuraConversationStore((state) => state.persistUserTurn);
  const persistAssistantTurn = useAuraConversationStore((state) => state.persistAssistantTurn);

  useEffect(() => {
    void fetchConversations();
    // For "refresh without losing the conversation" — zustand's
    // `persist` middleware rehydrates `activeConversationId` from
    // localStorage ASYNCHRONOUSLY (it isn't available yet on this first
    // render, only after a microtask following mount). Restoring
    // immediately would almost always see the pre-hydration `null` and
    // silently skip restoration. `persist.hasHydrated()`/`onFinishHydration`
    // are zustand's own APIs for this exact race.
    if (useAuraConversationStore.persist.hasHydrated()) {
      void restoreActiveConversation();
    } else {
      const unsubscribe = useAuraConversationStore.persist.onFinishHydration(() => {
        void restoreActiveConversation();
      });
      return unsubscribe;
    }
  }, [fetchConversations, restoreActiveConversation]);

  /**
   * Sends a message through the existing, unmodified AURA pipeline,
   * persisting both sides of the turn into the active (or newly-created)
   * conversation. Shared by the ChatInput's normal send path and the "Ask
   * AURA about this" auto-send below, so every real message a Farmer sends
   * — however it was triggered — ends up in real chat history.
   *
   * An `image` is passed straight through to `sendMessage` (which attaches it
   * to the canonical request) but is deliberately NEVER itself persisted —
   * `persistUserTurn` only ever stores the TEXT `useAuraChatStore.sendMessage`
   * ends up using (the Farmer's own question, or the safe default
   * instruction it substitutes for an image with no typed question — see
   * that function's own doc comment). This repo's `AuraMessage` database
   * model has no field for image data at all (checked before writing this
   * — `schema.prisma`'s `AuraMessage` is `{id, conversationId, role,
   * content, createdAt}` only), and this change deliberately doesn't add
   * one ("do not introduce permanent image storage/schema
   * changes unless truly required" — a documented, disclosed limitation:
   * reopening a past conversation shows the question and AURA's real
   * answer, never the original photo).
   *
   * Ordering is unchanged from the pre-existing text-only flow (persist
   * the user's turn, THEN send) — an image attachment only adds the same
   * "substitute the default instruction when no question was typed" logic
   * `useAuraChatStore.sendMessage` independently applies, computed once
   * here from the identical shared constant so what's persisted and what's
   * actually sent can never diverge.
   *
   * A REAL race found this change (via
   * live testing, not just code review): `isStreaming` (from
   * `useAuraChatStore`, below) only covers `sendMessage`'s own generation
   * call — it flips back to `false` the instant the reply finishes
   * streaming, which is BEFORE this function's own trailing
   * `persistAssistantTurn` call has resolved. Since `ChatInput` used to be
   * disabled by `isStreaming` alone, that gap left a real window where the
   * Farmer could send a second message while the first turn's assistant
   * reply was still being written to the database — reproduced live this
   * phase as two farmer messages persisting back-to-back with neither
   * assistant reply between them yet, only after both (an out-of-order
   * transcript, not a lost message: nothing was silently dropped, but the
   * turns landed in the wrong order — a real, distinct bug from the
   * `strip-hidden-reasoning.ts` swallow that a related fix also addressed).
   * `isPersisting` covers this function's ENTIRE lifetime (both persistence
   * calls plus the send itself), so the input stays disabled for the whole
   * real round trip, not just the generation portion of it.
   */
  const [isPersisting, setIsPersisting] = useState(false);

  /**
   * Returns the assistant's final text on success (or `null` if generation
   * never produced one) — an earlier change's voice flow uses this to know what
   * to hand to text-to-speech; the pre-existing typed-message callers
   * simply ignore the return value.
   *
   * `firstResponseAt` (also new, also ignored by every non-voice caller) is
   * this turn's real "AURA time-to-first-response" timestamp, measured
   * WITHOUT touching `useAuraChatStore.sendMessage`'s own internals (shared
   * with the Operator floating panel — Part 21's "prefer modifying only
   * files directly related to... timing instrumentation"): a store
   * subscription set up immediately before calling `sendMessage` watches
   * for the freshly-appended assistant placeholder's `content` transitioning
   * from empty to non-empty for the first time — true the instant either a
   * streamed delta or a complete non-streaming reply first lands, whichever
   * this send actually used. `null` when the reply never produced visible
   * content at all before the turn finished (e.g. a deterministic
   * mission-command reply, or a genuine failure) — never fabricated as
   * "equal to `aura_complete`," which Part 5 explicitly asks this change
   * to avoid conflating.
   */
  async function sendAndPersist(
    text: string,
    image?: PreparedImageAttachment,
    extraHeaders?: Record<string, string>,
    // Set ONLY by `handleVoiceTranscript` below,
    // from that turn's own real STT `detectedLanguage`. Every typed-message
    // caller omits this, so the text detector is what decides
    // their turn's language instead.
    voiceDetectedLanguage?: ConversationLanguage,
    // Set ONLY by
    // `handleSend` below, from `ChatInput`'s own language picker, and ONLY
    // ever alongside an `image`. Deliberately NOT folded into `context.
    // preferredLanguage` here (unlike `voiceDetectedLanguage`/`turnLanguage`
    // just below) — this stays a completely separate, explicit field on the
    // request body (see `sendMessage`'s own doc comment) so the server can
    // independently validate it before it's allowed to override
    // anything, and so this function's existing per-turn automatic-detection
    // line immediately below needs ZERO changes for either turn kind.
    imageResponseLanguage?: ConversationLanguage,
  ): Promise<{ text: string | null; firstResponseAt: number | null }> {
    setIsPersisting(true);
    let firstResponseAt: number | null = null;
    const messageCountBefore = useAuraChatStore.getState().messages.length;
    const unsubscribe = useAuraChatStore.subscribe((state) => {
      if (firstResponseAt !== null) return;
      if (state.messages.length <= messageCountBefore) return;
      const last = state.messages.at(-1);
      if (last?.role === "assistant" && last.content) firstResponseAt = performance.now();
    });
    try {
      const trimmed = text.trim();
      const effectiveText = trimmed || (image ? DEFAULT_IMAGE_ANALYSIS_QUESTION : trimmed);
      // The one place a turn's CONVERSATION language
      // is decided: the real STT detection for a voice turn (already
      // normalized, already the model's own judgment of the actual audio),
      // falling back to the same script-aware text detector (Phase E) for
      // every typed turn — and, for a voice turn where STT reported nothing
      // usable, applied to the transcript text itself as a safe fallback.
      // This value has PRIORITY over the persisted `auraLanguage` setting
      // for this exact turn (the locked requirement) —
      // `collectContext()` below still computes its own `preferredLanguage`
      // from `auraLanguage` first, exactly as before, and this simply
      // overrides it for this one request, never touching
      // `collect-context.ts`/`prompt-builder.ts` themselves.
      const turnLanguage: ConversationLanguage = voiceDetectedLanguage ?? detectTextLanguage(effectiveText);
      const context = collectContext();
      context.preferredLanguage = conversationLanguageLabel(turnLanguage);
      await persistUserTurn(effectiveText);
      await sendMessage(effectiveText, context, image, extraHeaders, imageResponseLanguage);
      const lastMessage = useAuraChatStore.getState().messages.at(-1);
      if (lastMessage?.role === "assistant" && lastMessage.content) {
        await persistAssistantTurn(lastMessage.content);
        return { text: lastMessage.content, firstResponseAt };
      }
      return { text: null, firstResponseAt };
    } finally {
      unsubscribe();
      setIsPersisting(false);
    }
  }

  // `imageResponseLanguage` arrives from `ChatInput`'s own
  // language picker, set ONLY alongside `image` (see that component's own
  // doc comment on why the picker only ever renders when an image is
  // attached, and why Send stays disabled until a choice is made).
  function handleSend(text: string, image?: PreparedImageAttachment, imageResponseLanguage?: ConversationLanguage) {
    void sendAndPersist(text, image, undefined, undefined, imageResponseLanguage);
  }

  /**
   * The full voice round trip's
   * back half: `VoiceRecorderButton` already turned the recording into a
   * transcript (speech-to-text) and handed it here. From this point on the
   * transcript is treated as a COMPLETELY NORMAL AURA message — the exact
   * same `sendAndPersist` every typed message already goes through, so it
   * inherits conversation history, farm context, task routing, image
   * context, deterministic actions, and farm isolation with zero special
   * casing (Part "AURA RESPONSE": "Do not create a separate voice
   * conversation database" — there isn't one; this is the same
   * conversation a typed follow-up would land in).
   *
   * Only once that completes does this reach for text-to-speech, and only
   * for the reply to THIS voice-originated turn — typing a message never
   * triggers audio playback, matching the spec's own voice-round-trip
   * framing rather than reading every AURA reply aloud unconditionally.
   * Part "TTS": a synthesis failure NEVER surfaces as an AURA error — the
   * text reply is already rendered and complete either way, so a failed
   * `speakText` call never touches it; it only ever affects this row's own
   * small voice-status indicator.
   *
   * `blocked` is a REAL, distinct state from `idle`: some browsers'
   * autoplay policy can reject `audio.play()` when it's called after an
   * `await` chain far enough removed from the original tap that the
   * browser no longer considers it "still within a user gesture" (Safari
   * in particular is strict about this). Before this change, that rejection
   * was silently swallowed into the same generic `idle` state as "nothing
   * to play" — indistinguishable from a genuine TTS failure, and the
   * Farmer had no way to actually hear a reply that WAS ready. Now a
   * blocked reply stays queued (`lastSpokenAudioUrl` keeps the real,
   * already-fetched audio) and the visible Replay control becomes a real
   * "Tap to hear AURA" affordance — tapping IT is a fresh user gesture,
   * which every browser's autoplay policy accepts.
   */
  // Below `lg`, the
  // permanent 256px History rail (see the render below) is hidden rather
  // than shown at a squeezed width, per that milestone's own root-cause
  // finding: `AuraHistoryPanel`'s `w-64 shrink-0` has no responsive variant
  // at all today, so on a 390-412px phone it was consuming roughly 2/3 of
  // the entire viewport, leaving the actual conversation almost no room.
  // This is PURELY a "which of two already-rendered UI pieces is visible"
  // toggle, driven by a tap on the mobile-only history-trigger button in
  // the header below — never touches conversation persistence, AURA
  // routing, or any store this page didn't already use.
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);

  const [speakingState, setSpeakingState] = useState<"idle" | "loading" | "playing" | "blocked">("idle");
  const [lastSpokenAudioUrl, setLastSpokenAudioUrl] = useState<string | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  function revokePendingObjectUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  useEffect(() => () => revokePendingObjectUrl(), []);

  /** `browser_play_start`/`browser_play_error`, returned rather than only reflected in `speakingState` so a voice-originated call can fold them into that turn's own diagnostic record. */
  async function playAudioUrl(audioUrl: string): Promise<{ browser_play_start: number | null; browser_play_error: string | null }> {
    audioElementRef.current?.pause();
    const audio = new Audio(audioUrl);
    audioElementRef.current = audio;
    audio.onended = () => setSpeakingState("idle");
    audio.onerror = () => setSpeakingState("idle");
    // Part 6 — a rejected `play()` promise is NEVER swallowed: the browser
    // tells us exactly why (an autoplay-policy `NotAllowedError`, or a
    // genuine decode/`NotSupportedError` on the audio itself) and the
    // Farmer sees a real, distinct state either way instead of silence
    // that looks identical to "nothing happened."
    try {
      await audio.play();
      setSpeakingState("playing");
      return { browser_play_start: performance.now(), browser_play_error: null };
    } catch (error) {
      const isAutoplayBlocked = error instanceof DOMException && error.name === "NotAllowedError";
      setSpeakingState(isAutoplayBlocked ? "blocked" : "idle");
      const message = error instanceof Error ? error.message : String(error);
      if (!isAutoplayBlocked) {
        console.error("[AURA][voice] browser could not play the returned audio:", message);
      }
      return { browser_play_start: null, browser_play_error: message };
    }
  }

  /** `voiceRequestId`, when provided, rides on the `/api/aura/voice/speak` request as the `x-voice-request-id` header (Part "the id must follow the request through the pipeline where technically possible") and the return value carries this leg's own timing for the caller to fold into one diagnostic record; a typed (non-voice) reply never passes it and the function behaves exactly as before. */
  async function speakText(
    text: string,
    voiceRequestId?: string,
  ): Promise<{ tts_request_start: number; tts_complete: number; browser_play_start: number | null; browser_play_error: string | null }> {
    setSpeakingState("loading");
    const tts_request_start = performance.now();
    try {
      const response = await fetch("/api/aura/voice/speak", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(voiceRequestId ? { [VOICE_REQUEST_ID_HEADER]: voiceRequestId } : {}),
        },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        // Part "TTS": keep the text response, never treat this as an AURA
        // failure — simply don't play anything.
        setSpeakingState("idle");
        return { tts_request_start, tts_complete: performance.now(), browser_play_start: null, browser_play_error: null };
      }
      const data = await response.json();
      const tts_complete = performance.now();
      // Part 6 — a real Blob + object URL, not a raw `data:` URI: this
      // project's real Gemini TTS replies run 100–250 KB of base64 (a full
      // AURA sentence or two), and a Blob is the standard, memory-clean way
      // the browser itself already recommends for audio of that size,
      // revoked (`revokePendingObjectUrl`) the moment it's no longer
      // needed rather than left to leak for the rest of the page's life.
      const bytes = Uint8Array.from(atob(data.audioBase64), (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: data.mimeType });
      revokePendingObjectUrl();
      const audioUrl = URL.createObjectURL(blob);
      objectUrlRef.current = audioUrl;
      setLastSpokenAudioUrl(audioUrl);
      const playResult = await playAudioUrl(audioUrl);
      return { tts_request_start, tts_complete, ...playResult };
    } catch (error) {
      setSpeakingState("idle");
      console.error("[AURA][voice] could not prepare AURA's spoken reply:", error instanceof Error ? error.message : error);
      return { tts_request_start, tts_complete: performance.now(), browser_play_start: null, browser_play_error: null };
    }
  }

  function stopSpeaking() {
    audioElementRef.current?.pause();
    setSpeakingState("idle");
  }

  function replayLastSpoken() {
    if (lastSpokenAudioUrl) void playAudioUrl(lastSpokenAudioUrl);
  }

  /**
   * The ONE
   * place every stage of a single voice interaction's timing is assembled
   * and logged together, tagged with `sttTimings.voiceRequestId` (Part 3's
   * own "single request correlation ID"). Purely additive diagnostic
   * logging around the EXACT same STT→AURA→TTS→playback calls this
   * function already made before this change — no behavior change.
   */
  async function handleVoiceTranscript(transcript: string, sttTimings: VoiceRecordingTimings) {
    const aura_request_start = performance.now();
    const { text: assistantText, firstResponseAt } = await sendAndPersist(
      transcript,
      undefined,
      { [VOICE_REQUEST_ID_HEADER]: sttTimings.voiceRequestId },
      sttTimings.detectedLanguage,
    );
    const aura_complete = performance.now();

    let ttsTiming: { tts_request_start: number; tts_complete: number; browser_play_start: number | null; browser_play_error: string | null } | null = null;
    if (assistantText) {
      ttsTiming = await speakText(assistantText, sttTimings.voiceRequestId);
    }

    const timings: VoiceClientTimings = {
      voiceRequestId: sttTimings.voiceRequestId,
      recording_start: sttTimings.recording_start,
      recording_stop: sttTimings.recording_stop,
      stt_request_start: sttTimings.stt_request_start,
      stt_request_complete: sttTimings.stt_request_complete,
      aura_request_start,
      aura_first_response: firstResponseAt,
      aura_complete,
      tts_request_start: ttsTiming?.tts_request_start ?? aura_complete,
      tts_complete: ttsTiming?.tts_complete ?? aura_complete,
      browser_play_start: ttsTiming?.browser_play_start ?? null,
      browser_play_error: ttsTiming?.browser_play_error ?? null,
    };
    // Part "OUTPUT" — one structured, greppable client-side log line per
    // voice interaction; correlated with the server's own
    // `[AURA][voice][timing]` lines (chat/transcribe/speak routes) by this
    // same `voiceRequestId` during live diagnostic testing. Never contains
    // the transcript or the assistant's reply text — timestamps only.
    console.info(`[AURA][voice][client-timing] ${JSON.stringify(timings)}`);
  }

  // "Ask AURA about this" from the
  // Farmer Digital Twin's details panel navigates here with `?ask=1`
  // (`details-panel.tsx`'s `handleAskAuraAboutFinding`); the finding that
  // was selected there is still available (it lives in the global
  // `useLiveContextStore`, not component state that navigation would
  // unmount), so the deterministic "handle-selected-finding" command and
  // AURA's own context can both resolve it exactly as if the Farmer had
  // typed the question themselves. Fires at most once per navigation (the
  // ref guards Strict Mode's double-invoke in dev, and the query param is
  // stripped right after so a later refresh never re-sends it).
  const router = useRouter();
  const searchParams = useSearchParams();
  const askOnMount = searchParams.get("ask") === "1";
  const hasAutoSent = useRef(false);

  useEffect(() => {
    if (!askOnMount || hasAutoSent.current) return;
    hasAutoSent.current = true;
    router.replace("/farmer/aura");
    // This always starts a NEW conversation rather than appending
    // to whatever was previously active/restored: a Digital-Twin-triggered
    // question is a fresh topic, not a continuation of an unrelated earlier
    // chat the Farmer happened to have open.
    startNewChat();
    void sendAndPersist("What's wrong with this issue, and can it be handled automatically?");
    // Deliberately NOT depending on `collectContext`/`sendAndPersist` (both
    // reconstructed every render) — this must run exactly once for this
    // navigation, guarded by `hasAutoSent` above, not re-run whenever
    // either identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askOnMount]);

  return (
    // The "wide" tier (same as Dashboard, see `farmer-shell.tsx`'s
    // own doc comment) recovers the desktop width the audit found this page
    // trapped inside (MVP-UI.1-A audit) — layout-only, no AURA logic touched.
    //
    // `dir="ltr"` HERE is the fix for
    // "AURA History moves to the right in Urdu." Root cause (see that
    // milestone's own report): this row has no `dir` of its own, so it
    // inherited `dir="rtl"` from the Farmer shell whenever the App Language
    // is Urdu; a plain `flex` row's main-axis direction follows `dir`, so
    // the DOM order (History, then Chat) rendered History-right/Chat-left
    // under Urdu — an accidental side effect of ambient inheritance, never
    // an intentional design. Per the locked rule ("RTL
    // changes language flow, not product architecture"), the WORKSPACE
    // structure (History permanently left, Chat permanently right) is
    // pinned to `ltr` explicitly and unconditionally here, while the
    // CONVERSATIONAL content beneath it (message bubbles, the composer)
    // independently sets its OWN `dir` from the detected language of that
    // specific content — see `MessageBubble`'s and this file's own
    // per-turn `dir` below — completely decoupled from this wrapper's now-
    // fixed structural direction. `AuraHistoryPanel`'s existing logical
    // properties (`border-e`/`pe-3`) needed no change: they already resolve
    // correctly once their ancestor's computed direction is `ltr`.
    <div dir="ltr" className={cn(FARMER_CONTENT_WIDTH.wide, "flex h-full min-h-0 flex-1 gap-4 py-4")}>
      {/*
        MVP-UI.1-D — `hidden lg:flex` is the entire desktop-vs-mobile
        decision for this rail: CSS media query, not JS viewport detection,
        per that milestone's own "prefer responsive CSS" instruction. Below
        `lg` it simply isn't rendered on-screen; the SAME component (same
        `useAuraConversationStore` state, same open/delete/clear logic) is
        reused a second time inside the Drawer below for mobile — nothing
        about conversation handling is duplicated, only which of the two
        instances is visible at a given width.
      */}
      <AuraHistoryPanel className="hidden lg:flex" />

      {/*
        MVP-UI.1-D — the mobile counterpart to the rail above: a Drawer
        (this project's existing `vaul`-backed primitive, already used by
        Operator's own `ResponsiveSidebar` for the identical
        desktop-rail/mobile-drawer split) rather than a squeezed permanent
        sidebar. `direction="left"` matches "History is conceptually the
        left panel" even though on a phone it's a full-screen overlay, not
        a sliver. Reuses `AuraHistoryPanel` unchanged in substance — only
        `className` (full width, no longer needs its own end-border/padding
        since the Drawer supplies its own chrome) and `onSelectConversation`
        (closes the drawer — see that prop's own doc comment) differ from
        the desktop instance above.
      */}
      <Drawer direction="left" open={historyDrawerOpen} onOpenChange={setHistoryDrawerOpen}>
        <DrawerContent
          direction="left"
          container={farmerThemeRoot}
          className="flex w-full max-w-xs flex-col p-0 lg:hidden"
        >
          <DrawerHeader className="flex-row items-center justify-between gap-2 border-b-0 py-4">
            <DrawerTitle className="text-base">AURA</DrawerTitle>
            <DrawerClose asChild>
              <IconButton aria-label={t("common.close")} icon={<X className="size-4" />} intent="ghost" />
            </DrawerClose>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
            <AuraHistoryPanel className="w-full border-e-0 pe-0" onSelectConversation={() => setHistoryDrawerOpen(false)} />
          </div>
        </DrawerContent>
      </Drawer>

      {/*
        MVP-UI.1-C — this column re-asserts the Farmer's actual UI-language
        direction (`dir` from `useFarmerTranslation`) for its own CHROME
        (the header below: title/subtitle/icon buttons) — overriding the
        `dir="ltr"` the parent row now fixes for PANEL ORDERING only.
        Message bubbles and the composer below independently set their OWN
        `dir` from the current turn's/currently-typed content (see
        `MessageBubble` and `ChatInput`'s own per-content `dir`), so this
        column's `dir` never controls conversational content — only its
        header chrome.
      */}
      <div dir={dir} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="flex size-8 items-center justify-center rounded-xl text-accent"
              style={{ background: "var(--accent-muted)" }}
            >
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div>
              <Typography variant="h4">AURA</Typography>
              {/* MVP-UI.1-D — hidden below `lg`: freeing this row's width for the history trigger + existing icon buttons is what keeps the mobile header comfortably touch-friendly rather than cramped (that milestone's own "adjust the mobile header only as necessary" instruction) — the subtitle itself is purely descriptive, never functional. */}
              <Typography variant="small" className="hidden text-foreground-subtle lg:block">
                {t("aura.subtitle")}
              </Typography>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* MVP-UI.1-D — the one necessary addition to this header: opens the mobile History drawer above. `lg:hidden` since desktop already shows History permanently on the left — this control would be redundant there. */}
            <IconButton
              aria-label={t("aura.historyTitle")}
              icon={<History className="size-4" />}
              intent="ghost"
              className="lg:hidden"
              onClick={() => setHistoryDrawerOpen(true)}
            />
            {speakingState === "playing" || speakingState === "loading" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    aria-label={t("aura.stopAuraSpeaking")}
                    icon={<Square className="size-4 fill-current" />}
                    intent="ghost"
                    disabled={speakingState === "loading"}
                    onClick={stopSpeaking}
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom">{speakingState === "loading" ? t("aura.preparingVoice") : t("aura.stop")}</TooltipContent>
              </Tooltip>
            ) : speakingState === "blocked" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    aria-label={t("aura.tapToHear")}
                    icon={<Play className="size-4" />}
                    intent="primary"
                    onClick={replayLastSpoken}
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("aura.tapToHearHint")}</TooltipContent>
              </Tooltip>
            ) : lastSpokenAudioUrl ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton aria-label={t("aura.replayLastReply")} icon={<Play className="size-4" />} intent="ghost" onClick={replayLastSpoken} />
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("aura.replayLastReplyHint")}</TooltipContent>
              </Tooltip>
            ) : null}

            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label={t("aura.clearConversation")}
                  icon={<Trash2 className="size-4" />}
                  intent="ghost"
                  disabled={messages.length === 0}
                  onClick={startNewChat}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("aura.clearConversation")}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface"
          style={{ boxShadow: "var(--shadow-panel)" }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MessageList messages={messages} emptyStateTitle={t("aura.emptyStateTitle")} emptyStateDescription={t("aura.emptyStateDescription")} />
            {speakingState === "playing" ? (
              <div className="flex items-center gap-1.5 px-4 pb-2 text-accent">
                <Volume2 className="size-3.5 animate-pulse" aria-hidden />
                <Typography variant="caption" className="text-accent">
                  {t("aura.speaking")}
                </Typography>
              </div>
            ) : null}
          </div>
          <ChatInput
            disabled={isStreaming || isPersisting}
            onSend={handleSend}
            allowImageAttachment
            allowVoice
            onVoiceTranscript={(text, timings) => void handleVoiceTranscript(text, timings)}
            placeholderText={t("aura.placeholder")}
            imagePlaceholderText={t("aura.imagePlaceholder")}
            imageLanguagePromptText={t("aura.imageLanguagePrompt")}
            attachImageLabel={t("aura.attachImage")}
            sendLabel={t("aura.sendMessage")}
            voiceLanguage={voiceLanguage}
            voiceLabels={{
              speakToAura: t("voice.speakToAura"),
              stopRecording: t("voice.stopRecording"),
              listening: t("voice.listening"),
              requestingMic: t("voice.requestingMic"),
              understanding: t("voice.understanding"),
              micDenied: t("voice.micDenied"),
              notSupported: t("voice.notSupported"),
              couldntHear: t("voice.couldntHear"),
              couldntUnderstand: t("voice.couldntUnderstand"),
              couldntProcess: t("voice.couldntProcess"),
            }}
          />
        </div>
      </div>
    </div>
  );
}
