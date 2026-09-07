import { Skeleton } from "@agrinexus/ui";

/** Shown while `/settings` is still loading — mirrors the real page's tabbed layout. */
export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-5 pb-20">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-9 w-full max-w-2xl rounded-md" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
