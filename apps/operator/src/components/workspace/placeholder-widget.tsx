import type { LucideIcon } from "lucide-react";

import { Typography } from "@agrinexus/ui";

export function PlaceholderWidgetBody({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
      <Icon className="size-6 text-foreground-subtle" aria-hidden />
      <Typography variant="small" className="text-foreground-subtle">
        Ready
      </Typography>
    </div>
  );
}
