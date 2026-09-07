"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Settings2, Trash2, X } from "lucide-react";

import { IconButton, Tooltip, TooltipContent, TooltipTrigger } from "@agrinexus/ui";

import { useCollectAuraContext } from "@/lib/aura/context/collect-context";
import { useAuraChatStore } from "@/lib/aura/client/aura-chat-store";

import { ChatInput } from "./chat/chat-input";
import { MessageList } from "./chat/message-list";
import { AuraSettingsPanel } from "./settings/aura-settings-panel";

const DEFAULT_SIZE = { width: 400, height: 600 };
const MIN_SIZE = { width: 340, height: 420 };
const MAX_SIZE = { width: 640, height: 860 };

export function AuraPanel() {
  const { view, setView, messages, isStreaming, sendMessage, clearConversation, close } = useAuraChatStore();
  const collectContext = useCollectAuraContext();
  const [size, setSize] = useState(DEFAULT_SIZE);
  const dragState = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);

  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    dragState.current = { startX: event.clientX, startY: event.clientY, startWidth: size.width, startHeight: size.height };

    function handleMove(moveEvent: PointerEvent) {
      if (!dragState.current) return;
      const deltaX = dragState.current.startX - moveEvent.clientX;
      const deltaY = dragState.current.startY - moveEvent.clientY;
      setSize({
        width: clamp(dragState.current.startWidth + deltaX, MIN_SIZE.width, MAX_SIZE.width),
        height: clamp(dragState.current.startHeight + deltaY, MIN_SIZE.height, MAX_SIZE.height),
      });
    }

    function handleUp() {
      dragState.current = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function handleSend(text: string) {
    void sendMessage(text, collectContext());
  }

  return (
    <div
      style={{ width: size.width, height: size.height }}
      className="pointer-events-auto fixed right-5 bottom-24 z-(--z-modal) flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-elevated data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-(--duration-normal)"
      data-state="open"
      role="dialog"
      aria-label="AURA AI assistant"
    >
      <div
        onPointerDown={handleResizeStart}
        className="absolute top-0 left-0 size-4 cursor-nwse-resize"
        aria-hidden
      />

      <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface-elevated px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-accent-muted text-accent">
            <AuraMark />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">AURA</p>
            <p className="text-[11px] text-foreground-subtle">AgriNexus AI Assistant</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {view === "chat" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label="Clear conversation"
                  icon={<Trash2 className="size-4" />}
                  intent="ghost"
                  size="sm"
                  disabled={messages.length === 0}
                  onClick={clearConversation}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom">Clear conversation</TooltipContent>
            </Tooltip>
          ) : null}

          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                aria-label={view === "chat" ? "Open AURA settings" : "Back to chat"}
                icon={<Settings2 className="size-4" />}
                intent={view === "settings" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView(view === "chat" ? "settings" : "chat")}
              />
            </TooltipTrigger>
            <TooltipContent side="bottom">{view === "chat" ? "Settings" : "Back to chat"}</TooltipContent>
          </Tooltip>

          <IconButton aria-label="Close AURA" icon={<X className="size-4" />} intent="ghost" size="sm" onClick={close} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {view === "settings" ? (
          <AuraSettingsPanel />
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <MessageList messages={messages} />
            </div>
            <ChatInput disabled={isStreaming} onSend={handleSend} />
          </>
        )}
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function AuraMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3.5">
      <path
        d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"
        fill="currentColor"
      />
    </svg>
  );
}
