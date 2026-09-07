import { Skeleton } from "@agrinexus/ui";

/**
 * Shown while the shell segment (and the session check the middleware just
 * performed for it) is still resolving — e.g. on a hard navigation, before
 * the authenticated shell has anything to paint.
 */
export default function ShellLoading() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-background p-8">
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
