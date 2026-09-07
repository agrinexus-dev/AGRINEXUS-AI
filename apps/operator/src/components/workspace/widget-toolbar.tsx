"use client";

import {
  ChevronDown,
  ChevronUp,
  EyeOff,
  GripVertical,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";

import { cn, IconButton, Tooltip, TooltipContent, TooltipTrigger } from "@agrinexus/ui";

import type { WidgetSizePreset } from "@/lib/workspace/types";

const SIZE_PRESETS: { preset: Exclude<WidgetSizePreset, "custom">; label: string }[] = [
  { preset: "small", label: "S" },
  { preset: "medium", label: "M" },
  { preset: "large", label: "L" },
];

export interface WidgetToolbarProps {
  title: string;
  size: WidgetSizePreset;
  collapsed: boolean;
  fullscreen: boolean;
  dragAttributes: DraggableAttributes;
  dragListeners: DraggableSyntheticListeners;
  onSetPreset: (preset: Exclude<WidgetSizePreset, "custom">) => void;
  onToggleCollapse: () => void;
  onToggleFullscreen: () => void;
  onHide: () => void;
}

function ToolbarButton({
  label,
  icon,
  onClick,
  active,
  ...rest
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          aria-label={label}
          icon={icon}
          size="sm"
          intent={active ? "secondary" : "ghost"}
          onClick={onClick}
          {...rest}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function WidgetToolbar({
  title,
  size,
  collapsed,
  fullscreen,
  dragAttributes,
  dragListeners,
  onSetPreset,
  onToggleCollapse,
  onToggleFullscreen,
  onHide,
}: WidgetToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <div className="mr-1 flex overflow-hidden rounded-md border border-border-subtle">
        {SIZE_PRESETS.map(({ preset, label }) => (
          <button
            key={preset}
            type="button"
            aria-label={`Resize ${title} to ${preset}`}
            aria-pressed={size === preset}
            onClick={() => onSetPreset(preset)}
            className={cn(
              "px-1.5 py-0.5 text-[10px] font-medium tracking-wide transition-colors duration-(--duration-fast) ease-standard",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              // UI-UPGRADE.3 — was `bg-white/[var(--opacity-hover)]`; see `sensor-table.tsx`'s identical fix.
              size === preset
                ? "bg-accent-muted text-accent"
                : "text-foreground-subtle hover:bg-foreground/[var(--opacity-hover)] hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <ToolbarButton
        label={`Reorder ${title}`}
        icon={<GripVertical />}
        className="cursor-grab active:cursor-grabbing"
        {...dragAttributes}
        {...dragListeners}
      />
      <ToolbarButton
        label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        icon={collapsed ? <ChevronDown /> : <ChevronUp />}
        onClick={onToggleCollapse}
      />
      <ToolbarButton
        label={fullscreen ? `Exit fullscreen` : `Fullscreen ${title}`}
        icon={fullscreen ? <Minimize2 /> : <Maximize2 />}
        onClick={onToggleFullscreen}
        active={fullscreen}
      />
      <ToolbarButton label={`Hide ${title}`} icon={<EyeOff />} onClick={onHide} />
    </div>
  );
}
