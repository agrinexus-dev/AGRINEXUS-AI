import { Skeleton } from "@agrinexus/ui";

/** Shown while `/drone-fleet/missions` is still loading (013D §5) — mirrors the real page's 3-panel shape. */
export default function MissionsLoading() {
  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-5 w-32" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_320px]">
        <Skeleton className="h-[78vh] min-h-[600px] rounded-lg" />
        <Skeleton className="h-[78vh] min-h-[600px] rounded-lg" />
        <Skeleton className="h-[78vh] min-h-[600px] rounded-lg" />
      </div>
    </div>
  );
}
