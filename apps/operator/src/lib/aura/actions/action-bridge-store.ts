"use client";

import { create } from "zustand";

/**
 * The Action Layer's capability registry — deliberately a
 * SEPARATE store from `context/live-context-store.ts` (013A/013B's Context
 * Engine, left untouched per this change's instructions). That store
 * mirrors read-only DATA; this one holds CALLABLE capabilities the page
 * that owns a piece of UI registers on mount and unregisters on unmount, so
 * the Action Executor can invoke real, existing APIs (camera-rig, layer
 * state, the router) without AURA needing a direct reference to them and
 * without any of those APIs being rewritten.
 */
export interface DigitalTwinActionBridge {
  /** Returns false if the plot doesn't exist. */
  focusPlot: (plotId: string) => boolean;
  /** Returns false if no drone with this id is currently mounted (any fleet drone, not just one hardcoded unit). */
  locateDrone: (id: string) => boolean;
  /** Returns false if no robot with this id is currently mounted (any fleet robot, not just the one hardcoded Robot Bravo). */
  locateRobot: (id: string) => boolean;
  /** Returns false if no sensor with this id exists. Unlike `locateDrone`/`locateRobot`, this doesn't need a live-handle registry — sensors are stationary, so the Sensor Store's own `position` is enough to build a focus target. */
  locateSensor: (id: string) => boolean;
  resetCamera: () => boolean;
  /** Returns false if `key` isn't a real layer id. */
  setLayer: (key: string, enabled: boolean) => boolean;
}

export interface MissionControlActionBridge {
  setPresentationMode: (enabled: boolean) => boolean;
}

interface ActionBridgeState {
  digitalTwin: DigitalTwinActionBridge | null;
  missionControl: MissionControlActionBridge | null;
  navigate: ((path: string) => void) | null;
  /**
   * A sensor id to `locateSensor` as soon as the Digital Twin bridge next
   * registers — set by a page that has to navigate to the
   * Digital Twin first (the bridge only exists while that page is actually
   * mounted, same reason AURA's own `locate-sensor` command already checks
   * `bridge.digitalTwin` before calling it). One-shot: whoever consumes it
   * clears it back to `null` immediately after, the same "already handled,
   * don't fire twice" convention a real event queue would use, kept here
   * instead of a second store since it's one small piece of state closely
   * tied to the bridge it's about.
   */
  pendingSensorLocateId: string | null;
  registerDigitalTwinBridge: (bridge: DigitalTwinActionBridge) => void;
  unregisterDigitalTwinBridge: () => void;
  registerMissionControlBridge: (bridge: MissionControlActionBridge) => void;
  unregisterMissionControlBridge: () => void;
  registerNavigate: (fn: (path: string) => void) => void;
  unregisterNavigate: () => void;
  setPendingSensorLocateId: (id: string | null) => void;
}

export const useActionBridgeStore = create<ActionBridgeState>((set) => ({
  digitalTwin: null,
  missionControl: null,
  navigate: null,
  pendingSensorLocateId: null,
  registerDigitalTwinBridge: (bridge) => set({ digitalTwin: bridge }),
  unregisterDigitalTwinBridge: () => set({ digitalTwin: null }),
  registerMissionControlBridge: (bridge) => set({ missionControl: bridge }),
  unregisterMissionControlBridge: () => set({ missionControl: null }),
  registerNavigate: (fn) => set({ navigate: fn }),
  unregisterNavigate: () => set({ navigate: null }),
  setPendingSensorLocateId: (id) => set({ pendingSensorLocateId: id }),
}));

/**
 * The single place any "Locate" button (Sensor Network's details panel and
 * table row action, today) asks the Digital Twin to focus a sensor (Prompt
 * 018G). If the Digital Twin bridge is already registered (the user is
 * already on that page), this calls it directly — identical to what these
 * buttons already did. Otherwise it navigates to `/digital-twin` via the
 * SAME globally-registered `navigate` bridge AURA's own `open-page` command
 * already uses, and leaves the sensor id as `pendingSensorLocateId` for that
 * page's bridge-registration effect to consume the moment it mounts — no
 * second camera-control system, no new event bus, just the existing bridge
 * store carrying one more small piece of state. A missing/removed sensor
 * still resolves gracefully: `locateSensor` itself already returns `false`
 * rather than throwing, both here and once consumed on the other side.
 */
export function locateSensorInDigitalTwin(sensorId: string): void {
  const { digitalTwin, navigate, setPendingSensorLocateId } = useActionBridgeStore.getState();
  if (digitalTwin) {
    digitalTwin.locateSensor(sensorId);
    return;
  }
  if (!navigate) return;
  setPendingSensorLocateId(sensorId);
  navigate("/digital-twin");
}
