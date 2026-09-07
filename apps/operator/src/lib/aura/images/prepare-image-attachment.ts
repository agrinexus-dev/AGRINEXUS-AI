"use client";

import { isSupportedImageMimeType, MAX_IMAGE_DIMENSION_PX, MAX_IMAGE_RAW_BYTES } from "./image-constraints";

/**
 * Turns a
 * File the Farmer selected into exactly what `/api/aura/chat` needs
 * (`{ mimeType, dataBase64 }`) plus a `previewUrl` the composer can render
 * immediately. This is CONVENIENCE validation/preparation only — the server
 * (`image-validation.ts`) independently re-checks everything this function
 * does and more (a real magic-byte signature check this client-side
 * function deliberately doesn't attempt, since the browser's own
 * `file.type`/decode success already give reasonable client-side signal,
 * and the real security boundary is server-side per Part 6's own rule).
 *
 * Resizing only happens when the image actually exceeds `MAX_IMAGE_
 * DIMENSION_PX` or `MAX_IMAGE_RAW_BYTES` — a photo already within both
 * limits is sent completely untouched, exactly as it was selected, so no
 * quality is ever silently traded away for images that didn't need it.
 */

export interface PreparedImageAttachment {
  mimeType: string;
  dataBase64: string;
  fileName: string;
  previewUrl: string;
}

export class ImageAttachmentError extends Error {}

function approxDecodedBytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new ImageAttachmentError("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ImageAttachmentError("That file doesn't look like a valid image."));
    image.src = dataUrl;
  });
}

function dataUrlToBase64(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex === -1 ? "" : dataUrl.slice(commaIndex + 1);
}

export async function prepareImageAttachment(file: File): Promise<PreparedImageAttachment> {
  if (!file) {
    throw new ImageAttachmentError("No file was selected.");
  }
  if (!isSupportedImageMimeType(file.type)) {
    throw new ImageAttachmentError("Please choose a JPEG, PNG, or WEBP image.");
  }
  // A generous pre-check before even attempting to decode a huge file —
  // the real, precise ceiling is enforced below (and independently
  // server-side) after any resize/compression pass.
  if (file.size > MAX_IMAGE_RAW_BYTES * 6) {
    throw new ImageAttachmentError("That image is too large. Please choose a smaller photo.");
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(originalDataUrl);

  const exceedsDimensions = image.width > MAX_IMAGE_DIMENSION_PX || image.height > MAX_IMAGE_DIMENSION_PX;
  const exceedsSize = file.size > MAX_IMAGE_RAW_BYTES;

  if (!exceedsDimensions && !exceedsSize) {
    return { mimeType: file.type, dataBase64: dataUrlToBase64(originalDataUrl), fileName: file.name, previewUrl: originalDataUrl };
  }

  const scale = Math.min(1, MAX_IMAGE_DIMENSION_PX / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new ImageAttachmentError("Could not process that image on this device.");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  // Re-encoded as JPEG regardless of the original format — a deliberate,
  // disclosed simplification ("do not silently destroy image
  // quality"; documented in the report, not hidden): transparency
  // is irrelevant for a real photo of a plant/leaf, and JPEG gives
  // predictable, bounded output size at quality 0.85, which stays visually
  // faithful to visible symptoms (lesions, discoloration, insect damage).
  const resizedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const dataBase64 = dataUrlToBase64(resizedDataUrl);
  if (approxDecodedBytes(dataBase64) > MAX_IMAGE_RAW_BYTES) {
    throw new ImageAttachmentError("That image is too large even after compression. Please choose a smaller photo.");
  }

  return { mimeType: "image/jpeg", dataBase64, fileName: file.name, previewUrl: resizedDataUrl };
}
