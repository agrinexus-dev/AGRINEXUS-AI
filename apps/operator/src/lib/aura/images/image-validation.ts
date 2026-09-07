import "server-only";

import { isSupportedImageMimeType, MAX_IMAGE_BASE64_LENGTH } from "./image-constraints";

/**
 * The server-side re-check every image attachment goes through regardless of
 * what the client already validated ("client-side validation is
 * convenience only, the server MUST validate again"). Never trusts the
 * client-declared MIME type alone — a real magic-byte signature check
 * confirms the decoded bytes actually look like the format they claim to
 * be, without decoding the image itself (no external image library is
 * needed or added — this is a handful of fixed-offset byte comparisons,
 * the same technique browsers/OS file managers use for type sniffing).
 *
 * This module has exactly one job: say whether a `(mimeType, dataBase64)`
 * pair is a safe, real image AURA's canonical request may include. It never
 * touches Gemini, the router, or a provider adapter — kept out of `gemini-
 * provider.ts` deliberately, so that file's own existing request-shaping
 * logic (`toGeminiPayload`) stays exactly what Part 9 requires: reused, not
 * duplicated, with validation as a distinct, separately-testable step that
 * runs BEFORE a canonical request is ever built.
 */

export interface ImageValidationFailure {
  ok: false;
  reason: string;
}

export interface ImageValidationSuccess {
  ok: true;
}

export type ImageValidationResult = ImageValidationSuccess | ImageValidationFailure;

type SignatureCheck = (bytes: Uint8Array) => boolean;

const SIGNATURE_CHECKS: Record<string, SignatureCheck> = {
  // JPEG: SOI marker.
  "image/jpeg": (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  // PNG: the fixed 8-byte PNG signature.
  "image/png": (bytes) =>
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a,
  // WEBP: a RIFF container whose 4-byte format tag (offset 8) is "WEBP".
  "image/webp": (bytes) =>
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50,
};

/**
 * Validates one image attachment end to end: declared type is on the
 * allowlist, the encoded payload isn't absurdly large (checked on the
 * STRING before ever base64-decoding it, so a deliberately oversized
 * payload can't force a large allocation first), the payload actually
 * base64-decodes, and the decoded bytes' real signature matches the
 * declared type. Never logs the payload itself (Part 24/35 #11 — "never
 * log raw image bytes") — a caller that wants to log a failure logs only
 * this function's own short `reason` string.
 */
export function validateImagePayload(mimeType: string, dataBase64: string): ImageValidationResult {
  if (!isSupportedImageMimeType(mimeType)) {
    return { ok: false, reason: "Unsupported image type." };
  }
  if (typeof dataBase64 !== "string" || dataBase64.length === 0) {
    return { ok: false, reason: "No image data was received." };
  }
  if (dataBase64.length > MAX_IMAGE_BASE64_LENGTH) {
    return { ok: false, reason: "That image is too large." };
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(dataBase64, "base64");
  } catch {
    return { ok: false, reason: "The image data was malformed." };
  }
  if (bytes.length === 0) {
    return { ok: false, reason: "No image data was received." };
  }

  const signatureMatches = SIGNATURE_CHECKS[mimeType]?.(bytes) ?? false;
  if (!signatureMatches) {
    return { ok: false, reason: "The image data doesn't match its declared file type." };
  }

  return { ok: true };
}
