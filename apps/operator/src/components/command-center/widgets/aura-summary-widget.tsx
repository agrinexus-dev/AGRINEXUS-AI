import { Sparkles } from "lucide-react";

import { Badge, Button, Typography } from "@agrinexus/ui";

import { getTimeOfDayGreeting } from "../lib/greeting";

/** Exported so AURA's Context Engine can read the same dashboard-state copy this widget renders, instead of duplicating it. */
export const DASHBOARD_FARM_STATUS = "Operational";
export const dashboardRecommendations = ["Inspect North Field.", "Rain expected in 42 minutes.", "Drone Alpha ready."];

/** An AI Operations Summary, not a chatbot — static illustrative copy, no live reasoning. */
export function AuraSummaryWidget() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {/* Same server/client timezone hydration-mismatch fix as `greeting-section.tsx` — see that file's doc comment. */}
        <Typography variant="h4">
          <span suppressHydrationWarning>{getTimeOfDayGreeting()}</span>.
        </Typography>
        <Badge intent="success">{DASHBOARD_FARM_STATUS}</Badge>
      </div>

      <div className="flex flex-col gap-1">
        <Typography variant="caption">Farm Status</Typography>
        <Typography variant="small" className="text-foreground">
          {DASHBOARD_FARM_STATUS}
        </Typography>
      </div>

      <div className="flex flex-col gap-1.5">
        <Typography variant="caption">Recommendations</Typography>
        <ul className="flex flex-col gap-1">
          {dashboardRecommendations.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <Sparkles className="mt-0.5 size-3 shrink-0 text-accent" aria-hidden="true" />
              <Typography variant="small" className="text-foreground">
                {item}
              </Typography>
            </li>
          ))}
        </ul>
      </div>

      <Button intent="secondary" size="sm" className="mt-auto self-start">
        Review Recommendations
      </Button>
    </div>
  );
}
