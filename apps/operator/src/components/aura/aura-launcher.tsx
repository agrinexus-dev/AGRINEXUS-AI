"use client";

import { X } from "lucide-react";

import { cn } from "@agrinexus/ui";

import { useAuraChatStore } from "@/lib/aura/client/aura-chat-store";

/** Always-visible floating entry point for AURA. Non-intrusive: fixed bottom-right, stays clear of in-page chrome, and never blocks the Digital Twin's own toolbar/mini-map (both anchor higher up the page). */
export function AuraLauncher() {
  const { isOpen, toggle } = useAuraChatStore();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isOpen ? "Close AURA" : "Open AURA assistant"}
      aria-expanded={isOpen}
      className={cn(
        "pointer-events-auto fixed right-5 bottom-5 z-(--z-modal) flex size-14 items-center justify-center rounded-full",
        "bg-accent text-accent-foreground shadow-elevated",
        "transition-transform duration-(--duration-normal) ease-standard hover:scale-105 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <span className="relative flex size-6 items-center justify-center">
        <X
          className={cn(
            "absolute size-6 transition-all duration-(--duration-fast) ease-standard",
            isOpen ? "rotate-0 scale-100 opacity-100" : "rotate-45 scale-75 opacity-0",
          )}
        />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={cn(
            "absolute size-6 transition-all duration-(--duration-fast) ease-standard",
            isOpen ? "-rotate-45 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100",
          )}
        >
          <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="currentColor" />
        </svg>
      </span>
    </button>
  );
}
