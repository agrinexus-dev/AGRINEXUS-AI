/**
 * MVP-3C.6.1 — AURA Intent Boundary regression test.
 *
 * Standalone `tsx` script (this repo has no unit-test runner configured —
 * see package.json). Run manually from `apps/operator`:
 *
 *   npx tsx src/lib/aura/commands/intent-boundary.test.mts
 *
 * Exits non-zero (and prints a FAIL line per failing case) if any assertion
 * fails, so it can also be wired into CI later without modification.
 *
 * Covers the exact boundary this milestone fixed: a natural-language
 * REASONING/RECOMMENDATION/EXPLANATION/INFORMATION question about a plot or
 * action must NOT be intercepted by the deterministic command parser as an
 * ACTION, while every existing explicit action command must keep working
 * exactly as before.
 */
import { parseCommand } from "./command-parser";

interface Case {
  text: string;
  category: "CONVERSATIONAL" | "ACTION";
  /** Only asserted for ACTION cases, where the exact commandId matters. */
  expectedCommandId?: string;
}

const cases: Case[] = [
  // --- Must NOT become an action (reasoning / recommendation / explanation / information) ---
  { text: "Why should I inspect Plot C today?", category: "CONVERSATIONAL" },
  { text: "Should I inspect Plot C today?", category: "CONVERSATIONAL" },
  { text: "Do you think I should inspect Plot C?", category: "CONVERSATIONAL" },
  { text: "Tell me about the inspection status of Plot C.", category: "CONVERSATIONAL" },
  { text: "Why did Plot C get an inspection recommendation?", category: "CONVERSATIONAL" },
  { text: "Why should I deploy the drone today?", category: "CONVERSATIONAL" },

  // --- Must keep working exactly as before (explicit action commands) ---
  { text: "Inspect Plot C.", category: "ACTION", expectedCommandId: "inspect-plot" },
  { text: "Send Drone 1 to inspect Plot C.", category: "ACTION", expectedCommandId: "inspect-plot" },
  { text: "Create an inspection mission for Plot C.", category: "ACTION", expectedCommandId: "clarify-mission-vehicle" },
  { text: "Deploy the drone.", category: "ACTION", expectedCommandId: "override-pending-vehicle" },
];

let failures = 0;

for (const { text, category, expectedCommandId } of cases) {
  const parsed = parseCommand(text);
  const gotAction = parsed.recognized;

  if (category === "CONVERSATIONAL") {
    if (gotAction) {
      console.error(
        `FAIL: "${text}" — expected CONVERSATIONAL (no action), got action commandId="${parsed.commandId}"`,
      );
      failures++;
    } else {
      console.log(`PASS: "${text}" — correctly not intercepted as an action`);
    }
  } else {
    if (!gotAction) {
      console.error(`FAIL: "${text}" — expected ACTION (${expectedCommandId}), got recognized=false`);
      failures++;
    } else if (expectedCommandId && parsed.commandId !== expectedCommandId) {
      console.error(
        `FAIL: "${text}" — expected commandId="${expectedCommandId}", got commandId="${parsed.commandId}"`,
      );
      failures++;
    } else {
      console.log(`PASS: "${text}" — correctly recognized as action (${parsed.commandId})`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${cases.length} case(s) FAILED.`);
  process.exit(1);
} else {
  console.log(`\nAll ${cases.length} cases PASSED.`);
}
