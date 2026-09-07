"use client";

import { useEffect } from "react";

import { useLiveContextStore } from "@/lib/aura/context/live-context-store";
import { useWorkspace } from "@/lib/workspace/workspace-context";

/**
 * Publishes Mission Control's live workspace state (presentation mode, which
 * widgets are currently visible) into AURA's Context Engine. Rendered inside
 * `AdaptiveWorkspaceProvider` (see `command-center-page.tsx`) purely for its
 * `useWorkspace()` access — it renders nothing and never touches workspace
 * state itself, only mirrors it.
 */
export function AuraMissionControlContextPublisher() {
  const { presentationMode, visibleOrder } = useWorkspace();
  const publish = useLiveContextStore((state) => state.publishMissionControlContext);

  useEffect(() => {
    publish({ presentationMode, activeWidgets: visibleOrder });
  }, [presentationMode, visibleOrder, publish]);

  return null;
}
