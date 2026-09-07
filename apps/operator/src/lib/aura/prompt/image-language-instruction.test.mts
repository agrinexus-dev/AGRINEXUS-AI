/**
 * MVP-3C.8.1 (AURA Image Language Enforcement & Prompt UX) — the required
 * unit test for `languageInstructionFor`'s new explicit-vs-automatic
 * branching. Standalone `tsx` script, same convention as this repo's other
 * `.test.mts` files (no test runner configured). Run manually from
 * `apps/operator`:
 *
 *   npx tsx src/lib/aura/prompt/image-language-instruction.test.mts
 *
 * Deliberately tests through the real, exported `buildSystemPrompt` (never
 * a re-implementation of `languageInstructionFor`'s own logic) — this is
 * the exact same function `app/api/aura/chat/route.ts` calls via
 * `buildMessagesForProvider`, so a pass here is a pass on the real prompt
 * text the provider actually receives.
 */
import { buildSystemPrompt } from "./prompt-builder";
import type { AuraContext } from "../types";

function minimalContext(overrides: Partial<AuraContext>): AuraContext {
  return {
    currentPage: "/farmer/aura",
    userRole: "farmer",
    timestamp: new Date().toISOString(),
    preferredLanguage: null,
    missionControl: {
      farmHealth: null,
      fleetReadiness: null,
      criticalAlerts: null,
      aiConfidence: null,
      missionStatus: null,
      weatherSummary: null,
      dashboardState: null,
      presentationMode: null,
      demoMode: null,
      activeWidgets: null,
    },
    digitalTwin: {
      selectedEntity: null,
      hoveredEntity: null,
      weatherPreset: null,
      visibleLayers: null,
      enabledIntelligenceLayers: null,
      cameraMode: null,
      simulationState: null,
    },
    drones: [],
    missions: [],
    robots: [],
    robotMissions: [],
    sensors: [],
    plotRecommendations: [],
    cropFindings: [],
    plots: [],
    recurringMissions: [],
    autonomous: { droneEnabled: false, robotEnabled: false },
    robotCapabilities: [],
    weather: {
      preset: null,
      locationConfigured: false,
      dataAvailable: false,
      unavailableReason: null,
      temperatureC: null,
      apparentTemperatureC: null,
      conditionText: null,
      humidityPercent: null,
      windKmh: null,
      windDirectionCompass: null,
      rainProbability: null,
      forecastSummary: null,
      tomorrowForecastSummary: null,
      droneOperatingCondition: null,
      droneOperatingReason: null,
      robotOperatingCondition: null,
      robotOperatingReason: null,
      irrigationConsideration: null,
      lastUpdated: null,
      dataSource: null,
      stale: false,
    },
    sensorNetwork: {
      soilMoisturePercent: null,
      temperatureC: null,
      humidityPercent: null,
      wind: null,
      rain: null,
      ec: null,
      ph: null,
      lightLevel: null,
      nodesOnline: null,
      signal: null,
      sensorCount: null,
    },
    analytics: {
      yieldPrediction: null,
      cropHealthSummary: null,
      diseaseRiskSummary: null,
      waterUsage: null,
      energyUsage: null,
      latestSummary: null,
    },
    alerts: { count: 0, resolvedCount: 0, latest: [] },
    ...overrides,
  };
}

let failures = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`PASS [${label}]`);
  } else {
    console.log(`FAIL [${label}]`);
    failures += 1;
  }
}

// --- Automatic (unset preferredLanguageExplicit) — MUST be byte-for-byte unchanged from before this milestone. ---

const autoEnglish = buildSystemPrompt(minimalContext({ preferredLanguage: null }));
check("automatic, no preferredLanguage: no language instruction at all", !autoEnglish.includes("Respond in"));

const autoUrdu = buildSystemPrompt(minimalContext({ preferredLanguage: "Urdu" }));
check(
  "automatic Urdu: uses the original permissive 'unless the user writes' wording",
  autoUrdu.includes("Respond in Urdu, unless the user writes to you in a different language."),
);
check(
  "automatic Urdu: uses the original URDU_FARMER_GUIDANCE (ends with its own 'unless' escape)",
  autoUrdu.includes("reply in Urdu unless the farmer's own message was in English."),
);
check("automatic Urdu: does NOT use the new authoritative wording", !autoUrdu.includes("explicitly chosen"));

const autoEnglishPref = buildSystemPrompt(minimalContext({ preferredLanguage: "English" }));
check(
  "automatic English: uses the original permissive wording",
  autoEnglishPref.includes("Respond in English, unless the user writes to you in a different language."),
);

// --- Explicit (MVP-3C.8.1's new branch) — the actual fix under test. ---

const explicitUrdu = buildSystemPrompt(minimalContext({ preferredLanguage: "Urdu", preferredLanguageExplicit: true }));
check(
  "explicit Urdu: uses the new authoritative wording, naming Urdu",
  explicitUrdu.includes("The Farmer has explicitly chosen Urdu as the required response language"),
);
check(
  "explicit Urdu: contains NO 'unless the user writes' escape anywhere in the language instruction",
  !explicitUrdu.includes("unless the user writes to you in a different language"),
);
check(
  "explicit Urdu: uses the new URDU_FARMER_GUIDANCE_EXPLICIT (no 'unless the farmer's own message was in English' escape)",
  !explicitUrdu.includes("unless the farmer's own message was in English"),
);
check(
  "explicit Urdu: still keeps the mixed-script/plot-label guidance (Plot C, Drone 1)",
  explicitUrdu.includes('"Plot C"') && explicitUrdu.includes('"Drone 1"'),
);

const explicitEnglish = buildSystemPrompt(minimalContext({ preferredLanguage: "English", preferredLanguageExplicit: true }));
check(
  "explicit English: uses the new authoritative wording, naming English",
  explicitEnglish.includes("The Farmer has explicitly chosen English as the required response language"),
);
check(
  "explicit English: contains NO 'unless the user writes' escape",
  !explicitEnglish.includes("unless the user writes to you in a different language"),
);

// --- Explicit flag has zero effect when preferredLanguage itself is null (defensive — should never happen in practice, since route.ts only ever sets both together, but the function must not misbehave if it did). ---

const explicitButNoLanguage = buildSystemPrompt(minimalContext({ preferredLanguage: null, preferredLanguageExplicit: true }));
check("explicit flag with no preferredLanguage: still no language instruction at all", !explicitButNoLanguage.includes("Respond in") && !explicitButNoLanguage.includes("explicitly chosen"));

if (failures > 0) {
  console.log(`\n${failures} case(s) FAILED.`);
  process.exit(1);
} else {
  console.log("\nAll cases PASSED.");
}
