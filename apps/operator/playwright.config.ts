import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for the operator app's end-to-end tests.
 *
 * This harness also exercises a security boundary (localhost-only routing /
 * SSRF policy, no downloads, deterministic local execution), so several
 * settings below are deliberately strict rather than convenient — see the
 * inline comment on each.
 */
export default defineConfig({
  testDir: "./tests",

  // Deterministic local execution — this harness proves a security
  // boundary; a flaky-retry mechanism papering over an intermittent policy
  // failure would be exactly the wrong instinct here.
  fullyParallel: false,
  retries: 0,
  workers: 1,

  // Local-only artifacts, never uploaded/published (see `.gitignore`, which
  // excludes both directories below from Git entirely).
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results",

  use: {
    // The one approved base origin. This is the project's real, unmodified
    // local dev port: no `PORT` override exists anywhere in `apps/operator`
    // (`.env.local`, `package.json`, or the root `turbo.json`), so Next.js's
    // own default applies.
    baseURL: "http://localhost:3000",

    // Playwright's own default context creation (`browser.newContext()`,
    // used implicitly by the `context`/`page` fixtures
    // `tests/security/fixtures.ts` builds on) is already a fresh, temporary,
    // isolated profile with no persistent data — no `launchPersistentContext`,
    // no real Chrome/Edge/Firefox user-data-dir, is used anywhere in this
    // config or in any test file. Nothing here imports personal cookies,
    // history, saved passwords, or extensions — there is no code path in
    // this harness that could.
    acceptDownloads: false, // No downloads, ever.
    permissions: [], // No browser permission is auto-granted.
    ignoreHTTPSErrors: false, // Never silently paper over a TLS identity mismatch.
    serviceWorkers: "block", // A service worker is itself a way for a page to keep making background requests; blocked outright rather than trusted to respect the route policy.

    // Minimal artifact collection, on-failure only; video off by default —
    // nothing in the test matrix needs frame-by-frame playback, and a
    // failing test's trace already contains a full timeline.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium-secure",
      use: {
        // Explicit, not `devices["Desktop Chrome"]` — that preset exists
        // to emulate a real Chrome's viewport/UA and does not itself risk
        // using a real installed browser, but naming the browser directly
        // here keeps the one fact that matters ("which binary actually
        // launches") visible in one place rather than inherited from a
        // device preset. `browserName: "chromium"` always resolves to the
        // Playwright-managed Chromium — never a `channel: "chrome"`/`"msedge"`
        // pointing at a real, separately-installed browser (no `channel` is
        // set anywhere in this config).
        browserName: "chromium",
      },
    },
  ],

  // Reuses the existing `apps/operator` dev script, never a new/invented
  // server command. `reuseExistingServer: true` unconditionally (not
  // `!process.env.CI`): this harness is local-only, a dev server is
  // routinely already running during development, and starting a redundant
  // second one on the same port would simply fail to bind rather than
  // provide any benefit.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
