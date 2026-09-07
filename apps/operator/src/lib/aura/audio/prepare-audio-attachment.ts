"use client";

import { isSupportedAudioMimeType, MAX_AUDIO_RAW_BYTES } from "./audio-constraints";

/**
 * Turns the `Blob` a
 * `MediaRecorder` produced into exactly what `/api/aura/voice/transcribe`
 * needs (`{ mimeType, dataBase64 }`). Convenience validation only — the
 * server (`audio-validation.ts`) independently re-checks everything,
 * exactly the same division of responsibility as `prepare-image-
 * attachment.ts`.
 */

export interface PreparedAudioAttachment {
  mimeType: string;
  dataBase64: string;
}

export class AudioAttachmentError extends Error {}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new AudioAttachmentError("Could not read that recording."));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBase64(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex === -1 ? "" : dataUrl.slice(commaIndex + 1);
}

export async function prepareAudioAttachment(blob: Blob): Promise<PreparedAudioAttachment> {
  if (!blob || blob.size === 0) {
    throw new AudioAttachmentError("No recording was captured. Please try again.");
  }
  if (!isSupportedAudioMimeType(blob.type)) {
    throw new AudioAttachmentError("This device recorded an unsupported audio format.");
  }
  if (blob.size > MAX_AUDIO_RAW_BYTES) {
    throw new AudioAttachmentError("That recording is too long. Please keep it under about a minute and a half.");
  }

  const dataUrl = await readBlobAsDataUrl(blob);
  return { mimeType: blob.type, dataBase64: dataUrlToBase64(dataUrl) };
}
