/**
 * Centralized agricultural-weather thresholds — the ONE
 * place every numeric cutoff `agricultural-analysis.ts` uses lives, so
 * nothing is scattered as a magic number through components. No project
 * standard for these existed before this change (grep confirmed no prior
 * weather-risk thresholds anywhere in the codebase), so these are DEFINED
 * here, deliberately conservative, and based on widely-published general
 * small-multirotor-drone and field-operations guidance (typical consumer/
 * light-ag drone wind ratings, standard heat-stress-for-outdoor-work
 * bands) — not values pulled from this specific product's prior behavior,
 * since none existed. Documented individually below; change them here only.
 */

export const WEATHER_THRESHOLDS = {
  wind: {
    /** Below this, wind is not a meaningful constraint for drone flight. */
    droneFavorableMaxKmh: 20,
    /** Above this, most small/medium ag drones are outside their rated safe operating envelope. */
    droneHighRiskMinKmh: 35,
    /** Ground robots are far less wind-sensitive than rotorcraft — only flagged once conditions are genuinely severe (loose debris/tree-limb risk territory). */
    robotFavorableMaxKmh: 40,
    robotHighRiskMinKmh: 60,
  },
  rain: {
    /** Precipitation probability (%) above which rain becomes a caution-level concern. */
    cautionProbabilityPercent: 40,
    /** Above this probability, treated as a high-risk / plan-around-it condition. */
    highRiskProbabilityPercent: 70,
    /** Actual current precipitation (mm in the last hour) at/above which conditions are already actively wet, regardless of forecast probability. */
    activeRainMm: 0.2,
  },
  heat: {
    /** Apparent temperature (°C) above which sustained outdoor field/robot work carries meaningful heat-stress risk. */
    cautionApparentTempC: 32,
    highRiskApparentTempC: 38,
  },
  irrigation: {
    /** Forecast precipitation (mm) over the current day at/above which recent/expected rain is judged sufficient to lower immediate irrigation concern. */
    sufficientRainMm: 5,
    /** Below this humidity (%) combined with high heat, conditions favor increased irrigation consideration. */
    lowHumidityPercent: 35,
  },
  /** Open-Meteo WMO weather codes (https://open-meteo.com/en/docs — "WMO Weather interpretation codes") this app treats as inherently severe regardless of wind/rain numbers — thunderstorm codes 95/96/99. */
  severeConditionCodes: [95, 96, 99] as const,
} as const;
