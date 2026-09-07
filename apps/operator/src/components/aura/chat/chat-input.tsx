"use client";

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ArrowUp, ImagePlus } from "lucide-react";

import { cn, IconButton, Typography } from "@agrinexus/ui";

import { SUPPORTED_IMAGE_MIME_TYPES } from "@/lib/aura/images/image-constraints";
import { ImageAttachmentError, prepareImageAttachment, type PreparedImageAttachment } from "@/lib/aura/images/prepare-image-attachment";
import { detectTextLanguage, type ConversationLanguage } from "@/lib/aura/voice/language-detection";

import { ImageAttachmentPreview } from "./image-attachment-preview";
import { VoiceRecorderButton, type VoiceRecorderLabels, type VoiceRecordingTimings } from "./voice-recorder-button";

/**
 * The exactly-two choices
 * an attached image's answer can be, in the fixed order the composer always
 * shows them. Labels are the language NAMES themselves (shown in their own
 * script, e.g. a language switcher would), not translated further by the
 * ambient Farmer UI language — "English" and "اردو" read correctly and
 * identically regardless of whether the surrounding UI is in English or
 * Urdu (see this component's own doc comment on `imageLanguagePromptText`
 * for the one label that DOES follow the UI language).
 */
const IMAGE_RESPONSE_LANGUAGES: { value: ConversationLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ur", label: "اردو" },
];

export interface ChatInputProps {
  disabled: boolean;
  /**
   * `imageResponseLanguage` is passed ONLY alongside `image`,
   * and only once the Farmer has made an explicit choice in the picker
   * below (Send stays disabled until then — see `submit()`). `undefined`
   * for every text-only send, exactly as before this change.
   */
  onSend: (text: string, image?: PreparedImageAttachment, imageResponseLanguage?: ConversationLanguage) => void;
  /**
   * The image attachment control is scoped to the Farmer AURA composer ONLY
   * (`FarmerAuraPage` is the only caller that sets this). The Operator
   * floating panel (`aura-panel.tsx`) still renders this exact same
   * component unmodified otherwise — no image button appears there, per
   * the "add only to the existing Farmer AURA composer" scope
   * boundary; nothing about the Operator experience changes.
   */
  allowImageAttachment?: boolean;
  /**
   * Same scoping rule as
   * `allowImageAttachment` above: the microphone only ever appears where
   * the caller explicitly opts in (`FarmerAuraPage`), never in the Operator
   * floating panel. `onVoiceTranscript`, when provided alongside this flag,
   * receives the recognized text exactly once a recording has been
   * successfully transcribed — the caller treats it exactly like a typed
   * `onSend` message (see that prop's own doc comment in
   * `farmer-aura-page.tsx`).
   */
  allowVoice?: boolean;
  /** `timings` is the recording+STT leg's own diagnostic record, forwarded unchanged from `VoiceRecorderButton`; see that component's own doc comment. */
  onVoiceTranscript?: (text: string, timings: VoiceRecordingTimings) => void;
  /**
   * Optional visible-text
   * overrides, all defaulting to the exact existing English strings/aria
   * labels (see `MessageList`'s own doc comment on this same additive
   * pattern — the Operator floating panel never passes these and is
   * unaffected). `voiceLabels` is forwarded straight through to
   * `VoiceRecorderButton`, which owns its own defaults.
   */
  placeholderText?: string;
  imagePlaceholderText?: string;
  /**
   * The ONE visible label in the image-language picker that
   * follows the ambient UI language (unlike the fixed "English"/"اردو"
   * button labels themselves — see `IMAGE_RESPONSE_LANGUAGES`'s own doc
   * comment). Defaults to the existing English copy; the Operator floating
   * panel never renders this at all (it never sets `allowImageAttachment`).
   */
  imageLanguagePromptText?: string;
  attachImageLabel?: string;
  sendLabel?: string;
  voiceLabels?: VoiceRecorderLabels;
  /** Forwarded straight to `VoiceRecorderButton`; see that component's own doc comment. */
  voiceLanguage?: string;
}

export function ChatInput({
  disabled,
  onSend,
  allowImageAttachment = false,
  allowVoice = false,
  onVoiceTranscript,
  placeholderText = "Message AURA…",
  imagePlaceholderText = "Add a question about this image (optional)…",
  imageLanguagePromptText = "How should AURA answer?",
  attachImageLabel = "Attach an image",
  sendLabel = "Send message",
  voiceLabels,
  voiceLanguage,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [image, setImage] = useState<PreparedImageAttachment | null>(null);
  // Deliberately `null` (no default), never `"en"`:
  // "prefer making the choice default to no selection rather than
  // silently assuming English." Reset to `null` on every new attachment/
  // removal/send below, so a language choice can never carry over from one
  // image to the next, or leak into a later plain-text turn.
  const [imageLanguage, setImageLanguage] = useState<ConversationLanguage | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // An attached image cannot be sent until a language is chosen
  // (a "required, explicit" choice); a plain-text send (no
  // image at all) is completely unaffected by this check.
  const imageLanguageMissing = image !== null && imageLanguage === null;

  function submit() {
    const trimmed = value.trim();
    if (disabled || (!trimmed && !image) || imageLanguageMissing) return;
    onSend(trimmed, image ?? undefined, image ? (imageLanguage ?? undefined) : undefined);
    setValue("");
    setImage(null);
    setImageLanguage(null);
    setAttachmentError(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so selecting the SAME file again later still fires a change event.
    event.target.value = "";
    if (!file) return;

    setAttachmentError(null);
    // A fresh attachment always starts with no language chosen,
    // regardless of whatever the previous image (if any) had selected.
    setImageLanguage(null);
    try {
      const prepared = await prepareImageAttachment(file);
      setImage(prepared);
    } catch (error) {
      setImage(null);
      setAttachmentError(error instanceof ImageAttachmentError ? error.message : "Could not attach that image.");
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border p-3">
      {attachmentError ? (
        <Typography variant="caption" className="text-critical">
          {attachmentError}
        </Typography>
      ) : null}
      {image ? (
        <div className="flex flex-col gap-1.5">
          <ImageAttachmentPreview
            image={image}
            onRemove={() => {
              setImage(null);
              setImageLanguage(null);
            }}
          />
          {/*
            MVP-3C.8 (AURA Image Response Language Choice) — appears ONLY
            while an image is attached, and the choice made here applies
            ONLY to this one image-analysis turn (Section 3/5/8): it is
            never written to `displayLanguage`, Farmer Settings'
            `auraLanguage`, or any other persistent/global state, and it
            never carries forward to the next image or to a later
            plain-text message (both reset above/on send). Two plain
            `<button>`s with `aria-pressed` — the same accessible,
            keyboard-reachable toggle-button pattern this codebase already
            uses for an identical "choose exactly one of a few options"
            control (`widget-toolbar.tsx`'s size-preset buttons), rather
            than a new custom control (Section 13's "do not create a
            custom accessibility pattern unnecessarily"). No `dir`
            override here — this row inherits the ambient direction from
            wherever `ChatInput` is mounted (Farmer's own UI-language
            direction), exactly like the rest of this composer.
          */}
          <div role="group" aria-label={imageLanguagePromptText} className="flex flex-wrap items-center gap-2">
            <Typography variant="caption" className="text-foreground-subtle">
              {imageLanguagePromptText}
            </Typography>
            <div className="flex gap-1.5">
              {IMAGE_RESPONSE_LANGUAGES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={imageLanguage === value}
                  onClick={() => setImageLanguage(value)}
                  className={cn(
                    "min-h-8 min-w-16 rounded-md border px-3 py-1 text-xs font-medium transition-colors duration-(--duration-fast) ease-standard",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    imageLanguage === value
                      ? "border-accent bg-accent-muted text-accent"
                      : "border-border text-foreground-muted hover:bg-foreground/[var(--opacity-hover)]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        {allowImageAttachment ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_IMAGE_MIME_TYPES.join(",")}
              className="hidden"
              onChange={(event) => void handleFileSelected(event)}
              tabIndex={-1}
              aria-hidden="true"
            />
            <IconButton
              aria-label={attachImageLabel}
              icon={<ImagePlus className="size-4" />}
              intent="ghost"
              size="md"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            />
          </>
        ) : null}

        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={image ? imagePlaceholderText : placeholderText}
          // Direction follows what the Farmer is CURRENTLY
          // typing (via the existing, unmodified `detectTextLanguage`), not
          // the ambient UI language — so Urdu input reads naturally
          // right-to-left the moment it's typed, in either an English- or
          // Urdu-UI session, exactly like a sent message's own content
          // direction (`MessageBubble`). Empty input falls back to "ltr"
          // (that detector's own documented empty-string behavior), i.e.
          // no different from today for an empty box. Zero effect on
          // Operator's floating panel — English input always resolves "ltr".
          dir={detectTextLanguage(value) === "ur" ? "rtl" : "ltr"}
          // `min-w-0` overrides the flex item's default
          // `min-width: auto`, which otherwise lets a `<textarea>`'s own
          // intrinsic content width act as a floor on how far `flex-1` is
          // allowed to shrink it. On a 360px composer row already sharing
          // space with an attach button, send button, and the microphone,
          // that floor could quietly force the row wider than its
          // container. Purely a sizing constraint — no behavior change.
          className="min-h-9 max-h-32 min-w-0 flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle transition-colors duration-(--duration-fast) ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-(--opacity-disabled)"
        />
        <IconButton
          aria-label={sendLabel}
          icon={<ArrowUp className="size-4" />}
          intent="primary"
          size="md"
          disabled={disabled || (value.trim().length === 0 && !image) || imageLanguageMissing}
          onClick={submit}
        />

        {allowVoice && onVoiceTranscript ? (
          <VoiceRecorderButton disabled={disabled} onTranscript={onVoiceTranscript} labels={voiceLabels} language={voiceLanguage} />
        ) : null}
      </div>
    </div>
  );
}
