import { Bell } from "lucide-react";

import { cn, IconButton } from "@agrinexus/ui";

export interface NotificationBellProps {
  /** No notification data source exists yet — defaults to no indicator. */
  hasUnread?: boolean;
  className?: string;
}

export function NotificationBell({ hasUnread = false, className }: NotificationBellProps) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <IconButton aria-label="Notifications" icon={<Bell />} intent="ghost" size="md" />
      {hasUnread ? (
        <span
          aria-hidden
          className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent ring-2 ring-surface"
        />
      ) : null}
    </span>
  );
}
