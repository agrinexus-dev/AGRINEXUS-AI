"use client";

import type { ReactElement } from "react";
import { Bot, Layers, PlaneTakeoff, PresentationIcon, RotateCcw, Settings } from "lucide-react";

import { Divider, IconButton, Tooltip, TooltipContent, TooltipTrigger } from "@agrinexus/ui";

export type FollowTarget = "drone" | "robot" | null;

export interface ToolbarProps {
  layerPanelOpen: boolean;
  onToggleLayerPanel: () => void;
  onResetCamera: () => void;
  presentation: boolean;
  onTogglePresentation: () => void;
  followTarget: FollowTarget;
  onToggleFollow: (target: "drone" | "robot") => void;
  droneAvailable: boolean;
  robotAvailable: boolean;
}

export function Toolbar({
  layerPanelOpen,
  onToggleLayerPanel,
  onResetCamera,
  presentation,
  onTogglePresentation,
  followTarget,
  onToggleFollow,
  droneAvailable,
  robotAvailable,
}: ToolbarProps) {
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-0 z-10 flex items-center gap-1 border-b border-border-subtle bg-surface-elevated/80 px-3 py-2 backdrop-blur-md">
      <ToolbarButton label="Layers" icon={<Layers />} active={layerPanelOpen} onClick={onToggleLayerPanel} />
      <ToolbarButton label="Reset Camera" icon={<RotateCcw />} onClick={onResetCamera} />
      <Divider orientation="vertical" className="mx-1 h-5" />
      {/* Following an already-active target exits Camera Follow — a press-to-follow / press-again-to-exit toggle covers "Follow Drone", "Follow Robot", and "Exit Follow" with one control per unit, rather than a third dedicated exit button. */}
      <ToolbarButton
        label={followTarget === "drone" ? "Exit Follow" : "Follow Drone"}
        icon={<PlaneTakeoff />}
        active={followTarget === "drone"}
        disabled={!droneAvailable}
        onClick={() => onToggleFollow("drone")}
      />
      <ToolbarButton
        label={followTarget === "robot" ? "Exit Follow" : "Follow Robot"}
        icon={<Bot />}
        active={followTarget === "robot"}
        disabled={!robotAvailable}
        onClick={() => onToggleFollow("robot")}
      />
      <Divider orientation="vertical" className="mx-1 h-5" />
      <ToolbarButton label="Presentation" icon={<PresentationIcon />} active={presentation} onClick={onTogglePresentation} />
      {/* Nothing to configure yet — present for layout completeness, matches the "inert until wired" pattern used by Command Center's own placeholder actions. */}
      <ToolbarButton label="Settings" icon={<Settings />} onClick={() => undefined} />
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  icon: ReactElement;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolbarButton({ label, icon, active, disabled, onClick }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          aria-label={label}
          aria-pressed={active}
          icon={icon}
          intent={active ? "primary" : "ghost"}
          size="sm"
          disabled={disabled}
          onClick={onClick}
        />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
