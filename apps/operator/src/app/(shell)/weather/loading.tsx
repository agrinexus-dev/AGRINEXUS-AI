import { Skeleton } from "@agrinexus/ui";

/** Shown while `/weather` is still loading — mirrors the real page's card layout. */
export default function WeatherLoading() {
  return (
    <div className="flex flex-col gap-5 pb-20">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl lg:col-span-2" />
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
