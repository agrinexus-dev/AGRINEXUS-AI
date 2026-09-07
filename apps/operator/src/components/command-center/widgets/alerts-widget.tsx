import { AlertCard } from "@agrinexus/ui";

/** Exported so AURA's Context Engine can read the same alerts this widget renders, instead of duplicating them. */
export const dashboardAlerts = [
  {
    severity: "attention" as const,
    title: "Irrigation pressure low",
    description: "Zone 3 pressure below threshold.",
    timestamp: "12 min ago",
  },
  {
    severity: "critical" as const,
    title: "Disease marker detected",
    description: "North Field, sector B4.",
    timestamp: "26 min ago",
  },
];

export function AlertsWidget() {
  return (
    <div className="flex h-full flex-col gap-2">
      {dashboardAlerts.map((alert) => (
        <AlertCard key={alert.title} {...alert} />
      ))}
    </div>
  );
}
