import "server-only";

import { isSupportedAudioMimeType, MAX_AUDIO_BASE64_LENGTH } from "./audio-constraints";

/**
 * The audio twin of
 * `../images/image-validation.ts`: server-side re-validation of every voice
 * clip regardless of what the client already checked, using the same
 * "confirm the declared type against the real magic bytes" technique (no
 * audio-decoding library needed or added). Never touches the router or a
 * provider adapter — this module's only job is "is this a safe, real audio
 * clip AURA's speech-to-text path may accept," exactly mirroring
 * `validateImagePayload`'s own scope boundary.
 */

export interface AudioValidationFailure {
  ok: false;
  reason: string;
}

export interface AudioValidationSuccess {
  ok: true;
}

export type AudioValidationResult = AudioValidationSuccess | AudioValidationFailure;

type SignatureCheck = (bytes: Uint8Array) => boolean;

const SIGNATURE_CHECKS: Record<string, SignatureCheck> = {
  // WebM/Matroska: the fixed 4-byte EBML header — what Chrome/Firefox/Edge's
  // MediaRecorder actually produces by default.
  "audio/webm": (bytes) => bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3,
  // Ogg container: the fixed 4-byte "OggS" capture pattern.
  "audio/ogg": (bytes) => bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53,
  // WAV: same RIFF....WAVE check `image-validation.ts` already uses for WEBP
  // (a different 4-byte format tag at the same offset within the same RIFF
  // container shape) — this project's own Operator Router Test panel
  // generates real audio/wav samples this way.
  "audio/wav": (bytes) =>
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45,
  // MP4/M4A container: a 4-byte box size followed by the "ftyp" box type —
  // what Safari's MediaRecorder actually produces (it never shipped WebM).
  "audio/mp4": (bytes) => bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70,
  // MP3: either a leading "ID3" tag, or a real MPEG audio frame sync
  // (11 set bits: 0xFF followed by a byte whose top 3 bits are also set).
  "audio/mpeg": (bytes) =>
    (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0),
};

/**
 * Validates one voice clip end to end — same shape/order as
 * `validateImagePayload`: declared type on the allow-list, encoded payload
 * not absurdly large (checked on the string before ever base64-decoding),
 * decodes cleanly, decoded bytes' real signature matches the declared
 * container format. Never logs the payload itself — Part "AUDIO SECURITY":
 * "do not log raw audio," a caller that wants to log a failure logs only
 * this function's own short `reason` string.
 */
export function validateAudioPayload(mimeType: string, dataBase64: string): AudioValidationResult {
  if (!isSupportedAudioMimeType(mimeType)) {
    return { ok: false, reason: "Unsupported audio type." };
  }
  if (typeof dataBase64 !== "string" || dataBase64.length === 0) {
    return { ok: false, reason: "No audio was received." };
  }
  if (dataBase64.length > MAX_AUDIO_BASE64_LENGTH) {
    return { ok: false, reason: "That recording is too long." };
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(dataBase64, "base64");
  } catch {
    return { ok: false, reason: "The audio data was malformed." };
  }
  if (bytes.length === 0) {
    return { ok: false, reason: "No audio was received." };
  }

  const baseMimeType = mimeType.split(";")[0]?.trim() ?? mimeType;
  const signatureMatches = SIGNATURE_CHECKS[baseMimeType]?.(bytes) ?? false;
  if (!signatureMatches) {
    return { ok: false, reason: "The audio data doesn't match its declared file type." };
  }

  return { ok: true };
}
