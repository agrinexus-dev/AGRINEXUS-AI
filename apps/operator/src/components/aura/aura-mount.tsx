"use client";

import { useAuraChatStore } from "@/lib/aura/client/aura-chat-store";
import { useHydrateAuraDataStores } from "@/lib/aura/hydrate-stores";

import { AuraRouterBridge } from "./action-bridges/aura-router-bridge";
import { AuraLauncher } from "./aura-launcher";
import { AuraPanel } from "./aura-panel";

/**
 * The whole AURA feature's single mount point. Loaded via `next/dynamic`
 * with `ssr: false` from `AppShell` (see that file) so react-markdown, the
 * chat/settings stores, and everything else under `components/aura` and
 * `lib/aura` stay out of the app shell's initial bundle — they only load
 * once this component actually mounts on the client.
 *
 * Live verification found `collect-context.ts`'s
 * `cropFindings`/`plots`/`recurringMissions` fields came back empty when
 * AURA was opened from Mission Control (`/`), which never itself hydrates
 * the Finding/Plot/Recurring Mission Stores (only Analytics/Digital
 * Twin/Missions/Reports/Robot Missions do, each for their own rendering).
 * Fixed by hydrating those 3 stores here, since AURA is mounted on every
 * shell page — this is the one place that can guarantee a store is
 * populated regardless of which page the operator opened AURA from.
 *
 * This change extends this to the REMAINING 6 stores AURA's context
 * depends on (drones, robots, sensors, alerts, drone missions, robot
 * missions). An earlier comment here claimed Mission Control's widgets
 * already hydrated those — re-auditing found that claim was
 * WRONG: `command-center/` calls no `fetch*` at all. What actually made
 * the earlier live test look correct was that `fleet-store.ts`/`robot-
 * store.ts` seed exactly ONE drone ("Drone Alpha") and ONE robot ("Robot
 * Bravo") into their initial state unconditionally (so a single-vehicle
 * demo farm looked fully hydrated even when it wasn't) — a second real
 * drone/robot added via the database would have been silently invisible to
 * AURA on any page that never calls `fetchDrones`/`fetchRobots`. Same risk
 * for sensors/alerts/missions/robot missions, which start genuinely empty.
 * All 9 calls below are the EXACT SAME store fetch actions every other page
 * already calls (Part A: "do not create a second data-access system"),
 * fired once on mount — not a new hydration mechanism, not a poll.
 *
 * This change adds one more: `fetchAutonomousState()`
 * (`lib/autonomous/autonomous-behavior.ts`) — the same page-independence
 * gap, found the same way. AURA's `show-autonomous-status` deterministic
 * command reads the Fleet/Robot Store's `autonomousEnabled` flag directly;
 * that flag is only hydrated from its new persisted `Farm` column by
 * `useAutonomousBehaviorScheduler`, which Mission Control (`/`) — a page
 * AURA is very commonly opened from — never mounts. Guarded by that
 * function's own internal flag, so this and any scheduler-mounting page
 * calling it too still issues at most one real GET.
 *
 * This change adds `fetchWeather()` (`lib/weather/weather-store.ts`) — same
 * reasoning again: AURA's weather questions need real data regardless of
 * whether the operator ever visits the Weather page itself this session.
 *
 * The hydration effect itself moved to `lib/aura/hydrate-
 * stores.ts` (`useHydrateAuraDataStores`) unchanged, so the new Farmer AURA
 * full page can call the exact same hook instead of a second copy.
 */
export default function AuraMount() {
  const isOpen = useAuraChatStore((state) => state.isOpen);

  useHydrateAuraDataStores();

  return (
    <>
      <AuraRouterBridge />
      <AuraLauncher />
      {isOpen ? <AuraPanel /> : null}
    </>
  );
}
