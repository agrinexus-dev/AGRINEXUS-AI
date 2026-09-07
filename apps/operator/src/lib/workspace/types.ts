import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * The fixed set of widget identities the registry knows about. Future
 * prompts add real workspaces by registering a component against one of
 * these ids (or extending this union) — the engine itself never assumes
 * anything about what a widget renders.
 */
export type WidgetId =
  | "digital-twin"
  | "weather"
  | "drone-fleet"
  | "robot-fleet"
  | "aura"
  | "analytics"
  | "energy"
  | "sensor-network"
  | "alerts"
  | "mission-queue";

/** Named presets map to a fixed grid span; "custom" holds an explicit one set via the pointer resize handle. */
export type WidgetSizePreset = "small" | "medium" | "large" | "custom";

export interface WidgetSpan {
  columnSpan: number;
  rowSpan: number;
}

export interface WidgetLayoutState {
  size: WidgetSizePreset;
  span: WidgetSpan;
  collapsed: boolean;
  hidden: boolean;
}

/** The extensibility point: what a workspace needs to register itself into the engine. */
export interface WidgetDefinition {
  id: WidgetId;
  title: string;
  icon: LucideIcon;
  defaultSize: Exclude<WidgetSizePreset, "custom">;
  /** Defaults to a generic "Ready" placeholder body when omitted. */
  component?: ComponentType;
}

export interface PersistedWorkspaceLayout {
  version: 1;
  order: WidgetId[];
  widgets: Partial<Record<WidgetId, WidgetLayoutState>>;
}
