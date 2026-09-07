"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import {
  Bell,
  Bot,
  Cpu,
  Info,
  LogOut,
  Monitor,
  PlaneTakeoff,
  Radio,
  Sparkles,
  Sprout,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  SectionHeader,
  StatusBadge,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Typography,
} from "@agrinexus/ui";

import { AuraRouterPanel } from "@/components/aura/router/aura-router-panel";
import { AuraSettingsPanel } from "@/components/aura/settings/aura-settings-panel";
import { farmPlots } from "@/components/digital-twin/scene/farm-data";
import { useTheme } from "@/components/shell/theme-provider";
import type { AppSessionUser } from "@/lib/auth/types";
import { useFleetDrones } from "@/lib/fleet/fleet-store";
import { useRobots } from "@/lib/robots/robot-store";
import { DEFAULT_THRESHOLDS, useThresholdStore } from "@/lib/sensor-analytics/threshold-store";
import { THRESHOLD_METRIC_LABELS, type ThresholdMetric } from "@/lib/sensor-analytics/types";
import { useSensors } from "@/lib/sensors/sensor-store";

const THRESHOLD_METRICS: ThresholdMetric[] = ["soil-moisture", "humidity", "temperature", "battery", "signal"];

/**
 * Settings — the sidebar's "Settings" destination. The AURA
 * tab embeds the EXISTING `AuraSettingsPanel` unmodified (reusing the
 * existing AURA Settings rather
 * than rebuilding provider/model/temperature controls. The Sensors tab is
 * the one section with real, working, farm-wide effect: it edits the same
 * Threshold Store the Smart Alerts ticker and Agricultural Reasoning Engine
 * both already read, so a change here immediately changes
 * which alerts open and which plots get flagged everywhere else in the app.
 * Every other section either reflects real store data read-only, or is
 * explicitly marked unavailable/not-yet-implemented rather than presenting a
 * control with nothing behind it.
 */
export function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user as AppSessionUser | undefined;
  const { theme, setTheme } = useTheme();
  const drones = useFleetDrones();
  const robots = useRobots();
  const sensors = useSensors();
  const thresholds = useThresholdStore((state) => state.thresholds);
  const updateThreshold = useThresholdStore((state) => state.updateThreshold);
  const resetThreshold = useThresholdStore((state) => state.resetThreshold);

  return (
    <div className="flex flex-col gap-5 pb-20">
      <SectionHeader title="Settings" description="Application, farm, and account configuration." />

      <Tabs defaultValue="general" className="flex flex-col gap-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="aura">AURA</TabsTrigger>
          <TabsTrigger value="aura-router">AURA Router</TabsTrigger>
          <TabsTrigger value="farm">Farm</TabsTrigger>
          <TabsTrigger value="fleet">Fleet</TabsTrigger>
          <TabsTrigger value="sensors">Sensors</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="display">Display</TabsTrigger>
          <TabsTrigger value="simulation">Simulation</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <Typography variant="small" className="text-foreground">
                    {user?.name ?? "Operator Account"}
                  </Typography>
                  <Typography variant="caption" className="text-foreground-subtle">
                    {user?.email ?? "—"}
                  </Typography>
                </div>
                {user?.role ? <Badge intent="accent" className="capitalize">{user.role}</Badge> : null}
              </div>
              <Button intent="secondary" leadingIcon={<LogOut className="size-4" />} onClick={() => void signOut({ callbackUrl: "/login" })} className="w-fit">
                Sign out
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aura">
          <Card className="overflow-hidden p-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-foreground-muted" aria-hidden />
                AURA
              </CardTitle>
            </CardHeader>
            <div className="max-h-[70vh] overflow-y-auto border-t border-border">
              <AuraSettingsPanel />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="aura-router">
          <AuraRouterPanel />
        </TabsContent>

        <TabsContent value="farm">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sprout className="size-4 text-foreground-muted" aria-hidden />
                Farm Layout
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {farmPlots.map((plot) => (
                <div key={plot.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-3">
                  <Typography variant="small" className="text-foreground">
                    {plot.label}
                  </Typography>
                  <Badge intent="neutral" className="capitalize">
                    {plot.growthStage}
                  </Badge>
                </div>
              ))}
              <Typography variant="caption" className="text-foreground-subtle">
                Reference farm layout — not editable in this version.
              </Typography>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fleet">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <PlaneTakeoff className="size-4 text-foreground-muted" aria-hidden />
                  Drones
                </CardTitle>
                <Link href="/drone-fleet" className="text-xs text-accent hover:underline">
                  Manage →
                </Link>
              </CardHeader>
              <CardContent>
                <Typography variant="small" className="text-foreground-muted">
                  {drones.length} drone{drones.length === 1 ? "" : "s"} registered.
                </Typography>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <Bot className="size-4 text-foreground-muted" aria-hidden />
                  Ground Robots
                </CardTitle>
                <Link href="/ground-robots" className="text-xs text-accent hover:underline">
                  Manage →
                </Link>
              </CardHeader>
              <CardContent>
                <Typography variant="small" className="text-foreground-muted">
                  {robots.length} robot{robots.length === 1 ? "" : "s"} registered.
                </Typography>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sensors">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="size-4 text-foreground-muted" aria-hidden />
                Alert Thresholds
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Typography variant="caption" className="text-foreground-subtle">
                {sensors.length} sensors registered. These thresholds drive Smart Alerts and the Agricultural Reasoning Engine everywhere in the
                app — changing one here changes which plots get flagged on the Digital Twin, Analytics, Alerts, and AURA immediately.
              </Typography>
              {THRESHOLD_METRICS.map((metric) => {
                const config = thresholds[metric];
                return (
                  <div key={metric} className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface/60 p-3">
                    <Typography variant="small" className="w-32 shrink-0 text-foreground">
                      {THRESHOLD_METRIC_LABELS[metric]}
                    </Typography>
                    <label className="flex flex-col gap-1">
                      <Typography variant="caption" className="text-foreground-subtle">
                        Min
                      </Typography>
                      <Input
                        type="number"
                        value={config.min}
                        onChange={(event) => updateThreshold(metric, { min: Number(event.target.value) })}
                        className="w-20"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <Typography variant="caption" className="text-foreground-subtle">
                        Max
                      </Typography>
                      <Input
                        type="number"
                        value={config.max}
                        onChange={(event) => updateThreshold(metric, { max: Number(event.target.value) })}
                        className="w-20"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <Typography variant="caption" className="text-foreground-subtle">
                        Target
                      </Typography>
                      <Input
                        type="number"
                        value={config.target}
                        onChange={(event) => updateThreshold(metric, { target: Number(event.target.value) })}
                        className="w-20"
                      />
                    </label>
                    {(config.min !== DEFAULT_THRESHOLDS[metric].min || config.max !== DEFAULT_THRESHOLDS[metric].max || config.target !== DEFAULT_THRESHOLDS[metric].target) ? (
                      <Button intent="ghost" size="sm" onClick={() => resetThreshold(metric)} className="ml-auto">
                        Reset
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="size-4 text-foreground-muted" aria-hidden />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Typography variant="small" className="text-foreground-muted">
                Not implemented — alerts are visible in-app only (the Alerts page, Digital Twin markers, and AURA). Email/push/SMS delivery isn&apos;t
                implemented in this version.
              </Typography>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="display">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="size-4 text-foreground-muted" aria-hidden />
                Display
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/*
                UI-UPGRADE.2 (Operator Light Theme Foundation) — replaces
                the previous static "Dark (only mode available)" badge with
                a real, working toggle against `theme-provider.tsx`'s now-
                persisted preference. Dark remains the default for a
                session that has never set a preference; no "System" option
                is offered, per this milestone's own explicit scope.
              */}
              <div className="flex items-center justify-between gap-3">
                <Typography variant="small" className="text-foreground">
                  Theme
                </Typography>
                <div className="flex items-center gap-2">
                  <Typography variant="caption" className="text-foreground-subtle">
                    {theme === "dark" ? "Dark" : "Light"}
                  </Typography>
                  <Switch
                    checked={theme === "light"}
                    onCheckedChange={(checked) => setTheme(checked ? "light" : "dark")}
                    aria-label="Toggle light theme"
                  />
                </div>
              </div>
              <Typography variant="caption" className="text-foreground-subtle">
                Widget layout, sizing, and presentation mode are managed from the Mission Control toolbar, not here.
              </Typography>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simulation">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="size-4 text-foreground-muted" aria-hidden />
                Simulation
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Typography variant="small" className="text-foreground-muted">
                Every drone, robot, sensor, and mission on this platform is simulated — there is no real hardware connected yet (see the System
                tab; a real PostgreSQL backend persists this simulated data, but nothing here talks to physical equipment). Sensor readings drift
                continuously, Smart Alerts re-evaluate on a fixed interval, and mission/robot movement progresses on its own simulation loop while
                the relevant pages are open.
              </Typography>
              <Typography variant="caption" className="text-foreground-subtle">
                There is no on/off switch for the simulation in this version — it runs whenever a page that needs it is mounted.
              </Typography>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="size-4 text-foreground-muted" aria-hidden />
                System Information
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <Typography variant="small" className="text-foreground-muted">
                  Frontend
                </Typography>
                <StatusBadge status="nominal" label="Complete simulation" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Typography variant="small" className="text-foreground-muted">
                  Backend
                </Typography>
                <StatusBadge status="nominal" label="Connected (PostgreSQL)" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Typography variant="small" className="text-foreground-muted">
                  Real hardware
                </Typography>
                <StatusBadge status="offline" label="Not connected" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
