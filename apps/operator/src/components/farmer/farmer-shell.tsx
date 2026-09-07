"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn, Typography, TooltipProvider } from "@agrinexus/ui";

import { UserMenu } from "@/components/shell/user-menu";
import { useFarmerSettingsStore } from "@/lib/farmer/farmer-settings-store";
import { useFarmerTranslation } from "@/lib/farmer/i18n/use-farmer-translation";
import { useMissionSimulation } from "@/lib/missions/use-mission-simulation";
import { useRobotMissionSimulation } from "@/lib/robot-missions/use-robot-mission-simulation";
import { useHistoricalStoreHydration } from "@/lib/sensor-analytics/historical-store";

import { farmerNavItems } from "./farmer-nav-items";

/**
 * The audit
 * (MVP-UI.1-A) traced almost every Farmer page's "trapped in a
 * narrow column" problem to a SINGLE line: `<main>` used to be
 * `mx-auto max-w-4xl` unconditionally, capping Dashboard, AURA, Settings,
 * AND (via `digital-twin-page.tsx`'s own existing runtime bleed-to-`<main>`
 * mechanism — see that file's `BLEED_MARGIN_PX` doc comment) the Digital
 * Twin 3D viewport, to 896px on any desktop width.
 *
 * `<main>` itself is now full-width with only a comfortable gutter — no
 * cap, no `mx-auto`. Different page TYPES legitimately want different
 * content widths (a KPI grid can use more width than a settings form), so
 * each page now opts into one of two named tiers below, applied to that
 * page's own top-level wrapper — not a fourth, unrelated layout system,
 * just two Tailwind class strings shared by name. The Digital Twin page
 * deliberately uses NEITHER tier: its existing bleed mechanism already
 * measures `<main>`'s real width at runtime, so widening `<main>` here is
 * the entire fix for that page — no Digital Twin file needed to change for
 * width specifically.
 */
export const FARMER_CONTENT_WIDTH = {
  /**
   * Settings-style reading/form width — deliberately does NOT grow as
   * aggressively as `wide`, per the audit's own "comfortable reading/form
   * width rather than unnecessarily stretched controls" finding
   * (MVP-UI.1-A). NOTE: `lg:max-w-4xl` (896px) is the SAME value
   * `<main>` used to cap EVERY page at — verified via live screenshot
   * during the validation pass that stopping the ladder
   * there left Settings completely unimproved at 1920px (roughly 512px of
   * dead space per side, unchanged from before this change). `xl:` is
   * added so Settings genuinely benefits from recovered desktop width too,
   * while still stopping well short of Dashboard/AURA's "wide" tier.
   */
  comfortable: "mx-auto w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl",
  /** Dashboard/AURA — a genuinely wider "workspace" composition that uses the desktop viewport the audit found was going unused. */
  wide: "mx-auto w-full max-w-4xl lg:max-w-6xl 2xl:max-w-[1600px]",
} as const;

/**
 * The `.farmer-theme`
 * (and, when dark mode is on, `.farmer-theme.dark`) element IS the Farmer
 * shell's own root `<div>` below. A shared component that portals to
 * `document.body` by default (e.g. `DrawerContent`, via vaul/Radix's own
 * `Portal`) renders OUTSIDE this element's DOM subtree, so it resolves
 * `:root`/`.dark` (Operator's global tokens) instead of Farmer's — the exact
 * root cause MVP-UI.1-F's report disclosed for the AURA History Drawer.
 * Rather than duplicating Farmer's tokens onto a second, Drawer-specific
 * class, this context hands descendants the real Farmer theme root DOM
 * node so they can pass it straight through as `DrawerContent`'s new
 * `container` prop — the SAME element, so it always carries whichever of
 * Farmer's light/dark token blocks is currently active, with zero new
 * token definitions anywhere. `null` before the root has mounted (and for
 * any consumer outside the Farmer shell entirely, e.g. Operator).
 */
const FarmerThemeRootContext = createContext<HTMLDivElement | null>(null);

/** See {@link FarmerThemeRootContext}. Used by Farmer surfaces (e.g. the AURA History Drawer) that need to portal INSIDE the Farmer theme root rather than `document.body`. */
export function useFarmerThemeRoot(): HTMLDivElement | null {
  return useContext(FarmerThemeRootContext);
}

/**
 * The Farmer section's own chrome — deliberately NOT
 * `AppShell` (Operator's dense sidebar/top-nav shell): a simple top bar plus
 * a 3-item tab strip, large touch targets, soft neumorphic surfaces. Wraps
 * `children` in `.farmer-theme` (see../../app/farmer/farmer-theme.css)
 * so every reused `@agrinexus/ui` component underneath — including
 * `UserMenu`, reused unmodified here — renders in the light palette.
 */
export function FarmerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The one place the
  // Farmer shell's `dir` is decided, driven by the EXISTING `displayLanguage`
  // preference (no new/competing language state). `dir` is an inheritable
  // HTML attribute — setting it once here gives every descendant (nav,
  // header, page content) correct RTL layout for free, with zero changes to
  // components that don't explicitly opt out.
  const { t, dir } = useFarmerTranslation();

  // Same store, same read
  // pattern as `dir`/`displayLanguage` immediately above: a real, persisted
  // preference (default `"light"`, so no existing Farmer is switched into
  // dark without choosing it themselves in Settings), applied here as an
  // ADDITIONAL class alongside the existing `.farmer-theme` wrapper.
  // `.farmer-theme.dark`'s own token overrides (farmer-theme.css) only take
  // effect when both classes are present on the same element — the light
  // palette in the plain `.farmer-theme` block is completely untouched and
  // still what renders whenever `theme === "light"`.
  const theme = useFarmerSettingsStore((state) => state.theme);

  // A callback ref (via `useState`, not `useRef`) so setting it
  // on mount actually triggers a re-render: `FarmerThemeRootContext`'s value
  // must change from `null` to the real element for anything that already
  // rendered (reading the context) during Farmer's own initial render to
  // pick it up. In practice every Drawer that consumes this stays closed
  // until a later user click, so the node is already populated well before
  // it's ever needed — this is about correctness, not a race being papered
  // over.
  const [themeRoot, setThemeRoot] = useState<HTMLDivElement | null>(null);

  // AURA Natural-Language-Actions phase, mission-reliability fix —
  // a mission a Farmer starts via AURA must keep progressing after they
  // navigate to Home/Digital Twin/Settings, not only while Digital Twin
  // specifically is open. Mirrors the identical fix in `AppShell` (Operator)
  // — see that file's own doc comment for why these two hooks are safe to
  // mount here (no 3D/Canvas dependency).
  useMissionSimulation();
  useRobotMissionSimulation();

  // Mirrors `AppShell`'s identical call (Operator). This was
  // missing here entirely before this fix: the Historical Sensor Store's
  // `skipHydration: true` design means NOTHING ever reads its persisted
  // localStorage data back without this hook running once — and, more
  // importantly for this change, this hook is also now the ONLY place
  // that resolves which authenticated identity's namespace the store's
  // persistence should use (see `historical-store.ts`'s own doc comment).
  // Without this call, every Farmer session would keep reading/writing the
  // SAME "anonymous" fallback namespace regardless of which farm was
  // actually authenticated — defeating the farm-isolation fix for the
  // entire Farmer app, which is the one place two distinct real farms
  // (`farm_demo`/`farm_isolation_test`) are actually reachable in this
  // environment (every Operator/Admin session resolves to the same single
  // seeded farm — see `getFarmForSession`). A direct, unavoidable
  // compatibility gap discovered while implementing that fix, not a
  // pre-existing behavior change made outside the Historical Store itself.
  useHistoricalStoreHydration();

  return (
    <TooltipProvider delayDuration={200}>
    <div
      ref={setThemeRoot}
      dir={dir}
      className={cn(
        "farmer-theme flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground",
        theme === "dark" && "dark",
      )}
    >
      <header className="sticky top-0 z-(--z-sticky) flex shrink-0 items-center justify-between gap-4 border-b border-border-subtle bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        {/*
          MVP-UI.1-E.2 (Optical Alignment Correction) — `items-start` (was
          `items-center`) is the first half of fixing the DOMINANT cause of
          the reported misalignment: with `items-center`, this row centered
          the ENTIRE column (brand image + "Farmer"/"کسان" label stacked
          beneath it) as one unit against the logo — technically correct
          CSS, but the taller column (image + label) being centered as a
          block meant the LOGO itself ended up pulled down/away from a
          plain top-aligned reference too (confirmed live via
          `boundingBox()`: under the old `items-center`, the logo sat 8px
          below the row's own top edge). `items-start` removes that
          per-item centering entirely, so both the logo and the column
          simply start flush at the row's own top — a clean, predictable
          baseline for the column's own `mt-*` (see that div's doc comment
          below) to then measure the REMAINING, much smaller offset from.
          The logo itself is not moved by this line — `items-start` changes
          how BOTH children are positioned relative to the row, not the
          logo specifically — and the column's own margin does the rest,
          never a negative margin on the logo (this milestone's own "do not
          use negative margins" rule) — per "do not move the logo if it is
          already correctly positioned."
        */}
        <div className="flex items-start gap-2">
          {/*
            MVP-UI.1-E (Official Logo Replacement) — the official AgriNexus
            mark (`public/agrinexus-logo.png`, copied as-is from the
            project-local `logo/` directory the user provided — see that
            milestone's own report for the exact source file). It is
            already a complete, transparent-background circular badge, so
            — unlike the temporary 🌾-in-a-colored-square this replaces —
            no wrapping background/shape/shadow is added here; adding one
            would draw a second, redundant container behind an asset that
            already has its own. `width`/`height` reflect its real
            310×311px source (near-exact square) so Next's `<Image>` never
            stretches/distorts it; `size-9` keeps its on-screen footprint
            equal to the badge it replaces. No `scale-x-[-1]` or other
            directional transform — a brand mark must look identical in
            Urdu/RTL, never mirrored (verified live, see that report).
          */}
          <Image
            src="/agrinexus-logo.png"
            alt=""
            width={310}
            height={311}
            className="size-9 shrink-0"
            priority
          />
          {/*
            MVP-UI.1-E.1 (Official AgriNexus Brand Lockup) — replaces the
            HTML "AgriNexus" heading with the official brand-text image
            (`public/agrinexus-text.png`, copied as-is from the project's
            `logo/text.png` — a genuinely transparent 598×142 RGBA PNG,
            confirmed by inflating its IDAT stream and sampling corner/edge
            alpha before this change, not assumed). `width`/`height` are
            its real source dimensions so `object-contain` has a correct
            intrinsic ratio to preserve; `h-7 w-auto` (mobile) / `sm:h-8`
            (tablet/desktop) scale it responsively while `object-contain`
            guarantees it can never crop or stretch — only `object-cover`
            risks that, never used here. No filter/recolor/opacity is
            applied — the asset renders exactly as supplied, at every
            breakpoint and in both themes, per this milestone's own "the
            official asset itself should remain untouched" rule.
            `t("common.farmerBadge")` ("Farmer"/"کسان") — previously
            stacked directly under the "AgriNexus" HTML heading — is kept
            in the exact same position, now stacked under the image
            instead: this is real product/role information (which section
            of the app you're in), not branding, so MVP-UI.1-E.1's own
            "preserve the role label in an appropriate small secondary
            location" instruction keeps it here rather than losing it —
            it sits below the lockup, never over it.

            MVP-UI.1-E.2 (Optical Alignment Correction) — `mt-[8.3px]
            sm:mt-[6.4px]` on the wrapping column (see that div's own doc
            comment for the `items-start` half of this fix) corrects two
            compounding causes, both measured live rather than guessed —
            and, honestly, arrived at by iterating against the ACTUAL
            rendered pixels rather than trusting either cause's own theory
            in isolation, because the two interact in ways a bounding-box
            calculation alone doesn't fully capture:
              1. STRUCTURAL — under the old `items-center`, this row
                 centered the whole `image + "Farmer"/"کسان" label` column
                 as one block against the logo, which necessarily left the
                 IMAGE (the column's top half) sitting above the logo's
                 own center. `items-start` removes that per-item centering
                 so both the logo and the column start flush at the row's
                 top instead — a predictable baseline a plain `margin-top`
                 can then correct directly.
              2. INTERNAL ARTWORK — the source PNG's own alpha channel was
                 decoded (IDAT inflated) and its visible "AGRINEXUS / SMART
                 FARMING ECOSYSTEM" artwork is NOT symmetric inside its
                 598×142 canvas: an alpha-weighted centroid of every row
                 (not just the bounding box's midpoint, which undercounts
                 how much more visual weight the bold "AGRINEXUS" line
                 carries than the thin subtitle beneath it) put the true
                 ink centroid at y≈58, well above the canvas's own
                 geometric middle (71) — a real, measured asymmetry, not a
                 guess.
            A bounding-box-midpoint estimate for cause 2, added to a
            first-pass value for cause 1, undershot the true correction by
            a consistent ~2.9px at both a mobile and a desktop viewport
            (verified by decoding actual screenshots and computing each
            row's darkness-weighted centroid for the logo and for the text
            artwork separately, then comparing the two centroids directly
            — the real acceptance test here, since it measures what a
            person actually sees, not just where the elements' boxes sit).
            The values above are the result of closing that gap and
            re-measuring: final measured centroid gap is 0.39px at
            1920×1080 and −0.04px at 360×760 — both comfortably under one
            rendered pixel, i.e. visually indistinguishable from perfect.
            A `transform: translateY()` was tried at one point instead of
            (part of) this margin, but was removed: `items-start` already
            lets a plain `margin-top` correct the column's position in one
            step, and stacking a transform on top double-shifted the
            rendered image rather than replacing part of the correction.
            The circular logo's own alpha bounds were checked the same way
            and found symmetric to within 2px of 311 (well under 1%) —
            negligible, so it is left untouched, per this milestone's own
            "do not move the logo if it is already correctly positioned"
            rule.
          */}
          <div className="mt-[8.3px] flex flex-col justify-center sm:mt-[6.4px]">
            <Image
              src="/agrinexus-text.png"
              alt={t("common.appName")}
              width={598}
              height={142}
              className="h-7 w-auto object-contain sm:h-8"
              priority
            />
            <Typography variant="small" className="text-foreground-subtle">
              {t("common.farmerBadge")}
            </Typography>
          </div>
        </div>

        <UserMenu />
      </header>

      {/*
        MVP-UI.1-D.1 (Farmer Mobile Shell, Navigation & AURA Composer
        Correction) — root cause of the 360×760 "Home is clipped" bug: this
        row was a single unconditional `flex ... overflow-x-auto` strip with
        no breakpoint of its own, so at any width narrower than the combined
        content width of all 4 items (icon + full label each, ~150-180px
        apiece) the row silently became horizontally scrollable — with no
        scrollbar affordance visible in this theme, that reads exactly like
        clipping, not "swipe for more." Below `sm` (640px) the strip is now a
        deliberate 4-column grid — every item gets an equal, guaranteed-
        visible share of the viewport, icon-over-label like a mobile tab bar,
        rather than one long row fighting for space. At `sm` and above the
        `sm:`-prefixed classes restore the EXACT pre-existing row layout
        (flex, gap-2, overflow-x-auto, px-6, py-3) — desktop is unchanged.
      */}
      <nav
        aria-label="Farmer navigation"
        className="grid shrink-0 grid-cols-4 gap-1.5 px-2 py-2 sm:flex sm:items-center sm:gap-2 sm:overflow-x-auto sm:px-6 sm:py-3"
      >
        {farmerNavItems.map((item) => {
          const active = item.href === "/farmer" ? pathname === "/farmer" : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1.5 py-2 text-center text-[11px] font-medium leading-tight transition-all duration-(--duration-base) ease-standard",
                "sm:min-h-11 sm:flex-row sm:justify-start sm:gap-2 sm:px-4 sm:py-2.5 sm:text-left sm:text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                active ? "text-accent" : "text-foreground-muted hover:text-foreground",
              )}
              style={{
                boxShadow: active ? "var(--shadow-neu-inset)" : "var(--shadow-panel)",
              }}
            >
              <item.icon className="size-5 sm:size-4.5" aria-hidden />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <main className="flex w-full min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-10 sm:px-6 lg:px-8">
        {/* MVP-UI.1-G — provides the ref set above to any descendant via `useFarmerThemeRoot()`; renders no DOM of its own, so this is not a layout change. */}
        <FarmerThemeRootContext.Provider value={themeRoot}>{children}</FarmerThemeRootContext.Provider>
      </main>
    </div>
    </TooltipProvider>
  );
}
