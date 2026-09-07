import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({ className, leadingIcon, trailingIcon, disabled, ref, ...props }: InputProps) {
  const field = (
    <input
      ref={ref}
      disabled={disabled}
      className={cn(
        "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-foreground-subtle",
        "transition-colors duration-(--duration-fast) ease-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-(--opacity-disabled)",
        leadingIcon ? "pl-9" : undefined,
        trailingIcon ? "pr-9" : undefined,
        className,
      )}
      {...props}
    />
  );

  if (!leadingIcon && !trailingIcon) {
    return field;
  }

  return (
    <div className="relative flex items-center">
      {leadingIcon ? (
        <span className="pointer-events-none absolute left-3 flex text-foreground-subtle [&_svg]:size-4" aria-hidden>
          {leadingIcon}
        </span>
      ) : null}
      {field}
      {trailingIcon ? (
        <span className="pointer-events-none absolute right-3 flex text-foreground-subtle [&_svg]:size-4" aria-hidden>
          {trailingIcon}
        </span>
      ) : null}
    </div>
  );
}
