"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

import { Typography } from "@agrinexus/ui";

import { AudioAttachmentError, prepareAudioAttachment } from "@/lib/aura/audio/prepare-audio-attachment";
import { MAX_RECORDING_SECONDS, SUPPORTED_AUDIO_MIME_TYPES } from "@/lib/aura/audio/audio-constraints";
import type { ConversationLanguage } from "@/lib/aura/voice/language-detection";
import { newVoiceRequestId, VOICE_REQUEST_ID_HEADER } from "@/lib/aura/voice/voice-timing";

/**
 * The push-to-talk microphone
 * control. Part "VOICE UI STATES": IDLE / LISTENING / PROCESSING / ERROR are
 * all handled here (SPEAKING — TTS playback — is owned by the caller,
 * `farmer-aura-page.tsx`, since it happens after this component's own job
 * is already done).
 *
 * Part "PUSH TO TALK": exactly tap-to-start, tap-to-stop, then process — no
 * wake word, no continuous listening, no auto-restart. A safety timer
 * (`MAX_RECORDING_SECONDS`) auto-stops a forgotten-open recording; it is a
 * UX guard, not the security boundary (the server's own size/type
 * validation is that).
 *
 * Deliberately large/circular/neumorphic (Part "the microphone should be
 * large, touch-friendly, premium... not a developer dashboard") — reuses
 * the Farmer theme's OWN existing neumorphic shadow tokens
 * (`--shadow-elevated`/`--shadow-neu-inset`/`--shadow-glow`, already
 * defined in `farmer-theme.css` for exactly this visual language) rather
 * than inventing a new design system.
 */

export type VoiceRecorderState = "idle" | "requesting-permission" | "listening" | "processing" | "error";

/**
 * the recording+STT leg of one voice interaction's timing, handed up once a
 * transcript is ready so the caller (`farmer-aura-page.tsx`) can append the
 * remaining AURA/TTS/playback stages under the SAME `voiceRequestId` and
 * log one complete picture. See `voice-timing.ts`'s own doc comment for why
 * these are plain numbers, never anything logged/stored beyond this.
 */
export interface VoiceRecordingTimings {
  voiceRequestId: string;
  recording_start: number;
  recording_stop: number;
  stt_request_start: number;
  stt_request_complete: number;
  /**
   * The STT provider's OWN detected language for THIS
   * recording, already normalized (`lib/aura/voice/language-detection.ts`)
   * to the product's two supported values. `undefined` when the provider
   * reported nothing, or reported an unsupported language — the caller
   * (`farmer-aura-page.tsx`) treats that exactly like "no detection,"
   * never as a third language. This is a PER-TURN value only — nothing in
   * this component persists it anywhere.
   */
  detectedLanguage?: ConversationLanguage;
}

/**
 * Every visible string
 * this component renders, as an OPTIONAL override object defaulting to the
 * exact existing English text (see `DEFAULT_VOICE_LABELS` below). Additive
 * only, same pattern as `MessageList`'s own doc comment: the Operator
 * floating panel doesn't render this component at all (`allowVoice` is
 * Farmer-only — see `ChatInputProps`'s own doc comment), so this change has
 * no Operator surface at all, but the shape is kept generic/decoupled from
 * the Farmer i18n system regardless, for the same reason `ChatInput`'s
 * overrides are plain strings, not translation keys.
 */
export interface VoiceRecorderLabels {
  speakToAura: string;
  stopRecording: string;
  listening: string;
  requestingMic: string;
  understanding: string;
  micDenied: string;
  notSupported: string;
  couldntHear: string;
  couldntUnderstand: string;
  couldntProcess: string;
}

const DEFAULT_VOICE_LABELS: VoiceRecorderLabels = {
  speakToAura: "Speak to AURA",
  stopRecording: "Stop recording",
  listening: "Listening… tap to stop",
  requestingMic: "Requesting microphone…",
  understanding: "Understanding…",
  micDenied: "Microphone access was denied. You can still type your message.",
  notSupported: "Voice recording isn't supported on this device. Please type your message instead.",
  couldntHear: "I couldn't hear anything in that recording. Please try again.",
  couldntUnderstand: "Could not understand that recording.",
  couldntProcess: "Could not process that recording.",
};

export interface VoiceRecorderButtonProps {
  disabled?: boolean;
  /** Called once a recording has been successfully transcribed — the caller treats the text exactly like a typed message; `timings` is this leg's own diagnostic record (Part 3), never anything the caller needs for correctness. */
  onTranscript: (text: string, timings: VoiceRecordingTimings) => void;
  /** Called when the whole capture→transcribe pipeline itself failed (not a farm/AURA error) — the caller decides how loudly to surface it. */
  onError?: (message: string) => void;
  /** A partial override merged over `DEFAULT_VOICE_LABELS`; `undefined` (every existing caller) behaves exactly as before this change. */
  labels?: Partial<VoiceRecorderLabels>;
  /**
   * An OPTIONAL ISO-639-1 code (e.g. `"ur"`), forwarded
   * to `/api/aura/voice/transcribe` (see that route's own doc comment for
   * the live-verified reason this exists — Whisper's own auto-detection can
   * transcribe spoken Urdu in the wrong script). `undefined` (every
   * existing caller) omits the field entirely, identical to this
   * component's pre-existing behavior.
   */
  language?: string;
}

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const candidate of SUPPORTED_AUDIO_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return undefined;
}

export function VoiceRecorderButton({ disabled, onTranscript, onError, labels, language }: VoiceRecorderButtonProps) {
  const L: VoiceRecorderLabels = { ...DEFAULT_VOICE_LABELS, ...labels };
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One correlation id + `recording_start` timestamp per
  // tap-to-record, captured the instant `startRecording` actually begins
  // (not on mount) so a Farmer who opens the page and records five minutes
  // later doesn't get an artificially huge "recording duration."
  const timingRef = useRef<{ voiceRequestId: string; recording_start: number; recording_stop: number | null } | null>(null);

  useEffect(
    () => () => {
      // Unmount safety — never leave a microphone track open behind a closed component.
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
    },
    [],
  );

  function fail(message: string) {
    setState("error");
    setErrorMessage(message);
    onError?.(message);
    // Auto-recover to idle shortly — an error state that never resets would
    // strand the Farmer with a dead microphone button.
    setTimeout(() => {
      setState("idle");
      setErrorMessage(null);
    }, 3000);
  }

  async function startRecording() {
    if (state !== "idle") return;
    setState("requesting-permission");
    timingRef.current = { voiceRequestId: newVoiceRequestId(), recording_start: performance.now(), recording_stop: null };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Part "MICROPHONE DENIAL HANDLING" — a real, common outcome (denied
      // permission, no microphone device, insecure/non-HTTPS context, an OS
      // privacy setting) — never a stack trace, always this one clear
      // recovery instruction.
      fail(L.micDenied);
      return;
    }

    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      stream.getTracks().forEach((track) => track.stop());
      fail(L.notSupported);
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      void handleRecordingComplete(new Blob(chunksRef.current, { type: mimeType }));
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setState("listening");

    autoStopTimerRef.current = setTimeout(() => stopRecording(), MAX_RECORDING_SECONDS * 1000);
  }

  function stopRecording() {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      setState("processing");
      if (timingRef.current) timingRef.current.recording_stop = performance.now();
      mediaRecorderRef.current.stop();
    }
  }

  async function handleRecordingComplete(blob: Blob) {
    // `recording_stop` was stamped in `stopRecording`
    // above (the tap that ended capture); if it's somehow missing (e.g. the
    // safety auto-stop timer fired `stopRecording` — same code path, so in
    // practice this always exists), fall back to "now" rather than leaving
    // a gap in the diagnostic record.
    const started = timingRef.current;
    const recording_start = started?.recording_start ?? performance.now();
    const recording_stop = started?.recording_stop ?? performance.now();
    const voiceRequestId = started?.voiceRequestId ?? newVoiceRequestId();

    try {
      const attachment = await prepareAudioAttachment(blob);
      const stt_request_start = performance.now();
      const response = await fetch("/api/aura/voice/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", [VOICE_REQUEST_ID_HEADER]: voiceRequestId },
        body: JSON.stringify({ audio: attachment, ...(language ? { language } : {}) }),
      });
      const data = await response.json();
      const stt_request_complete = performance.now();
      if (!response.ok) {
        fail(data?.error ?? L.couldntUnderstand);
        return;
      }
      const transcript = typeof data?.text === "string" ? data.text.trim() : "";
      if (!transcript) {
        fail(L.couldntHear);
        return;
      }
      // Already normalized server-side
      // (`groq-provider.ts`); only "en"/"ur"/absent are ever accepted here
      // too, so a corrupted/unexpected response body can't smuggle a third
      // language value through.
      const detectedLanguage: ConversationLanguage | undefined =
        data?.detectedLanguage === "en" || data?.detectedLanguage === "ur" ? data.detectedLanguage : undefined;
      setState("idle");
      onTranscript(transcript, { voiceRequestId, recording_start, recording_stop, stt_request_start, stt_request_complete, detectedLanguage });
    } catch (error) {
      fail(error instanceof AudioAttachmentError ? error.message : L.couldntProcess);
    }
  }

  function handleTap() {
    if (disabled) return;
    if (state === "idle") void startRecording();
    else if (state === "listening") stopRecording();
    // requesting-permission/processing/error: tap is a no-op — the button
    // is visually disabled/mid-transition for those states below.
  }

  const isListening = state === "listening";
  const isBusy = state === "requesting-permission" || state === "processing";

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/*
        MVP-UI.1-D.1 (Farmer Mobile Shell, Navigation & AURA Composer
        Correction) established this fix at mobile widths; MVP-UI.1-D.2
        (AURA Composer Control Consistency) removes the `lg:` desktop
        exception that milestone deliberately kept — a desktop screenshot
        afterward showed the ORIGINAL 56px microphone still sitting beside
        the 36px attach/send `IconButton`s there, the same "floating action
        button" mismatch this whole fix exists to solve, just one breakpoint
        higher. There is now exactly ONE composer control scale at every
        width: `size-9` (36px, matching `packages/ui`'s own
        `iconButtonVariants` "md") with a `size-4` (16px) icon — no `lg:`
        override, no separate desktop dimension. The circular shape and
        accent-tinted fill are kept (the microphone's one deliberate visual
        distinction from its flat-ghost siblings) so it's still
        recognizably "the microphone," just at the same physical scale as
        everything else in the row, on every screen size. Idle state has no
        shadow (`boxShadow: "none"`) — a heavy drop-shadow reads as
        "floating" regardless of size; the listening-state inset shadow (an
        existing, already-used token) is unchanged, kept as the one
        deliberate "actively recording" visual cue.
      */}
      <button
        type="button"
        onClick={handleTap}
        disabled={disabled || isBusy}
        aria-label={isListening ? L.stopRecording : L.speakToAura}
        aria-pressed={isListening}
        className="flex size-9 shrink-0 items-center justify-center rounded-full transition-all duration-(--duration-normal) ease-standard disabled:opacity-(--opacity-disabled)"
        style={{
          background: isListening ? "var(--critical-muted)" : "var(--accent-muted)",
          boxShadow: isListening ? "var(--shadow-neu-inset)" : "none",
        }}
      >
        {isListening ? (
          <Square className="size-4 fill-current text-critical" aria-hidden />
        ) : (
          <Mic className={`size-4 text-accent ${isBusy ? "animate-pulse" : ""}`} aria-hidden />
        )}
      </button>
      {state === "listening" ? (
        <Typography variant="caption" className="text-critical">
          {L.listening}
        </Typography>
      ) : state === "requesting-permission" ? (
        <Typography variant="caption" className="text-foreground-subtle">
          {L.requestingMic}
        </Typography>
      ) : state === "processing" ? (
        <Typography variant="caption" className="text-foreground-subtle">
          {L.understanding}
        </Typography>
      ) : state === "error" && errorMessage ? (
        <Typography variant="caption" className="max-w-40 text-center text-critical">
          {errorMessage}
        </Typography>
      ) : null}
    </div>
  );
}
