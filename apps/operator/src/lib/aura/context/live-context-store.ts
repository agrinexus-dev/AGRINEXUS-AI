"use client";

import { create } from "zustand";

export interface LiveSelection {
  id: string;
  type: string;
  label: string;
  meta: string;
}

export interface LiveHover {
  id: string;
  type: string;
  label: string;
}

export interface LiveUnitTelemetry {
  battery: number | null;
  speedMps: number | null;
  status: string | null;
  currentLabel: string | null;
  position: { x: number; z: number } | null;
  altitude: number | null;
}

interface MissionControlSlice {
  presentationMode: boolean | null;
  activeWidgets: string[] | null;
}

interface DigitalTwinSlice {
  selectedEntity: LiveSelection | null;
  hoveredEntity: LiveHover | null;
  weatherPreset: string | null;
  visibleLayers: string[] | null;
  enabledIntelligenceLayers: string[] | null;
  cameraMode: "free" | "follow-drone" | "follow-robot" | null;
}

interface LiveContextState {
  missionControl: MissionControlSlice;
  digitalTwin: DigitalTwinSlice;
  droneTelemetry: LiveUnitTelemetry | null;
  robotTelemetry: LiveUnitTelemetry | null;

  publishMissionControlContext: (partial: Partial<MissionControlSlice>) => void;
  publishDigitalTwinContext: (partial: Partial<Omit<DigitalTwinSlice, "hoveredEntity">>) => void;
  publishHover: (hover: LiveHover | null) => void;
  publishDroneTelemetry: (telemetry: LiveUnitTelemetry | null) => void;
  publishRobotTelemetry: (telemetry: LiveUnitTelemetry | null) => void;
}

/** One level deep, and one level deeper still for any plain-object field (covers `position: {x,z}` without needing a full recursive deep-equal). */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) => {
    const aValue = (a as Record<string, unknown>)[key];
    const bValue = (b as Record<string, unknown>)[key];
    if (aValue === bValue) return true;
    if (typeof aValue === "object" && typeof bValue === "object" && aValue !== null && bValue !== null) {
      const aInner = aValue as Record<string, unknown>;
      const bInner = bValue as Record<string, unknown>;
      const innerKeys = Object.keys(aInner);
      return (
        innerKeys.length === Object.keys(bInner).length && innerKeys.every((innerKey) => aInner[innerKey] === bInner[innerKey])
      );
    }
    return false;
  });
}

/**
 * The single Context Engine store — every module that has live state
 * AURA should see publishes into
 * this ONE store rather than each owning its own. Every setter shallow-
 * compares before calling `set`, so a module re-publishing an unchanged
 * value (e.g. a poll tick where nothing moved) never triggers a rerender —
 * "publish only changed values".
 */
export const useLiveContextStore = create<LiveContextState>((set, get) => ({
  missionControl: { presentationMode: null, activeWidgets: null },
  digitalTwin: {
    selectedEntity: null,
    hoveredEntity: null,
    weatherPreset: null,
    visibleLayers: null,
    enabledIntelligenceLayers: null,
    cameraMode: null,
  },
  droneTelemetry: null,
  robotTelemetry: null,

  publishMissionControlContext: (partial) => {
    const next = { ...get().missionControl, ...partial };
    if (shallowEqual(get().missionControl, next)) return;
    set({ missionControl: next });
  },

  publishDigitalTwinContext: (partial) => {
    const next = { ...get().digitalTwin, ...partial };
    if (shallowEqual(get().digitalTwin, next)) return;
    set({ digitalTwin: next });
  },

  publishHover: (hover) => {
    const current = get().digitalTwin;
    if (shallowEqual(current.hoveredEntity, hover)) return;
    set({ digitalTwin: { ...current, hoveredEntity: hover } });
  },

  publishDroneTelemetry: (telemetry) => {
    if (shallowEqual(get().droneTelemetry, telemetry)) return;
    set({ droneTelemetry: telemetry });
  },

  publishRobotTelemetry: (telemetry) => {
    if (shallowEqual(get().robotTelemetry, telemetry)) return;
    set({ robotTelemetry: telemetry });
  },
}));
