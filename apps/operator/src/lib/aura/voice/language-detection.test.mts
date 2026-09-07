/**
 * MVP-3C.7.2-B (Automatic English/Urdu Conversation Language + Urdu Voice)
 * — the required unit test matrix for `language-detection.ts`. Standalone
 * `tsx` script, same convention as `command-parser.ts`'s own
 * `intent-boundary.test.mts`/`urdu-intent-boundary.test.mts` (this repo has
 * no test runner configured). Run manually from `apps/operator`:
 *
 *   npx tsx src/lib/aura/voice/language-detection.test.mts
 */
import { containsDevanagariScript, conversationLanguageLabel, detectTextLanguage, normalizeDetectedLanguage } from "./language-detection";

interface Case {
  label: string;
  input: string;
  expected: "en" | "ur";
}

// The exact 9 required matrix cases, plus the 4 additional required cases
// (10: English-only with identifiers, 11: Urdu with Latin entity names,
// 12: empty/whitespace, 13: unsupported/non-Urdu non-English script).
const cases: Case[] = [
  { label: "1", input: "Hello, how is Plot C?", expected: "en" },
  { label: "2", input: "How is the weather?", expected: "en" },
  { label: "3", input: "پلاٹ C کی فصل کیسی ہے؟", expected: "ur" },
  { label: "4", input: "آج موسم کیسا ہے؟", expected: "ur" },
  { label: "5 (mixed, Urdu-led)", input: "Plot C کی فصل کیسی ہے؟", expected: "ur" },
  { label: "6", input: "Inspect Plot C.", expected: "en" },
  { label: "7", input: "پلاٹ C کا معائنہ کرو", expected: "ur" },
  { label: "8", input: "Why should I inspect Plot C today?", expected: "en" },
  { label: "9", input: "کیا مجھے آج Plot C کا معائنہ کرنا چاہیے؟", expected: "ur" },
  { label: "10 (English + identifiers only)", input: "Plot C, Drone 1, Robot Bravo status?", expected: "en" },
  { label: "11 (Urdu + Latin entity names)", input: "پلاٹ C، ڈرون 1، روبوٹ بریوو کی صورتحال کیا ہے؟", expected: "ur" },
  { label: "12a (empty)", input: "", expected: "en" },
  { label: "12b (whitespace only)", input: "   \n\t  ", expected: "en" },
  { label: "13a (Devanagari — unsupported script)", input: "प्लॉट C की सूरतहाल क्या है", expected: "en" },
  { label: "13b (Cyrillic — unsupported script)", input: "Тест на русском языке", expected: "en" },
];

let failures = 0;

for (const { label, input, expected } of cases) {
  const got = detectTextLanguage(input);
  if (got !== expected) {
    console.error(`FAIL [case ${label}]: "${input}" -> got "${got}", expected "${expected}"`);
    failures++;
  } else {
    console.log(`PASS [case ${label}]: "${input}" -> ${got}`);
  }
}

// Phase B — normalization allowlist. Every supported spelling maps
// correctly; every unsupported language (including real ones Whisper might
// legitimately report, like Hindi) maps to `undefined`, never to a
// fabricated third product language.
const normalizationCases: [string | undefined, "en" | "ur" | undefined][] = [
  ["en", "en"],
  ["english", "en"],
  ["English", "en"],
  ["EN", "en"],
  ["ur", "ur"],
  ["urdu", "ur"],
  ["Urdu", "ur"],
  ["hi", undefined],
  ["hindi", undefined],
  ["pa", undefined],
  ["punjabi", undefined],
  ["sd", undefined],
  ["sindhi", undefined],
  ["ar", undefined],
  ["arabic", undefined],
  [undefined, undefined],
  ["", undefined],
];

for (const [raw, expected] of normalizationCases) {
  const got = normalizeDetectedLanguage(raw);
  if (got !== expected) {
    console.error(`FAIL [normalize ${JSON.stringify(raw)}]: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
    failures++;
  } else {
    console.log(`PASS [normalize ${JSON.stringify(raw)}] -> ${JSON.stringify(got)}`);
  }
}

// The label mapping `prompt-builder.ts`'s existing, unmodified
// `languageInstructionFor` expects verbatim.
if (conversationLanguageLabel("en") !== "English") {
  console.error("FAIL: conversationLanguageLabel('en') should be 'English'");
  failures++;
}
if (conversationLanguageLabel("ur") !== "Urdu") {
  console.error("FAIL: conversationLanguageLabel('ur') should be 'Urdu'");
  failures++;
}

// MVP-3C.7.2-C (Urdu Voice Cold-Start Reliability) — `containsDevanagariScript`
// is the deterministic TRIGGER signal the transcribe route uses to detect
// the known Whisper cold-start failure. It must fire on real Devanagari, and
// must NOT fire on genuine Urdu script, plain English, or an empty string —
// a false positive here would incorrectly trigger a recovery re-request for
// an already-correct Urdu transcript.
const devanagariCases: [string, boolean][] = [
  ["प्लॉट C की फसल कैसी है?", true],
  ["पलाट सी की फसल कैसी है", true],
  ["پلاٹ C کی فصل کیسی ہے؟", false],
  ["Plot C doing today?", false],
  ["", false],
  ["Plot C", false],
];

for (const [input, expected] of devanagariCases) {
  const got = containsDevanagariScript(input);
  if (got !== expected) {
    console.error(`FAIL [devanagari ${JSON.stringify(input)}]: got ${got}, expected ${expected}`);
    failures++;
  } else {
    console.log(`PASS [devanagari ${JSON.stringify(input)}] -> ${got}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} FAILURE(S).`);
  process.exit(1);
} else {
  console.log(`\nAll ${cases.length + normalizationCases.length + devanagariCases.length + 2} cases PASSED.`);
}
