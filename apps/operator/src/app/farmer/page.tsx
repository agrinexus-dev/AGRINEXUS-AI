import Link from "next/link";
import { AlertOctagon, AlertTriangle, History, MapPin, Sparkles, Sprout } from "lucide-react";

import { buttonVariants, Card, CardContent, CardHeader, cn, Typography } from "@agrinexus/ui";

import { listAlerts } from "@/lib/alerts/alerts-service";
import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { AskAuraAboutFindingButton } from "@/components/farmer/ask-aura-about-finding-button";
import { CreateMissionModal } from "@/components/farmer/create-mission-modal";
import { FarmStateHero } from "@/components/farmer/farm-state-hero";
import { FARMER_CONTENT_WIDTH } from "@/components/farmer/farmer-shell";
import { FarmerFleetAvailability } from "@/components/farmer/farmer-fleet-availability";
import { listDrones } from "@/lib/drones/drones-service";
import { deriveFarmState } from "@/lib/farmer/farm-state";
import { listFindings } from "@/lib/findings/findings-service";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { FarmerCardArrow } from "@/lib/farmer/i18n/farmer-card-arrow";
import { FarmerEmptyState } from "@/lib/farmer/i18n/farmer-empty-state";
import { FarmerKpiCard } from "@/lib/farmer/i18n/farmer-kpi-card";
import { FarmerT } from "@/lib/farmer/i18n/farmer-t";
import { listMissions } from "@/lib/missions/missions-service";
import { prisma } from "@/lib/prisma/client";
import { listRobotMissions } from "@/lib/robot-missions/robot-missions-service";
import { listRobots } from "@/lib/robots/robots-service";
import { fetchWeatherSnapshot } from "@/lib/weather/weather-provider";

const ACTIVE_MISSION_STATUSES = new Set(["queued", "preparing", "taking-off", "surveying", "returning", "landing", "paused"]);

interface RecentOperation {
  id: string;
  label: string;
  vehicleName: string | null;
  plotId: string | null;
  completedAt: number;
}

/**
 * Farmer Dashboard — a Server Component reading the SAME
 * farm-scoped services the Operator app already uses (Part 18/19: shared
 * backend, not a second data-access layer). Every number below is a real
 * count from the database for the farm this session is assigned to
 * (`getFarmForSession` — Part 9); anything not yet configured (no farm
 * location, no data at all) renders an honest empty state, never a
 * fabricated figure.
 */
export default async function FarmerDashboardPage() {
  const session = await auth();
  const user = session?.user as AppSessionUser | undefined;
  const farm = user ? await getFarmForSession(user) : null;

  if (!farm) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <FarmerEmptyState icon={<Sprout />} titleKey="dashboard.noFarmTitle" descriptionKey="dashboard.noFarmDescription" />
      </div>
    );
  }

  const [farmRecord, missions, robotMissions, findings, alerts, drones, robots] = await Promise.all([
    prisma.farm.findUnique({ where: { id: farm.id }, select: { latitude: true, longitude: true } }),
    listMissions(farm.id),
    listRobotMissions(farm.id),
    listFindings(farm.id),
    listAlerts(farm.id),
    listDrones(farm.id),
    listRobots(farm.id),
  ]);

  const activeMissionCount =
    missions.filter((mission) => ACTIVE_MISSION_STATUSES.has(mission.status)).length +
    robotMissions.filter((mission) => ACTIVE_MISSION_STATUSES.has(mission.status)).length;
  // the same two real arrays the old standalone "Open Crop Issues"/
  // "Unresolved Alerts" KPI cards each reduced to a bare count. Kept here
  // as arrays (not pre-reduced) so both the Farm State hero below and the
  // existing Attention list can read them without re-filtering `findings`/
  // `alerts` a second time.
  const unresolvedFindings = findings.filter((finding) => finding.status !== "resolved");
  const unresolvedAlertsList = alerts.filter((alert) => alert.resolvedAt === null);

  // "recent completed operations/history": real completed missions only
  // (never active ones — that distinction is the whole point), most recent
  // first, from the SAME `missions`/`robotMissions` already fetched above.
  // Drone/robot names are resolved from the real fleet identity lists
  // (`listDrones`/`listRobots`) rather than showing a bare id.
  const droneNameById = new Map(drones.map((drone) => [drone.id, drone.name]));
  const robotNameById = new Map(robots.map((robot) => [robot.id, robot.name]));
  const recentOperations: RecentOperation[] = [
    ...missions
      .filter((mission) => mission.status === "completed" && mission.completedAt !== null)
      .map((mission) => ({
        id: mission.id,
        label: mission.name,
        vehicleName: mission.assignedDroneId ? (droneNameById.get(mission.assignedDroneId) ?? null) : null,
        plotId: mission.targetPlotId,
        completedAt: mission.completedAt!,
      })),
    ...robotMissions
      .filter((mission) => mission.status === "completed" && mission.completedAt !== null)
      .map((mission) => ({
        id: mission.id,
        label: mission.name,
        vehicleName: mission.assignedRobotId ? (robotNameById.get(mission.assignedRobotId) ?? null) : null,
        plotId: mission.targetPlotId,
        completedAt: mission.completedAt!,
      })),
  ]
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, 5);

  const weather =
    farmRecord?.latitude != null && farmRecord?.longitude != null
      ? await fetchWeatherSnapshot(farmRecord.latitude, farmRecord.longitude).catch(() => null)
      : null;

  // The entire Farm State classification, computed purely
  // from the real, already-fetched data above (no new fetch, no new
  // store). See `deriveFarmState`'s own doc comment for the exact
  // Healthy/Needs Attention/Critical rule, approved verbatim in the
  // MVP-UI.2-A audit and the governing prompt.
  const farmState = deriveFarmState({
    unresolvedFindings,
    unresolvedAlerts: unresolvedAlertsList,
    weatherAnalysis: weather ? weather.snapshot.analysis : null,
  });

  const hasAttention = unresolvedAlertsList.length > 0;
  const hasRecentOperations = recentOperations.length > 0;

  return (
    <div className={cn(FARMER_CONTENT_WIDTH.wide, "flex flex-col gap-8 py-6 lg:py-8")}>
      {/*
        MVP-UI.2-B1 (Farmer Dashboard Farm State & Composition Foundation)
        — demoted from the `display` variant (MVP-UI.1-B): the Farm State
        hero below is now the page's dominant visual, per the approved
        MVP-UI.2-A audit's own "Dashboard = Farm State" finding. This
        heading stays the document's semantic `<h1>` (`as="h1"`, unchanged
        from before — `display`'s own default element) — only its VISUAL
        size shrinks, to `h3` scale, so it reads as an identity strip
        rather than competing with the state hero for attention. The farm
        name (real data, unchanged) stays visible immediately beneath it.
      */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Typography variant="h3" as="h1">
            <FarmerT k="dashboard.welcomeBack" />
          </Typography>
          <Typography variant="body" className="text-foreground-muted">
            {farm.name}
          </Typography>
        </div>
        <CreateMissionModal />
      </div>

      {/*
        MVP-UI.2-B1 — the new dominant visual (MVP-UI.2-A audit finding #5:
        "Farm State must become the dominant visual"). `farmState` is
        derived entirely from real data already fetched above — see
        `deriveFarmState`'s own doc comment. Rendered as the page's `<h2>`
        internally (see `FarmStateHero`), immediately after the `<h1>`
        above — no heading level is skipped.
      */}
      <FarmStateHero level={farmState.level} reasons={farmState.reasons} />

      {/*
        MVP-UI.2-B1 — replaces the previous 5-equal-KPI-card row (audit
        finding #6: "existing five KPI cards should no longer compete
        equally"). "Open Crop Issues"/"Unresolved Alerts" are no longer
        shown here as bare counts — that same real data now feeds the Farm
        State hero above instead of being duplicated. The remaining three
        — Active Missions, Fleet availability, current Weather — are kept
        as real secondary statistics, per the audit's own explicit list,
        now visually quieter (plain `default` Card, no elevation) than the
        hero above it.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FarmerKpiCard labelKey="dashboard.activeMissions" value={activeMissionCount} />
        <FarmerFleetAvailability />
        <Card>
          <CardHeader className="pb-2">
            <Typography variant="caption">
              <FarmerT k="dashboard.weather" />
            </Typography>
          </CardHeader>
          <CardContent>
            {weather ? (
              <div className="flex items-baseline gap-2">
                <bdi className="font-mono text-lg font-semibold text-foreground">
                  {weather.snapshot.current.temperatureC != null ? Math.round(weather.snapshot.current.temperatureC) : "—"}°C
                </bdi>
                <Typography variant="small" className="text-foreground-muted">
                  <bdi>{weather.snapshot.current.conditionText}</bdi>
                </Typography>
              </div>
            ) : (
              <Typography variant="small" className="text-foreground-subtle">
                <FarmerT k="dashboard.noWeatherData" />
              </Typography>
            )}
          </CardContent>
        </Card>
      </div>

      {/*
        MVP-UI.2-B1 — the operational content area (audit finding: Attention
        and Recent Operations were previously stacked full-width, each
        fighting the other for "first below the fold"). Side-by-side on
        desktop, stacked on mobile via the existing responsive grid system
        — no new layout primitive. Content/logic is byte-for-byte the same
        as before this milestone (still read-only; B2 adds the actionable
        click-through) — only the surrounding structure and heading level
        changed. Whichever card is alone (the other has no data) spans
        both columns rather than leaving an empty gap beside it.
      */}
      {hasAttention || hasRecentOperations ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {hasAttention ? (
            <Card className={cn(!hasRecentOperations && "lg:col-span-2")}>
              <CardHeader className="flex-row items-center gap-2">
                <AlertTriangle className="size-4 text-warning" aria-hidden />
                <Typography variant="h4" as="h3">
                  <FarmerT k="dashboard.attention" />
                </Typography>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {unresolvedAlertsList.slice(0, 5).map((alert) => {
                  // Severity hierarchy using the REAL, already-
                  // fetched `Alert.severity` field ("warning" | "critical" —
                  // `sensor-analytics/types.ts`), not an invented category
                  // (MVP-UI.1-A audit — the finer "Critical/High/Low"
                  // wording visible in that audit's screenshots lives in each
                  // alert's own free-text `message`, not a third structured
                  // tier; see the report for why a richer
                  // per-finding severity was not wired in here). A critical
                  // alert gets a filled icon + a start-edge accent bar (using
                  // the logical `border-s` property so it's correctly on the
                  // RTL/Urdu leading edge, not hardcoded to the left) and
                  // slightly heavier text; a warning alert stays visible but
                  // deliberately quieter, restrained semantic colors only.
                  const isCritical = alert.severity === "critical";
                  // MVP-UI.2-B2 (Farmer Dashboard Attention & Actionable
                  // Content — `findingId` is a real field already present
                  // on `SensorAlertRecord` (`alerts-service.ts`), set only
                  // for a crop-finding-derived alert (`upsertFindingAlert`,
                  // called only from `createFinding`). Gating on this real
                  // relation — never on parsing "Plot B" out of `message` —
                  // is the exact "data relationships must win over message
                  // wording" rule this change requires. When present,
                  // `findingPlotLabel`/`findingIssueType` are the SAME
                  // denormalized real fields the finding's own detection
                  // already recorded (see `toDomainAlert`), not derived here.
                  const hasFindingContext = alert.findingId !== null;
                  return (
                    <div
                      key={alert.id}
                      className={cn(
                        "flex flex-col gap-2 rounded-md border-s-2 px-2.5 py-2",
                        isCritical ? "border-critical bg-critical-muted/40" : "border-warning bg-transparent",
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        {isCritical ? (
                          <AlertOctagon className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
                        ) : (
                          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                        )}
                        {/* `<bdi>` — see `KpiCard.tsx`'s identical fix; these alert
                            messages are English sentences that can appear under
                            an Urdu `dir="rtl"` ancestor. */}
                        <Typography variant="small" className={cn(isCritical && "font-medium text-foreground")}>
                          <bdi>{alert.message}</bdi>
                        </Typography>
                      </div>
                      {/*
                        MVP-UI.2-B2 — actions, indented under the icon so
                        they read as belonging to this one alert, not the
                        whole list. `flex-wrap` (not a fixed 2-up row) so
                        two labeled buttons never overflow at 360px — they
                        wrap onto their own line instead (this milestone's
                        own explicit mobile requirement).
                      */}
                      <div className="flex flex-wrap items-center gap-2 ps-6.5">
                        {hasFindingContext ? (
                          // A plain, real `<Link>` styled with
                          // the Button system's own exported `buttonVariants`
                          // (not `<Button asChild>`: live testing found
                          // `Button`'s `asChild`/Radix `Slot` path throws
                          // "Slot failed to slot onto its children" whenever
                          // `leadingIcon`/`trailingIcon` are present in its
                          // children array, even as `undefined` — a
                          // pre-existing `Button` limitation with no prior
                          // usage anywhere in this repo to have caught it;
                          // see the report for the full
                          // finding. `buttonVariants` is already exported
                          // from `@agrinexus/ui` for exactly this kind of
                          // "style a non-Button element identically" case,
                          // so this stays a reuse of an existing export,
                          // not a new visual system, and `packages/ui` was
                          // never touched.
                          <Link
                            href={`/farmer/digital-twin?focusFinding=${encodeURIComponent(alert.findingId!)}`}
                            className={cn(buttonVariants({ intent: "ghost", size: "sm" }), "gap-1.5")}
                          >
                            <MapPin className="size-3.5" aria-hidden />
                            <FarmerT k="dashboard.viewOnDigitalTwin" />
                          </Link>
                        ) : null}
                        {hasFindingContext ? (
                          <AskAuraAboutFindingButton
                            findingId={alert.findingId!}
                            plotLabel={alert.findingPlotLabel ?? ""}
                            description={alert.message}
                          />
                        ) : (
                          // No finding/plot to ground this in
                          // (e.g. a sensor-only alert: low battery, poor
                          // signal, offline). A plain, real link into AURA
                          // — the SAME destination the Dashboard's own
                          // "Ask AURA" card below already uses — never a
                          // fabricated context or the finding-specific
                          // auto-question, which would misrepresent a
                          // sensor alert as a crop issue.
                          <Link href="/farmer/aura" className={cn(buttonVariants({ intent: "ghost", size: "sm" }), "gap-1.5")}>
                            <Sparkles className="size-3.5" aria-hidden />
                            <FarmerT k="dashboard.askAuraCardTitle" />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          {hasRecentOperations ? (
            <Card className={cn(!hasAttention && "lg:col-span-2")}>
              <CardHeader className="flex-row items-center gap-2">
                <History className="size-4 text-accent" aria-hidden />
                <Typography variant="h4" as="h3">
                  <FarmerT k="dashboard.recentCompletedOperations" />
                </Typography>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {recentOperations.map((operation) => (
                  <div key={operation.id} className="flex items-center justify-between gap-3 border-b border-border-subtle pb-2 last:border-0 last:pb-0">
                    <div>
                      <Typography variant="small">{operation.label}</Typography>
                      {/* `<bdi>` — vehicle name/plot letter/date are all Latin-script identifiers or English-formatted values that can sit inside an Urdu RTL row. */}
                      <Typography variant="caption" className="text-foreground-subtle">
                        <bdi>
                          {operation.vehicleName ?? <FarmerT k="common.unassigned" />}
                          {operation.plotId ? ` · Plot ${operation.plotId.slice(-1).toUpperCase()}` : ""}
                        </bdi>
                      </Typography>
                    </div>
                    <Typography variant="caption" className="text-foreground-subtle">
                      <bdi>{new Date(operation.completedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</bdi>
                    </Typography>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/*
        MVP-UI.2-B1 — the same two navigation entry points as before
        (byte-for-byte unchanged copy/links/icons — no live preview, no
        AURA quick-prompt: those are explicitly out of this milestone's
        scope), only repositioned: previously the very last thing on the
        page after 3 full-width list cards, now immediately after the
        operational split, meaningfully higher in the page's real,
        shortened flow (MVP-UI.2-A audit finding #9). `as="h3"` fixes the
        heading-hierarchy skip the audit found (h1 → h4 with no h2/h3) —
        visual size is unchanged, only the semantic tag.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/farmer/digital-twin">
          <Card variant="elevated" className="flex h-full flex-col justify-between gap-4 p-1 transition-transform duration-(--duration-base) ease-standard hover:-translate-y-0.5">
            <CardHeader className="flex-row items-center gap-2">
              <Sprout className="size-4 text-accent" aria-hidden />
              <Typography variant="h4" as="h3">
                <FarmerT k="dashboard.digitalTwinCardTitle" />
              </Typography>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <Typography variant="small" className="text-foreground-muted">
                <FarmerT k="dashboard.digitalTwinCardDescription" />
              </Typography>
              <FarmerCardArrow />
            </CardContent>
          </Card>
        </Link>

        <Link href="/farmer/aura">
          <Card variant="elevated" className="flex h-full flex-col justify-between gap-4 p-1 transition-transform duration-(--duration-base) ease-standard hover:-translate-y-0.5">
            <CardHeader className="flex-row items-center gap-2">
              <Sparkles className="size-4 text-accent" aria-hidden />
              <Typography variant="h4" as="h3">
                <FarmerT k="dashboard.askAuraCardTitle" />
              </Typography>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <Typography variant="small" className="text-foreground-muted">
                <FarmerT k="dashboard.askAuraCardDescription" />
              </Typography>
              <FarmerCardArrow />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
