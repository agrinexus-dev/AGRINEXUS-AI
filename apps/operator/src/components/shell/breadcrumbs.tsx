import { ChevronRight } from "lucide-react";

import { cn } from "@agrinexus/ui";

export interface BreadcrumbItem {
  label: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

/** Presentational only — reflects the current workspace selection, not real routing. */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("hidden items-center gap-1.5 md:flex", className)}>
      <ol className="flex items-center gap-1.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "text-sm",
                  isLast ? "font-medium text-foreground" : "text-foreground-subtle",
                )}
                aria-current={isLast ? "page" : undefined}
              >
                {item.label}
              </span>
              {!isLast ? <ChevronRight className="size-3.5 text-foreground-subtle" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
