import { test as base, expect, type BrowserContext } from "@playwright/test";

import { installLocalhostOnlyPolicy, type LocalhostPolicyHandle } from "./localhost-policy";

/**
 * The custom `test`
 * every test file in this project should import instead of `@playwright/
 * test`'s own. Overriding the built-in `context` fixture (rather than each
 * spec file wiring the policy up by hand) guarantees every test — including
 * ones written later, in future milestones — automatically gets:
 *
 *  - a fresh, isolated `BrowserContext` (Playwright's own default:
 *  `browser.newContext()`, never `launchPersistentContext` against a
 *  real profile directory — see `playwright.config.ts`'s own doc
 *  comment on why no personal Chrome/Edge/Firefox profile is ever
 *  touched);
 *  - `acceptDownloads: false` and an empty `permissions` list, both set
 *  at context-creation time in `playwright.config.ts`'s own `use`
 *  block (this fixture does not need to repeat them — Playwright
 *  applies `use` options to every context/page fixture automatically);
 *  - the fail-closed localhost-only network/WebSocket/popup/download
 *  policy from `localhost-policy.ts`, installed BEFORE the test body
 *  runs and BEFORE any page is created, so no request — not even the
 *  very first one — is ever made outside the policy's view.
 *
 * `policy` is exposed as its own fixture so a test can assert on
 * `policy.blocked` (e.g. "the redirect attempt was recorded") without
 * reaching into implementation details.
 */
export const test = base.extend<{ policy: LocalhostPolicyHandle }>({
  context: async ({ context }: { context: BrowserContext }, use) => {
    const handle = await installLocalhostOnlyPolicy(context);
    policyHandles.set(context, handle);
    await use(context);
    policyHandles.delete(context);
  },
  policy: async ({ context }, use) => {
    const handle = policyHandles.get(context);
    if (!handle) throw new Error("Localhost policy was not installed on this context — fixture ordering bug.");
    await use(handle);
  },
});

/** One real handle per live context, set by the `context` fixture above (which is the ONLY place `installLocalhostOnlyPolicy` is ever called) and read by the `policy` fixture. */
const policyHandles = new WeakMap<BrowserContext, LocalhostPolicyHandle>();

export { expect };
