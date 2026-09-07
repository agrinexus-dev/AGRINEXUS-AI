import { WEATHER_THRESHOLDS } from "./weather-thresholds";
import type { AgriculturalWeatherAnalysis, WeatherCurrent, WeatherForecastDay, WeatherRiskFactor } from "./types";

/**
 * Turns REAL weather values into farm-operation
 * risk indicators. Pure function, no store/API access — takes exactly the
 * real current/forecast-today values already fetched, computes everything
 * from the single centralized `WEATHER_THRESHOLDS` table. Never invents a
 * value: every branch below reads only fields already present on
 * `WeatherCurrent`/`WeatherForecastDay`, and a `null` input field degrades
 * the corresponding factor to "insufficient data" text rather than a
 * fabricated guess.
 *
 * INFORMATIONAL ONLY — nothing in this module or its caller ever
 * touches a mission/robot/drone store. It answers "what does the weather
 * suggest", never "do this".
 */
export function computeAgriculturalAnalysis(current: WeatherCurrent, today: WeatherForecastDay | undefined): AgriculturalWeatherAnalysis {
  const t = WEATHER_THRESHOLDS;
  const isSevere = t.severeConditionCodes.includes(current.conditionCode as (typeof t.severeConditionCodes)[number]);

  const windKmh = current.windSpeedKmh;
  const gustsKmh = current.windGustsKmh;
  const effectiveWindKmh = windKmh !== null && gustsKmh !== null ? Math.max(windKmh, gustsKmh) : (windKmh ?? gustsKmh);

  const rainProbability = today?.precipitationProbabilityPercent ?? null;
  const activeRain = current.precipitationMm !== null && current.precipitationMm >= t.rain.activeRainMm;

  // ---------- Rain risk ----------
  let rainRisk: WeatherRiskFactor;
  if (isSevere) {
    rainRisk = { level: "high-risk", reason: `${current.conditionText} — severe weather in progress.` };
  } else if (activeRain) {
    rainRisk = { level: "high-risk", reason: `Active precipitation right now (${current.precipitationMm!.toFixed(1)} mm in the last hour).` };
  } else if (rainProbability !== null && rainProbability >= t.rain.highRiskProbabilityPercent) {
    rainRisk = { level: "high-risk", reason: `${rainProbability}% chance of rain today.` };
  } else if (rainProbability !== null && rainProbability >= t.rain.cautionProbabilityPercent) {
    rainRisk = { level: "caution", reason: `${rainProbability}% chance of rain today.` };
  } else if (rainProbability !== null) {
    rainRisk = { level: "favorable", reason: `Only ${rainProbability}% chance of rain today.` };
  } else {
    rainRisk = { level: "caution", reason: "Rain probability isn't available from the current data." };
  }

  // ---------- Wind risk ----------
  let windRisk: WeatherRiskFactor;
  if (effectiveWindKmh === null) {
    windRisk = { level: "caution", reason: "Wind speed isn't available from the current data." };
  } else if (effectiveWindKmh >= t.wind.droneHighRiskMinKmh) {
    windRisk = { level: "high-risk", reason: `Wind ${effectiveWindKmh.toFixed(0)} km/h exceeds typical drone-safe limits.` };
  } else if (effectiveWindKmh > t.wind.droneFavorableMaxKmh) {
    windRisk = { level: "caution", reason: `Wind ${effectiveWindKmh.toFixed(0)} km/h is elevated.` };
  } else {
    windRisk = { level: "favorable", reason: `Wind ${effectiveWindKmh.toFixed(0)} km/h is light.` };
  }

  // ---------- Heat risk ----------
  const apparentC = current.apparentTemperatureC ?? current.temperatureC;
  let heatRisk: WeatherRiskFactor;
  if (apparentC === null) {
    heatRisk = { level: "caution", reason: "Temperature isn't available from the current data." };
  } else if (apparentC >= t.heat.highRiskApparentTempC) {
    heatRisk = { level: "high-risk", reason: `Feels like ${apparentC.toFixed(0)}°C — significant heat-stress risk for sustained outdoor work.` };
  } else if (apparentC >= t.heat.cautionApparentTempC) {
    heatRisk = { level: "caution", reason: `Feels like ${apparentC.toFixed(0)}°C — moderate heat-stress risk.` };
  } else {
    heatRisk = { level: "favorable", reason: `Feels like ${apparentC.toFixed(0)}°C.` };
  }

  // ---------- Drone operations ----------
  let droneOperations: WeatherRiskFactor;
  if (isSevere || rainRisk.level === "high-risk" || windRisk.level === "high-risk") {
    droneOperations = {
      level: "high-risk",
      reason: `Not recommended — ${[isSevere ? current.conditionText : null, rainRisk.level === "high-risk" ? "rain" : null, windRisk.level === "high-risk" ? "wind" : null].filter(Boolean).join(" and ")} exceed(s) safe flight conditions.`,
    };
  } else if (rainRisk.level === "caution" || windRisk.level === "caution") {
    droneOperations = { level: "caution", reason: "Marginal conditions — check wind/rain immediately before flight." };
  } else {
    droneOperations = { level: "favorable", reason: "Wind and rain are both within typical safe flight conditions." };
  }

  // ---------- Robot / ground operations ----------
  const robotWindCaution = effectiveWindKmh !== null && effectiveWindKmh > t.wind.robotFavorableMaxKmh;
  const robotWindHighRisk = effectiveWindKmh !== null && effectiveWindKmh >= t.wind.robotHighRiskMinKmh;
  let robotOperations: WeatherRiskFactor;
  if (isSevere || robotWindHighRisk) {
    robotOperations = { level: "high-risk", reason: isSevere ? `${current.conditionText} — not recommended for ground units.` : `Wind ${effectiveWindKmh!.toFixed(0)} km/h is severe for ground operations.` };
  } else if (activeRain || robotWindCaution) {
    robotOperations = { level: "caution", reason: activeRain ? "Active rain — wet-field traction/sensor caution." : `Elevated wind (${effectiveWindKmh!.toFixed(0)} km/h).` };
  } else {
    robotOperations = { level: "favorable", reason: "No significant ground-operation constraints." };
  }

  // ---------- Field conditions (wet-field risk) ----------
  let fieldConditions: WeatherRiskFactor;
  if (activeRain || (rainProbability !== null && rainProbability >= t.rain.highRiskProbabilityPercent)) {
    fieldConditions = { level: "caution", reason: activeRain ? "Actively raining — expect wet-field conditions." : `High rain probability (${rainProbability}%) — expect wet-field conditions later today.` };
  } else if (heatRisk.level === "high-risk") {
    fieldConditions = { level: "caution", reason: "High heat — dry/dusty field conditions and crew heat-stress risk." };
  } else {
    fieldConditions = { level: "favorable", reason: "No significant field-condition concerns from current weather." };
  }

  // ---------- Irrigation consideration (Part 5's exact required wording) ----------
  const forecastRainMm = today?.precipitationMm ?? null;
  const humidity = current.humidityPercent;
  let irrigationConsideration: WeatherRiskFactor;
  if (forecastRainMm !== null && forecastRainMm >= t.irrigation.sufficientRainMm) {
    irrigationConsideration = { level: "favorable", reason: `Low immediate weather-related concern — ${forecastRainMm.toFixed(1)} mm of rain expected/recorded today.` };
  } else if (apparentC !== null && apparentC >= t.heat.cautionApparentTempC && humidity !== null && humidity <= t.irrigation.lowHumidityPercent) {
    irrigationConsideration = { level: "caution", reason: "Weather conditions indicate increased irrigation consideration — hot and dry with little expected rain." };
  } else {
    irrigationConsideration = { level: "favorable", reason: "Monitor soil/crop conditions — current weather alone doesn't indicate a strong irrigation signal either way." };
  }

  // ---------- Mission notes (Part 7 — informational only) ----------
  const missionNotes: string[] = [];
  if (windRisk.level !== "favorable") missionNotes.push(`Drone missions may be affected by ${windRisk.level === "high-risk" ? "strong" : "elevated"} winds.`);
  if (rainRisk.level !== "favorable") missionNotes.push(`Rain is ${activeRain ? "occurring" : "expected"} during today's operating window.`);
  if (heatRisk.level === "high-risk") missionNotes.push("High heat may affect crew and battery performance during extended field operations.");
  if (missionNotes.length === 0) missionNotes.push("No significant weather constraints on planned drone/robot operations today.");

  return { droneOperations, robotOperations, fieldConditions, rainRisk, windRisk, heatRisk, irrigationConsideration, missionNotes };
}
