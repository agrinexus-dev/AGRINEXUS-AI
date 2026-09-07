"use client";

import { X } from "lucide-react";

import { IconButton, Typography } from "@agrinexus/ui";

import type { PreparedImageAttachment } from "@/lib/aura/images/prepare-image-attachment";

/**
 * The compact preview shown in the composer before a Farmer sends an image
 * attachment. Deliberately small (a thumbnail + filename + remove button,
 * nothing more) — Part 5's own "do not create a huge image viewer."
 */
export interface ImageAttachmentPreviewProps {
  image: PreparedImageAttachment;
  onRemove: () => void;
}

export function ImageAttachmentPreview({ image, onRemove }: ImageAttachmentPreviewProps) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-2 py-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- a local, client-only object/data URL preview, never a remote image `next/image` would need to optimize. */}
      <img src={image.previewUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" />
      <Typography variant="caption" className="min-w-0 flex-1 truncate text-foreground-subtle">
        {image.fileName}
      </Typography>
      <IconButton aria-label="Remove image" icon={<X className="size-3.5" />} intent="ghost" size="sm" onClick={onRemove} />
    </div>
  );
}
