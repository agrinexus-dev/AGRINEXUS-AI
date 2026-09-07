import type { BrowserContext, Page } from "@playwright/test";

/**
 * The ONE place the
 * localhost-only allowlist is defined. Every other file in `tests/`
 * consumes this module rather than inventing its own notion of "local."
 *
 * FAIL-CLOSED by design: `isAllowedUrl` returns `true` for exactly two origins and
 * `false` for everything else, including anything that fails to parse as a
 * URL at all. There is no denylist anywhere in this file — an allowlist
 * can never accidentally admit a category of URL nobody thought to block.
 */

/** The only two origins Playwright is ever allowed to reach. Port 3000 is the real, unmodified local dev port for this project (no `PORT` override exists anywhere in `apps/operator`). */
export const ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"] as const;

/** The exact message every navigation guard fails with. */
export const SECURITY_BLOCK_MESSAGE = "SECURITY BLOCK: Playwright attempted to access a non-local origin.";

/**
 * `true` only for `http://localhost:3000` or `http://127.0.0.1:3000`
 * (any path/query/hash on either is fine — only scheme+host+port matter).
 * Everything else — a different port, `https:`, `file:`, `data:`,
 * `javascript:`, `about:`, `ws:`/`wss:` as a bare URL, an unparseable
 * string, a public IP, any external domain — returns `false`. A `URL`
 * constructor failure (a genuinely malformed string, or a scheme `URL`
 * itself refuses to parse) is treated as "not allowed," never as "allowed
 * by default" — the fail-closed rule applies to parsing itself, not only
 * to origin comparison.
 */
export function isAllowedUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:") return false;
  const origin = `${parsed.protocol}//${parsed.host}`;
  return (ALLOWED_ORIGINS as readonly string[]).includes(origin);
}

/**
 * The "navigation guard" — a test-author-facing check, distinct
 * from (and in addition to) the network-level policy below. Call this
 * BEFORE any `page.goto`/`page.click` that a test expects to navigate
 * on-origin; it throws the exact required message rather
 * than silently doing nothing or redirecting elsewhere.
 */
export function assertAllowedNavigation(url: string): void {
  if (!isAllowedUrl(url)) {
    throw new Error(`${SECURITY_BLOCK_MESSAGE} (attempted: ${url})`);
  }
}

/** Safe, secret-free diagnostic line for a blocked request — method + hostname + path only, per the "never log authorization headers / never dump entire requests" rule. */
function safeDescribe(url: string, method: string): string {
  try {
    const parsed = new URL(url);
    return `${method} ${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return `${method} <unparseable-url>`;
  }
}

export interface LocalhostPolicyHandle {
  /** Every distinct URL this policy has aborted so far, in `safeDescribe` form (no headers, no bodies, no cookies). */
  blocked: string[];
}

/**
 * Installs the fail-closed, context-wide network policy:
 * `context.route("**\/*",...)` intercepts EVERY request on EVERY page in
 * this context — including popups opened via `window.open()`/`target=
 * "_blank"` (Playwright context routes apply to every page a context ever
 * creates, not only the page that was open when the route was registered)
 * and including each hop of a redirect chain (a redirect's follow-up
 * request is itself a new request the same handler evaluates). Anything
 * `isAllowedUrl` doesn't approve is aborted before any DNS lookup or TCP
 * connection is attempted — a blocked destination is never actually
 * contacted, satisfying "do not contact real malicious infrastructure"
 * even when a test deliberately points at one as a synthetic destination.
 *
 * Returns a handle whose `blocked` array a test can assert against —
 * never logs full request objects/headers.
 */
export async function installLocalhostOnlyPolicy(context: BrowserContext): Promise<LocalhostPolicyHandle> {
  const handle: LocalhostPolicyHandle = { blocked: [] };

  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    if (isAllowedUrl(url)) {
      await route.continue();
      return;
    }
    handle.blocked.push(safeDescribe(url, request.method()));
    await route.abort("blockedbyclient");
  });

  // "unexpected WebSocket connections." Regular
  // `route()` above does not intercept the WebSocket upgrade handshake
  // itself; `routeWebSocket` is Playwright's own dedicated API for that.
  // Same fail-closed rule: anything not an allowed localhost origin is
  // closed immediately, never allowed to complete its handshake.
  context.routeWebSocket(/.*/, (ws) => {
    if (!isAllowedUrl(ws.url().replace(/^wss?:/, "http:"))) {
      handle.blocked.push(safeDescribe(ws.url(), "WS"));
      ws.close();
      return;
    }
    ws.connectToServer();
  });

  // Downloads. `acceptDownloads: false` (set at context-creation
  // time, see `fixtures.ts`) already causes Playwright to cancel a download
  // before it starts; this listener is defense-in-depth for the case a
  // download event still fires, and is also how a test records the
  // attempted URL ("record the attempted URL safely — do NOT
  // save the file") without ever writing anything to disk.
  context.on("page", (page) => {
    page.on("download", (download) => {
      handle.blocked.push(safeDescribe(download.url(), "DOWNLOAD"));
      void download.cancel();
    });
  });

  // Popups/new tabs/new pages. Redundant with the route policy
  // above for anything that also makes a network request (an external
  // popup's own navigation is itself aborted by the same `context.route`
  // handler), but implemented explicitly
  // ("Verify its URL is localhost-only... BLOCK/CLOSE") so a popup that
  // reaches `about:blank` or an allowed page never lingers unexamined, and
  // so a test can assert on `handle.blocked`/the popup's own closed state
  // as an independent, visible signal rather than only inferring it from
  // network-level side effects.
  context.on("page", (popup) => {
    void (async () => {
      try {
        await popup.waitForLoadState("domcontentloaded", { timeout: 3000 });
      } catch {
        // Navigation itself may already have been aborted by the route
        // policy above — that is the success case, not an error here.
      }
      const url = popup.url();
      if (url !== "about:blank" && !isAllowedUrl(url)) {
        handle.blocked.push(safeDescribe(url, "POPUP"));
        await popup.close().catch(() => {});
      }
    })();
  });

  // A live-verified gap in the request-level
  // policy above: a `data:` URL navigation generates NO network request at
  // all (the browser decodes it entirely client-side), so `context.route()`
  // never sees it and cannot abort it — confirmed by direct testing (a
  // `page.goto("data:text/html,...")` genuinely rendered before this layer
  // was added;). This
  // `framenavigated` listener is the reactive, fail-closed backstop for
  // exactly that gap: for every main-frame navigation that actually LANDS
  // on a disallowed URL despite the request-level policy (a `data:`/
  // `blob:` navigation, or any other scheme that bypasses `route()`), it
  // immediately evicts the frame back to `about:blank` and records the
  // attempt. This does not claim to make the disallowed content
  // un-renderable for the few milliseconds before eviction — that is a
  // disclosed, honest limitation, not something
  // hidden — but it does guarantee no test/harness code ever observes a
  // live, lingering session on a non-local origin.
  context.on("page", (page) => {
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      const url = frame.url();
      if (url === "about:blank" || isAllowedUrl(url)) return;
      handle.blocked.push(safeDescribe(url, "FRAMENAVIGATED"));
      void page.goto("about:blank").catch(() => {});
    });
  });

  return handle;
}

/** The navigation guard, wired to an actual `page.goto` call — throws `SECURITY_BLOCK_MESSAGE` and never invokes `page.goto` at all for a disallowed destination, rather than attempting it and hoping the network policy catches it. */
export async function secureGoto(page: Page, url: string): ReturnType<Page["goto"]> {
  assertAllowedNavigation(url);
  return page.goto(url);
}
