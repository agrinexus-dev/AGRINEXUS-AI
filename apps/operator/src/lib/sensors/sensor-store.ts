"use client";

import { useEffect, useMemo } from "react";
import { create } from "zustand";

import { farmPlots } from "@/components/digital-twin/scene/farm-data";

import type { NewSensorInput, SensorRecord, SensorStatus, SensorTelemetryUpdate } from "./types";

/** Bounds `readingHistory` so it stays a small, fixed-size sparkline window rather than growing forever. */
const READING_HISTORY_LENGTH = 24;

/**
 * The Sensor Store — the single source of truth for every
 * sensor node in AgriNexus, mirroring `lib/fleet/fleet-store.ts` /
 * `lib/robots/robot-store.ts`'s `order`/`records` split so any consumer that
 * only needs "which sensors exist" can skip re-rendering on every live
 * reading tick, exactly like the Fleet/Robot Stores already do.
 *
 * Sensors are stationary — there's no route/movement/`routeVersion` concept
 * here at all, which is why the Digital Twin's `SensorMarkers` (see that
 * component's own doc comment) can subscribe per-sensor directly rather than
 * needing the remount-on-route-change trick drones/robots use.
 *
 * Extended for backend persistence, following the exact
 * pattern `alert-store.ts` established — SAME store, no
 * second one:
 *  - `fetchSensors()` loads whatever's durable in Postgres on mount
 *  (merge-by-id, never clobbering a live local record).
 *  - `addSensor`/`removeSensor` are now genuinely ASYNC (unlike Alert's
 *  fire-and-forget openAlert/resolveAlert) — these are discrete, rare,
 *  user-initiated actions (a dialog submit, a delete button), not a
 *  high-frequency simulation tick, so awaiting the real API result before
 *  committing local state is both correct AND cheap: it's what lets this
 *  store honestly satisfy "do not fabricate successful creation if the
 * API fails" — the sensor only ever appears locally
 *  once the database row genuinely exists.
 *  - `setMaintenanceMode`/`calibrateSensor`/`restartSensor` stay
 *  synchronous (the existing UI has no loading state for these buttons)
 *  but now ALSO fire a best-effort persistence PATCH, same fire-and-forget
 *  pattern Alert's openAlert/resolveAlert use — these are still
 *  low-frequency, deliberate clicks, not a tick.
 *  - `updateReading`/`updateBattery`/`updateSignal`/`updateTelemetry` —
 *  the actual 2-second simulation tick's own actions — are DELIBERATELY
 *  UNCHANGED: no per-call persistence. Writing every 2s tick for every
 *  sensor straight to Postgres is exactly the write-storm to avoid.
 *  See `useSensorTelemetrySync` at the bottom of
 *  this file instead — a separate, slow (30s) interval that PATCHes each
 *  sensor's CURRENT snapshot, mounted once from `sensor-network-page.tsx`.
 */
interface SensorState {
  order: string[];
  sensors: Record<string, SensorRecord>;
  selectedSensorId: string | null;
  hydration: "idle" | "loading" | "loaded" | "error";
  hydrationError: string | null;

  addSensor: (input: NewSensorInput) => Promise<SensorRecord>;
  removeSensor: (id: string) => Promise<void>;
  updateSensor: (
    id: string,
    update: Partial<Pick<SensorRecord, "name" | "gateway" | "samplingIntervalSeconds" | "notes" | "assignedPlotId" | "communicationType">>,
  ) => void;
  updateReading: (id: string, reading: number) => void;
  updateBattery: (id: string, batteryPercent: number) => void;
  updateSignal: (id: string, signalPercent: number) => void;
  updateTelemetry: (id: string, update: SensorTelemetryUpdate) => void;
  selectSensor: (id: string | null) => void;
  setMaintenanceMode: (id: string, enabled: boolean) => void;
  calibrateSensor: (id: string) => void;
  restartSensor: (id: string) => void;
  fetchSensors: () => Promise<void>;
}

let idSuffix = 0;
function generateSensorId(name: string): string {
  idSuffix += 1;
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return `${slug || "sensor"}-${idSuffix}`;
}

/** Fire-and-forget telemetry PATCH — logged, never thrown; a failed persist must never break the (synchronous) in-memory action it backs. Shared by the three discrete telemetry actions below AND by `useSensorTelemetrySync`'s slow background loop. */
function persistTelemetry(id: string, update: SensorTelemetryUpdate): void {
  fetch(`/api/sensors/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  }).catch(() => {
    // Best-effort — see this file's own doc comment on the tick-vs-action persistence split.
  });
}

export const useSensorStore = create<SensorState>((set, get) => {
  return {
    // No hardcoded
    // starter sensors. This store previously always began with 5 seeded
    // sensors regardless of which farm (or whether anyone) was
    // authenticated; combined with the old additive-only `fetchSensors()`
    // merge (below), a sensor from a PREVIOUSLY authenticated farm in this
    // same browser tab — including this seed — could survive into a
    // different farm's session and leak into that farm's AURA context,
    // the same vulnerability class fixed for `fleet-store.ts` /
    // `robot-store.ts`. The correct empty starting state is "no
    // authenticated farm → no farm sensors"; `fetchSensors()` below is now
    // the ONLY source of truth for what populates this store, for every
    // farm, including `farm_demo` (whose 5 real sensors already exist as
    // their own persisted Postgres rows, seeded by `scripts/seed-sensors.ts`
    // with these exact same ids/names, and load in normally on first
    // fetch — no client-side duplicate of them is needed anymore).
    order: [],
    sensors: {},
    selectedSensorId: null,
    hydration: "idle",
    hydrationError: null,

    addSensor: async (input) => {
      const id = generateSensorId(input.name);

      const response = await fetch("/api/sensors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...input }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Failed to create sensor (${response.status}).`);
      }
      const body = (await response.json()) as { sensor: SensorRecord };
      const record = body.sensor;

      set((state) => ({
        order: [...state.order, record.id],
        sensors: { ...state.sensors, [record.id]: record },
      }));

      return record;
    },

    removeSensor: async (id) => {
      if (!(id in get().sensors)) return;

      const response = await fetch(`/api/sensors/${id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Failed to delete sensor (${response.status}).`);
      }

      set((state) => {
        const sensors = { ...state.sensors };
        delete sensors[id];
        return {
          order: state.order.filter((existingId) => existingId !== id),
          sensors,
          selectedSensorId: state.selectedSensorId === id ? null : state.selectedSensorId,
        };
      });
    },

    updateSensor: (id, update) => {
      set((state) => {
        const existing = state.sensors[id];
        if (!existing) return state;
        return { sensors: { ...state.sensors, [id]: { ...existing, ...update } } };
      });
    },

    updateReading: (id, reading) => {
      set((state) => {
        const existing = state.sensors[id];
        if (!existing) return state;
        const now = Date.now();
        const history = [...existing.readingHistory, reading].slice(-READING_HISTORY_LENGTH);
        return {
          sensors: {
            ...state.sensors,
            [id]: { ...existing, previousReading: existing.currentReading, currentReading: reading, readingHistory: history, lastReadingAt: now, lastUpdatedAt: now },
          },
        };
      });
    },

    updateBattery: (id, batteryPercent) => {
      set((state) => {
        const existing = state.sensors[id];
        if (!existing) return state;
        return { sensors: { ...state.sensors, [id]: { ...existing, batteryPercent, lastUpdatedAt: Date.now() } } };
      });
    },

    updateSignal: (id, signalPercent) => {
      set((state) => {
        const existing = state.sensors[id];
        if (!existing) return state;
        return { sensors: { ...state.sensors, [id]: { ...existing, signalPercent, lastUpdatedAt: Date.now() } } };
      });
    },

    updateTelemetry: (id, update) => {
      set((state) => {
        const existing = state.sensors[id];
        if (!existing) return state;
        return { sensors: { ...state.sensors, [id]: { ...existing, ...update, lastUpdatedAt: Date.now() } } };
      });
    },

    selectSensor: (id) => set({ selectedSensorId: id }),

    setMaintenanceMode: (id, enabled) => {
      set((state) => {
        const existing = state.sensors[id];
        if (!existing) return state;
        const status: SensorStatus = enabled ? "maintenance" : "online";
        return { sensors: { ...state.sensors, [id]: { ...existing, status, lastUpdatedAt: Date.now() } } };
      });
      persistTelemetry(id, { status: enabled ? "maintenance" : "online" });
    },

    calibrateSensor: (id) => {
      set((state) => {
        const existing = state.sensors[id];
        if (!existing) return state;
        return { sensors: { ...state.sensors, [id]: { ...existing, health: "nominal", lastUpdatedAt: Date.now() } } };
      });
      persistTelemetry(id, { health: "nominal" });
    },

    restartSensor: (id) => {
      set((state) => {
        const existing = state.sensors[id];
        if (!existing) return state;
        return {
          sensors: {
            ...state.sensors,
            [id]: { ...existing, status: "online", health: "nominal", signalPercent: Math.max(existing.signalPercent, 90), lastUpdatedAt: Date.now() },
          },
        };
      });
      const restarted = get().sensors[id];
      if (restarted) persistTelemetry(id, { status: "online", health: "nominal", signalPercent: restarted.signalPercent });
    },

    fetchSensors: async () => {
      if (get().hydration === "loading") return;
      set({ hydration: "loading", hydrationError: null });

      try {
        const response = await fetch("/api/sensors");
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Request failed (${response.status}).`);
        }
        const body = (await response.json()) as { sensors: SensorRecord[] };

        set((state) => {
          // This farm's own `/api/sensors` response is now the
          // COMPLETE, AUTHORITATIVE set of sensors for this session: the
          // reconciled state below contains ONLY ids present in
          // `body.sensors`. An id that used to be in `state.sensors` but is
          // NOT in this response — because it belongs to a different farm
          // that a previous session in this tab authenticated as, or
          // because it was deleted — is dropped here, never carried
          // forward. This is the same fix `fleet-store.ts`/`robot-store.ts`
          // already got: an additive merge could never remove a
          // stale/foreign entry, only a full rebuild from the fresh list
          // can.
          //
          // Unlike drones/robots, `/api/sensors` returns FULL records
          // (identity AND a DB-persisted telemetry snapshot) — sensors
          // genuinely persist telemetry (see `useSensorTelemetrySync`'s
          // slow 30s PATCH loop), drones/robots deliberately don't. So for
          // an id already known locally, this preserves the ORIGINAL
          // "never overwrite a live record" intent: identity/config fields
          // adopt the fresh authoritative values, but the already-known
          // record's own live telemetry (updated every 2s by
          // `use-sensor-simulation.ts`) wins over the API's own telemetry
          // snapshot, which can be up to ~30s stale by design.
          const nextSensors: Record<string, SensorRecord> = {};
          const nextOrder: string[] = [];
          for (const sensor of body.sensors) {
            const existing = state.sensors[sensor.id];
            nextSensors[sensor.id] = existing
              ? {
                  ...sensor,
                  status: existing.status,
                  health: existing.health,
                  batteryPercent: existing.batteryPercent,
                  signalPercent: existing.signalPercent,
                  currentReading: existing.currentReading,
                  previousReading: existing.previousReading,
                  readingHistory: existing.readingHistory,
                  lastReadingAt: existing.lastReadingAt,
                  lastUpdatedAt: existing.lastUpdatedAt,
                }
              : sensor;
            nextOrder.push(sensor.id);
          }
          // A previously-selected sensor that didn't survive reconciliation
          // (e.g. it belonged to a different farm's now-superseded local
          // state) must not leave a dangling `selectedSensorId` — mirrors
          // `removeSensor`'s own clearing behavior above, and
          // `robot-store.ts`'s equivalent fix.
          const selectedSensorId = state.selectedSensorId && nextSensors[state.selectedSensorId] ? state.selectedSensorId : null;
          return { sensors: nextSensors, order: nextOrder, selectedSensorId, hydration: "loaded", hydrationError: null };
        });
      } catch (error) {
        set({ hydration: "error", hydrationError: error instanceof Error ? error.message : "Failed to load sensors." });
      }
    },
  };
});

/** The stable id list — safe for components that must not rerender on reading ticks (only changes on add/remove). Mirrors `useRobotOrder`. */
export function useSensorOrder(): string[] {
  return useSensorStore((state) => state.order);
}

/** All sensor records, live telemetry included — for the Sensor Network page, Mission Control widgets, and AURA's context (not render-sensitive). Mirrors `useRobots`. */
export function useSensors(): SensorRecord[] {
  const order = useSensorOrder();
  const sensors = useSensorStore((state) => state.sensors);
  return useMemo(() => order.map((id) => sensors[id]).filter((sensor): sensor is SensorRecord => Boolean(sensor)), [order, sensors]);
}

export function useSelectedSensor(): SensorRecord | null {
  return useSensorStore((state) => (state.selectedSensorId ? (state.sensors[state.selectedSensorId] ?? null) : null));
}

/** Looks up the plot label a sensor is assigned to, if any — used by both the table and the Digital Twin marker label. Reads `farmPlots` directly (read-only import), never duplicated. */
export function sensorPlotLabel(sensor: Pick<SensorRecord, "assignedPlotId">): string | null {
  if (!sensor.assignedPlotId) return null;
  return farmPlots.find((plot) => plot.id === sensor.assignedPlotId)?.label ?? null;
}

/** Read-only hydration status for the Sensor Network page's loading/error UI (mirrors `useAlertHydration`). */
export function useSensorHydration(): { status: SensorState["hydration"]; error: string | null } {
  const status = useSensorStore((state) => state.hydration);
  const error = useSensorStore((state) => state.hydrationError);
  return { status, error };
}

const TELEMETRY_SYNC_MS = 30_000;

/**
 * Slow background persistence sync — every 30s,
 * PATCHes each currently-known sensor's CURRENT telemetry snapshot to the
 * backend. Deliberately NOT tied to `use-sensor-simulation.ts`'s 2s tick —
 * persisting every tick for every sensor would be exactly the unnecessary
 * write-storm Part 16 warns against. 30s is a judgment call, not a measured
 * number: frequent enough that a page load minutes later still sees
 * reasonably fresh state, infrequent enough that N sensors cost at most
 * N requests every 30s, not every 2s (a 15x reduction). Mount this once,
 * page-scoped, the same lifecycle every other simulation hook in this app
 * already uses — see `sensor-network-page.tsx`.
 */
export function useSensorTelemetrySync(): void {
  useEffect(() => {
    function sync() {
      const { order, sensors } = useSensorStore.getState();
      for (const id of order) {
        const sensor = sensors[id];
        if (!sensor) continue;
        persistTelemetry(id, {
          batteryPercent: sensor.batteryPercent,
          signalPercent: sensor.signalPercent,
          currentReading: sensor.currentReading,
          previousReading: sensor.previousReading,
          readingHistory: sensor.readingHistory,
          lastReadingAt: sensor.lastReadingAt,
          status: sensor.status,
          health: sensor.health,
        });
      }
    }

    const interval = setInterval(sync, TELEMETRY_SYNC_MS);
    return () => clearInterval(interval);
  }, []);
}
