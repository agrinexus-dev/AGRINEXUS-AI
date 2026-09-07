/**
 * MVP-3C.7 (Full Urdu Farmer Experience), Phase D — the Urdu/mixed-language
 * twin of `intent-boundary.test.mts` (MVP-3C.6.1). Standalone `tsx` script,
 * same convention (no test runner configured in this repo). Run manually
 * from `apps/operator`:
 *
 *   npx tsx src/lib/aura/commands/urdu-intent-boundary.test.mts
 *
 * Covers this milestone's own required Urdu test matrix, run against the
 * REAL `parseCommand` function — the deterministic layer only. Four
 * CONVERSATIONAL examples must never become an action; three pure-Urdu and
 * one mixed-language ACTION example must resolve to their expected
 * commandId AND the correct plot (checked via whichever of `plotId`/
 * `requestedPlotId` that command actually uses — see `command-parser.ts`'s
 * own doc comment on why these stayed two separate fields).
 *
 * One required MIXED example ("Drone 1 کو Plot C پر بھیج دو") is
 * DELIBERATELY not asserted here as a deterministic PASS: it is not
 * recognized by `parseCommand` (English "Drone"/vehicle-preference
 * literal + Urdu "بھیج" send-verb is one script combination this
 * milestone's narrow, additive patterns don't cover — see the MVP-3C.7
 * report's own Urdu Command Results/Limitations for why extending further
 * was judged not "minimally necessary": it is already correctly handled,
 * live-verified, by the EXISTING LLM intent-classifier fallback
 * `aura-chat-store.ts` already falls through to for anything `parseCommand`
 * doesn't recognize).
 */
import { parseCommand } from "./command-parser";

interface Case {
  text: string;
  category: "CONVERSATIONAL" | "ACTION";
  expectedCommandId?: string;
  expectedPlotId?: string;
}

const cases: Case[] = [
  // --- Must NOT become an action ---
  { text: "کیا مجھے پلاٹ C کا معائنہ کرنا چاہیے؟", category: "CONVERSATIONAL" },
  { text: "مجھے پلاٹ C کا معائنہ کیوں کرنا چاہیے؟", category: "CONVERSATIONAL" },
  { text: "پلاٹ C کی صورتحال کیا ہے؟", category: "CONVERSATIONAL" },
  { text: "ڈرون کیوں بھیجنا چاہیے؟", category: "CONVERSATIONAL" },

  // --- Must become the correct action, with the correct plot resolved ---
  { text: "پلاٹ C کا معائنہ کرو", category: "ACTION", expectedCommandId: "inspect-plot", expectedPlotId: "plot-c" },
  { text: "ڈرون 1 کو پلاٹ C پر بھیجو", category: "ACTION", expectedCommandId: "request-field-inspection", expectedPlotId: "plot-c" },
  { text: "پلاٹ C کے لیے معائنہ مشن بناؤ", category: "ACTION", expectedCommandId: "inspect-plot", expectedPlotId: "plot-c" },
  { text: "Plot C کا معائنہ کرو", category: "ACTION", expectedCommandId: "inspect-plot", expectedPlotId: "plot-c" },
];

let failures = 0;

for (const { text, category, expectedCommandId, expectedPlotId } of cases) {
  const parsed = parseCommand(text) as { recognized: boolean; commandId?: string; params?: Record<string, unknown> };
  const resolvedPlotId = (parsed.params?.plotId as string | undefined) ?? (parsed.params?.requestedPlotId as string | undefined);

  if (category === "CONVERSATIONAL") {
    if (parsed.recognized) {
      console.error(`FAIL: "${text}" — expected CONVERSATIONAL (no action), got action commandId="${parsed.commandId}"`);
      failures++;
    } else {
      console.log(`PASS: "${text}" — correctly not intercepted as an action`);
    }
    continue;
  }

  if (!parsed.recognized) {
    console.error(`FAIL: "${text}" — expected ACTION (${expectedCommandId}), got recognized=false`);
    failures++;
  } else if (expectedCommandId && parsed.commandId !== expectedCommandId) {
    console.error(`FAIL: "${text}" — expected commandId="${expectedCommandId}", got commandId="${parsed.commandId}"`);
    failures++;
  } else if (expectedPlotId && resolvedPlotId !== expectedPlotId) {
    console.error(`FAIL: "${text}" — expected plotId="${expectedPlotId}", got "${resolvedPlotId}"`);
    failures++;
  } else {
    console.log(`PASS: "${text}" — correctly recognized as action (${parsed.commandId}, plot=${resolvedPlotId})`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${cases.length} case(s) FAILED.`);
  process.exit(1);
} else {
  console.log(`\nAll ${cases.length} cases PASSED.`);
}
