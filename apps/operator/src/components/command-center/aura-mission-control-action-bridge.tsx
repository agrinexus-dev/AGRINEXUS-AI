"use client";

import { useEffect } from "react";

import { useActionBridgeStore } from "@/lib/aura/actions/action-bridge-store";
import { useWorkspace } from "@/lib/workspace/workspace-context";

/**
 * Registers Mission Control's Presentation Mode toggle into the Action
 * Layer's bridge — a separate component from
 * `aura-mission-control-context-publisher.tsx` so this change's
 * action-registration concern never touches that Context Engine publisher.
 * Renders nothing; only calls the EXISTING `togglePresentationMode()` this
 * page already has, never reimplemented.
 */
export function AuraMissionControlActionBridge() {
  const { presentationMode, togglePresentationMode } = useWorkspace();

  useEffect(() => {
    useActionBridgeStore.getState().registerMissionControlBridge({
      setPresentationMode: (enabled) => {
        if (presentationMode !== enabled) togglePresentationMode();
        return true;
      },
    });

    return () => useActionBridgeStore.getState().unregisterMissionControlBridge();
  }, [presentationMode, togglePresentationMode]);

  return null;
}
