import { cn, Typography } from "@agrinexus/ui";

interface TimelineEvent {
  time: string;
  label: string;
}

const events: TimelineEvent[] = [
  { time: "09:12", label: "Drone launched" },
  { time: "09:18", label: "Disease detected" },
  { time: "09:20", label: "Robot dispatched" },
  { time: "09:25", label: "Mission complete" },
];

/** Static, illustrative sequence — visualizes the mission queue as a chronological flow. */
export function MissionTimelineWidget() {
  return (
    <ol className="flex h-full flex-col justify-center">
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        return (
          <li key={event.time} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn("size-2.5 shrink-0 rounded-full", isLast ? "bg-success" : "bg-accent")} aria-hidden="true" />
              {!isLast ? <span className="w-px flex-1 bg-border" aria-hidden="true" /> : null}
            </div>
            <div className={cn("flex flex-col gap-0.5", !isLast && "pb-4")}>
              <Typography variant="caption">{event.time}</Typography>
              <Typography variant="small" className="text-foreground">
                {event.label}
              </Typography>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
