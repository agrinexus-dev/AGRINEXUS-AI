import type { Page } from "@playwright/test";

/**
 * A minimal, secret-free console/error recorder.
 * Never logs request headers, cookies, or bodies — only console message
 * text and page-error messages, matching the SAME "no secrets in
 * artifacts" rule the security harness itself follows.
 */
export interface CapturedConsole {
  errors: string[];
  pageErrors: string[];
  failedRequests: string[];
}

export function captureConsole(page: Page): CapturedConsole {
  const captured: CapturedConsole = { errors: [], pageErrors: [], failedRequests: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") captured.errors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    captured.pageErrors.push(err.message);
  });
  page.on("requestfailed", (request) => {
    captured.failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`);
  });
  return captured;
}
