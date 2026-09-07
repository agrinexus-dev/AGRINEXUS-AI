import { StatusBadge, Typography } from "@agrinexus/ui";

export function StatusBar() {
  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-border-subtle bg-surface-elevated/80 px-3 py-1.5 backdrop-blur-md">
      <Typography variant="caption" className="text-foreground-muted">
        Digital Twin · Simulated environment
      </Typography>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status="nominal" label="Viewport Ready" />
        {/* Was "Drone · Patrolling" / a static claim that's
            no longer true by default now that a mission-less drone/robot
            sits idle at home instead of automatically patrolling. */}
        <StatusBadge status="nominal" label="Drone · Ready" />
        <StatusBadge status="nominal" label="Robot · Ready" />
        <StatusBadge status="nominal" label="Simulation · Running" />
      </div>
    </div>
  );
}
