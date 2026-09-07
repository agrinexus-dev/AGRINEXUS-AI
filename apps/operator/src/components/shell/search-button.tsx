import { Search } from "lucide-react";

import { cn } from "@agrinexus/ui";

export interface SearchButtonProps {
  className?: string;
}

/**
 * UI only — a styled trigger with no command palette wired behind it yet.
 * Still a real, keyboard-reachable <button>, just without a handler.
 */
export function SearchButton({ className }: SearchButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 w-56 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-foreground-subtle",
        "transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-elevated hover:text-foreground-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 text-left">Search</span>
      <kbd className="rounded border border-border-subtle bg-surface-elevated px-1.5 py-0.5 font-mono text-[11px] text-foreground-subtle">
        &#8984;K
      </kbd>
    </button>
  );
}
