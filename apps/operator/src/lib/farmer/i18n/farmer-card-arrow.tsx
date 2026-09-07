"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

import { useFarmerTranslation } from "./use-farmer-translation";

/**
 * "important icons/
 * arrows/chevrons must be checked for incorrect directional behavior."
 * A "go forward" arrow always means "toward the end of the reading
 * direction" — under RTL that's the LEFT, so this renders the mirror-image
 * icon rather than visually flipping `ArrowRight` (a flipped arrowhead can
 * render asymmetrically depending on the icon's own geometry; swapping to
 * the equivalent purpose-built icon is the more correct fix and is what
 * `lucide-react` already provides).
 */
export function FarmerCardArrow() {
  const { isRTL } = useFarmerTranslation();
  return isRTL ? (
    <ArrowLeft className="size-4 text-foreground-subtle" aria-hidden />
  ) : (
    <ArrowRight className="size-4 text-foreground-subtle" aria-hidden />
  );
}
