/**
 * The ONE shared
 * definition of what counts as a valid AURA image attachment. No prior
 * phase established a centralized file-type/size configuration anywhere in
 * this repo (checked before writing this file — every existing "add X"
 * dialog inspects its own image-agnostic fields), so this is a genuinely
 * new, single source of truth, imported by both the client (attachment
 * preparation, `prepare-image-attachment.ts`) and the server (payload
 * validation, `image-validation.ts`) — never duplicated between them.
 *
 * Deliberately free of any "use client"/"server-only" marker — pure
 * constants and types are safe to import from either side.
 */

export const SUPPORTED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type SupportedImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

export function isSupportedImageMimeType(value: string): value is SupportedImageMimeType {
  return (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Part 7 — the final, decoded-byte size ceiling for one AURA image
 * attachment. 4 MB raw was chosen after inspecting this app's actual
 * request-handling: `next.config.ts` sets no custom body-size limit (the
 * App Router's Route Handlers, unlike the old Pages API, have no
 * Next-imposed cap of their own — the constraint is whatever the eventual
 * deployment platform enforces on a single request body, and common
 * serverless hosts including Vercel cap a function's total request body
 * around 4.5 MB). A base64-encoded image inflates by ~4/3 (`MAX_IMAGE_
 * BASE64_LENGTH` below already accounts for this), and the request also
 * carries the full system prompt + conversation history alongside it, so 4
 * MB of raw image data leaves comfortable headroom under that ceiling
 * rather than sitting right at the edge.
 */
export const MAX_IMAGE_RAW_BYTES = 4 * 1024 * 1024;

/** `ceil(bytes * 4 / 3)` plus a few bytes of base64 padding/line-ending slack — the exact string-length ceiling `image-validation.ts` checks a decoded payload's ENCODED form against before ever calling `Buffer.from`. */
export const MAX_IMAGE_BASE64_LENGTH = Math.ceil((MAX_IMAGE_RAW_BYTES * 4) / 3) + 16;

/**
 * Part 7 — the longest edge (px) `prepare-image-attachment.ts` downsamples
 * to when a selected photo exceeds this, before it exceeds `MAX_IMAGE_RAW_
 * BYTES` at all. 1600px is a deliberate, disclosed choice (not a silent
 * quality cut): a modern phone photo of a leaf/plant easily exceeds this
 * for framing purposes, but disease/pest symptoms (lesions, discoloration,
 * insect damage) remain clearly legible at 1600px on the long edge — well
 * beyond what any current Gemini vision model needs to reason about visible
 * detail. A photo already at or under this size is sent completely
 * untouched — resizing only ever happens when it's actually needed.
 */
export const MAX_IMAGE_DIMENSION_PX = 1600;

/**
 * Part 14 — the exact, deliberately conservative default instruction used
 * when a Farmer attaches an image without typing a question. Verbatim per
 * the spec (Part 15's own example wording) — asks for
 * observation, not diagnosis-with-false-certainty.
 */
export const DEFAULT_IMAGE_ANALYSIS_QUESTION = "Analyze the uploaded agricultural image and describe what you can observe.";
