import { Skeleton } from "@agrinexus/ui";

/**
 * Shown while the `/digital-twin` route segment itself is still loading
 * mirrors the real page's own chrome shape (toolbar bar,
 * viewport, status bar) so there's never a blank flash before the actual
 * Digital Twin mounts, and no layout shift once it does.
 */
export default function DigitalTwinLoading() {
  return (
    <div className="relative flex h-[78vh] min-h-[600px] w-full flex-col gap-0 overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border-subtle p-3">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="size-8 rounded-md" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>

      <div className="relative flex-1 p-3">
        <Skeleton className="absolute inset-3 rounded-lg" />
      </div>

      <div className="flex items-center gap-2 border-t border-border-subtle p-2">
        <Skeleton className="h-4 w-40" />
        <div className="flex-1" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}
