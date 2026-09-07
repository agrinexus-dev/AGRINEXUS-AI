import { Skeleton } from "@agrinexus/ui";

/** Shown while the `/sensor-network` route segment is still loading — mirrors `ground-robots/loading.tsx`'s LEFT/CENTER/RIGHT panel shape so there's no blank flash or layout shift once it mounts. */
export default function SensorNetworkLoading() {
  return (
    <div className="flex flex-col gap-6 pb-20">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>

      <Skeleton className="h-14 rounded-lg" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_340px]">
        <Skeleton className="h-96 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    </div>
  );
}
