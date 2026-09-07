import type { AlertSeverity, AlertType, ThresholdConfig } from "./types";

/**
 * The Agricultural Reasoning Engine ("Agricultural Reasoning
 * Engine") — a small, pure, deterministic decision layer over THIS farm's
 * actual sensor/threshold/alert data. Every function here takes plain data
 * in and returns plain data out (no store reads, no React, no randomness),
 * mirroring the same "pure functions, callers assemble the input" shape
 * `trend-analysis.ts` already establishes — so it's trivially unit-testable
 * and reusable from AURA's action executor, the general chat context
 * builder, and the Digital Twin's details panel alike.
 *
 * This is NOT the static `agriculture-knowledge.ts` reference (which
 * explains general concepts like "What is NDVI?") — this module evaluates
 * REAL values for a REAL plot and never fabricates a measurement. If the
 * data a rule needs isn't available, it returns the explicit "unavailable"
 * action rather than guessing (see `evaluatePlotCondition`'s doc comment).
 *
 * The store-reading glue that assembles this module's input from the
 * Sensor/Threshold/Alert/Historical Stores lives in `mission-integration.ts`
 * (`buildReasoningInputForPlot`/`getPlotRecommendation`) — kept separate so
 * this file stays store-free and the "pure vs. wired" boundary is obvious.
 */

export type ReasoningAction = "irrigate" | "inspect" | "monitor" | "unavailable";
export type ReasoningConfidence = "high" | "moderate" | "low";

export interface ReasoningSensorReading {
  sensorId: string;
  sensorName: string;
  currentReading: number;
}

export interface ReasoningAlertInput {
  alertType: AlertType;
  severity: AlertSeverity;
  sensorName: string;
}

/**
 * Everything the reasoning rules below need for ONE plot, already resolved
 * against real store data by the caller — every field is either a real
 * value or explicitly absent (`[]`/`null`), never a placeholder.
 */
export interface PlotReasoningInput {
  plotId: string;
  plotLabel: string;
  /** Real soil-moisture sensor readings assigned to this plot — empty if none exist. */
  soilMoistureReadings: ReasoningSensorReading[];
  /** Real soil/air-temperature sensor readings assigned to this plot — empty if none exist. */
  temperatureReadings: ReasoningSensorReading[];
  /** The currently configured Threshold Store values ("Thresholds") — the same config the Smart Alerts ticker evaluates against. */
  soilMoistureThreshold: ThresholdConfig;
  temperatureThreshold: ThresholdConfig;
  /** Currently UNRESOLVED alerts whose sensor is assigned to this plot. */
  activeAlerts: ReasoningAlertInput[];
  /** Any sensor assigned to this plot reporting `status: "critical"` or `"offline"` — a real store fact, not inferred. */
  unhealthySensorCount: number;
  /** Soil-moisture trend direction from the Historical Store, if enough history exists yet — `null` when there isn't. Never fabricated. */
  soilMoistureTrend: "rising" | "falling" | "stable" | null;
}

export interface PlotRecommendation {
  plotId: string;
  plotLabel: string;
  action: ReasoningAction;
  reason: string;
  /** `null` only for `action: "unavailable"` — every real recommendation states how confident it is. */
  confidence: ReasoningConfidence | null;
  /** Names of the sensors whose readings actually drove this recommendation — always real Sensor Store names, never fabricated. */
  sourceSensors: string[];
}

function average(readings: ReasoningSensorReading[]): number {
  return readings.reduce((sum, entry) => sum + entry.currentReading, 0) / readings.length;
}

/**
 * The core deterministic rule set ("Initial reasoning rules"):
 *
 *  1. LOW SOIL MOISTURE (average below the configured threshold minimum)
 *  → recommend irrigation.
 *  2. HIGH DISEASE RISK / ABNORMAL CONDITION (an active abnormal-temperature
 *  alert, an active sensor-offline alert, or any sensor on this plot
 *  reporting critical/offline health) → recommend inspection.
 *  3. Otherwise → recommend monitoring (normal conditions).
 *
 * Evaluated in that order — irrigation need is checked first because it's
 * the more time-sensitive condition, matching the prompt's own flow
 * (low moisture is the chain's entry point). If the data a rule needs isn't
 * available at all (no soil-moisture sensor assigned to this plot), the
 * function returns `action: "unavailable"` rather than silently falling
 * through to "monitor" — an untested plot is not the same as a healthy one.
 *
 * This deliberately does NOT use machine learning or a black-box score —
 * every branch is a plain, explainable threshold comparison over real data,
 * per the prompt's own "do not over-engineer" instruction.
 */
export function evaluatePlotCondition(input: PlotReasoningInput): PlotRecommendation {
  const { plotId, plotLabel } = input;

  if (input.soilMoistureReadings.length === 0) {
    return {
      plotId,
      plotLabel,
      action: "unavailable",
      reason: `Soil moisture data is currently unavailable for ${plotLabel} — no soil moisture sensor is assigned to this plot.`,
      confidence: null,
      sourceSensors: [],
    };
  }

  const avgMoisture = average(input.soilMoistureReadings);
  const moistureSensorNames = input.soilMoistureReadings.map((entry) => entry.sensorName);

  if (avgMoisture < input.soilMoistureThreshold.min) {
    const hasActiveLowMoistureAlert = input.activeAlerts.some((alert) => alert.alertType === "low-soil-moisture");
    const severelyLow = avgMoisture < input.soilMoistureThreshold.min / 2;
    const confidence: ReasoningConfidence = hasActiveLowMoistureAlert || severelyLow ? "high" : "moderate";
    const trendNote = input.soilMoistureTrend === "falling" ? " and is still declining" : "";

    return {
      plotId,
      plotLabel,
      action: "irrigate",
      reason: `${plotLabel} average soil moisture is ${avgMoisture.toFixed(1)}% (${moistureSensorNames.join(", ")}), below the configured threshold of ${input.soilMoistureThreshold.min}%${trendNote}.`,
      confidence,
      sourceSensors: moistureSensorNames,
    };
  }

  const abnormalTemperatureAlert = input.activeAlerts.find((alert) => alert.alertType === "abnormal-temperature");
  const offlineAlert = input.activeAlerts.find((alert) => alert.alertType === "sensor-offline");

  if (abnormalTemperatureAlert || offlineAlert || input.unhealthySensorCount > 0) {
    const reasonParts: string[] = [];
    const sourceSensors = new Set<string>();

    if (abnormalTemperatureAlert) {
      reasonParts.push(`${abnormalTemperatureAlert.sensorName} is reporting an abnormal temperature`);
      sourceSensors.add(abnormalTemperatureAlert.sensorName);
    }
    if (offlineAlert) {
      reasonParts.push(`${offlineAlert.sensorName} is offline`);
      sourceSensors.add(offlineAlert.sensorName);
    }
    if (input.unhealthySensorCount > 0 && sourceSensors.size === 0) {
      reasonParts.push(`${input.unhealthySensorCount} sensor${input.unhealthySensorCount === 1 ? "" : "s"} on this plot ${input.unhealthySensorCount === 1 ? "is" : "are"} reporting critical or offline health`);
    }

    const severity: ReasoningConfidence = input.activeAlerts.some((alert) => alert.severity === "critical") ? "high" : "moderate";

    return {
      plotId,
      plotLabel,
      action: "inspect",
      reason: `${plotLabel} has an abnormal condition — ${reasonParts.join("; ")}.`,
      confidence: severity,
      sourceSensors: sourceSensors.size > 0 ? Array.from(sourceSensors) : moistureSensorNames,
    };
  }

  return {
    plotId,
    plotLabel,
    action: "monitor",
    reason: `${plotLabel} average soil moisture is ${avgMoisture.toFixed(1)}% (at or above the ${input.soilMoistureThreshold.min}% threshold) with no active alerts — conditions are normal.`,
    confidence: "high",
    sourceSensors: moistureSensorNames,
  };
}

/** Severity ranking for sorting a farm-wide recommendation list — irrigate ranks above inspect above monitor above unavailable, and within a tier, high confidence ranks above moderate/low, matching the prompt's own "1. Plot A — Critical... 2. Plot C — Moisture declining... 3. Plot D — Normal" ranked-list example. */
const ACTION_RANK: Record<ReasoningAction, number> = { irrigate: 0, inspect: 1, monitor: 2, unavailable: 3 };
const CONFIDENCE_RANK: Record<ReasoningConfidence, number> = { high: 0, moderate: 1, low: 2 };

export function rankRecommendations(recommendations: PlotRecommendation[]): PlotRecommendation[] {
  return [...recommendations].sort((a, b) => {
    const actionDelta = ACTION_RANK[a.action] - ACTION_RANK[b.action];
    if (actionDelta !== 0) return actionDelta;
    const confidenceDelta = (a.confidence ? CONFIDENCE_RANK[a.confidence] : 3) - (b.confidence ? CONFIDENCE_RANK[b.confidence] : 3);
    if (confidenceDelta !== 0) return confidenceDelta;
    return a.plotLabel.localeCompare(b.plotLabel);
  });
}
