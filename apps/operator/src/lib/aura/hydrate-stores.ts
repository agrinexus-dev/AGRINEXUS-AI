"use client";

import { useEffect } from "react";

import { fetchAutonomousState } from "@/lib/autonomous/autonomous-behavior";
import { useFindingStore } from "@/lib/findings/finding-store";
import { useFleetStore } from "@/lib/fleet/fleet-store";
import { useMissionStore } from "@/lib/missions/mission-store";
import { usePlotStore } from "@/lib/plots/plot-store";
import { useRecurringMissionStore } from "@/lib/recurring-missions/recurring-mission-store";
import { useRobotMissionStore } from "@/lib/robot-missions/robot-mission-store";
import { useRobotStore } from "@/lib/robots/robot-store";
import { useAlertStore } from "@/lib/sensor-analytics/alert-store";
import { useSensorStore } from "@/lib/sensors/sensor-store";
import { fetchWeather } from "@/lib/weather/weather-store";

/**
 * Extracted from `components/aura/aura-mount.tsx` (see that
 * file's own doc comments for the full history of why every one of these
 * 10 calls exists — AURA's context depends on all of them regardless of
 * which page first mounted). `AuraMount` now calls this hook instead of
 * inlining the effect; the new Farmer AURA full page (`app/farmer/aura`)
 * calls the same hook rather than re-fetching a second, page-local copy —
 * Part 19's "do not create a second AURA implementation" applies to data
 * hydration too, not just the provider/context pipeline.
 */
export function useHydrateAuraDataStores(): void {
  useEffect(() => {
    void useFindingStore.getState().fetchFindings();
    void usePlotStore.getState().fetchPlots();
    void useRecurringMissionStore.getState().fetchRecurringMissions();
    void useFleetStore.getState().fetchDrones();
    void useRobotStore.getState().fetchRobots();
    void useSensorStore.getState().fetchSensors();
    void useAlertStore.getState().fetchAlerts();
    void useMissionStore.getState().fetchMissions();
    void useRobotMissionStore.getState().fetchRobotMissions();
    void fetchAutonomousState();
    void fetchWeather();
  }, []);
}
