import type { Metadata } from "next";
import "./globals.css";

import { AuthSessionProvider } from "@/components/providers/auth-session-provider";
import { ThemeProvider } from "@/components/shell/theme-provider";

export const metadata: Metadata = {
  title: "AgriNexus AI — Operator",
};

/**
 * Global providers only — no shell chrome here. `/login` and `/unauthorized`
 * render under this layout too, and must not get a sidebar/top nav; the
 * shell itself is mounted one level down, in `(shell)/layout.tsx`.
 */
/**
 * UI-UPGRADE.2 — the exact key `theme-provider.tsx` itself reads/writes;
 * duplicated here (not imported) because this script must run as a plain
 * inline string before any JS module loads, not as app code.
 */
const THEME_STORAGE_KEY = "operator-theme";

/**
 * UI-UPGRADE.2 — runs before React hydrates (a raw inline `<script>` in
 * `<head>`, the standard dependency-free technique for this — no
 * `next-themes` or other new framework introduced). If a returning
 * operator previously chose light, this flips `<html>` from the
 * server-rendered `dark` default to `light` immediately, so there is no
 * visible dark flash before `ThemeProvider`'s own post-mount effect would
 * otherwise catch up. Fails silently (never throws, never blocks
 * rendering) if `localStorage` is unavailable — dark, the server-rendered
 * default, remains correct either way. `suppressHydrationWarning` on
 * `<html>` (already present, unchanged) is what allows this script's
 * pre-hydration class mutation to coexist with React's own hydration
 * without a console warning.
 */
const NO_FLASH_THEME_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="light"){document.documentElement.classList.remove("dark");document.documentElement.classList.add("light");}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Inline, no `src` — runs synchronously before hydration to avoid a flash of the wrong theme; not subject to the sync-external-script lint rule. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body>
        <AuthSessionProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
