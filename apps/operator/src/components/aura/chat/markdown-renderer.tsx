"use client";

import { memo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@agrinexus/ui";

const components: Components = {
  p: ({ children }) => <p className="leading-relaxed [&:not(:last-child)]:mb-2.5">{children}</p>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent underline underline-offset-2 hover:text-accent/80"
    >
      {children}
    </a>
  ),
  // `pl-5`/`border-l-2`/
  // `text-left` swapped for their LOGICAL Tailwind equivalents (`ps-5`/
  // `border-s-2`/`text-start`) so this shared component (used by both the
  // Farmer AURA page and the Operator floating panel) renders correctly
  // under the Farmer-only `dir="rtl"` wrapper without any
  // `dir`/role branching here. Zero effect on Operator: under `dir="ltr"`
  // (Operator's only context — no `dir="rtl"` exists anywhere in the
  // Operator shell), a logical "inline-start" resolves to the same physical
  // "left" these classes already meant, so the rendered CSS is unchanged.
  ul: ({ children }) => <ul className="mb-2.5 list-disc space-y-1 ps-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2.5 list-decimal space-y-1 ps-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2.5 border-s-2 border-border ps-3 text-foreground-muted italic last:mb-0">
      {children}
    </blockquote>
  ),
  h1: ({ children }) => <h1 className="mb-2 text-base font-semibold text-foreground">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 text-sm font-semibold text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 text-sm font-semibold text-foreground">{children}</h3>,
  hr: () => <hr className="my-3 border-border" />,
  table: ({ children }) => (
    <div className="mb-2.5 overflow-x-auto rounded-md border border-border last:mb-0">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-elevated">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border px-2.5 py-1.5 text-start font-medium text-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-border/60 px-2.5 py-1.5 text-foreground-muted">{children}</td>,
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? "");
    if (!isBlock) {
      return (
        <code
          className={cn("rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[0.85em] text-accent", className)}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={cn("font-mono text-xs text-foreground", className)} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2.5 overflow-x-auto rounded-md border border-border bg-surface p-3 last:mb-0">{children}</pre>
  ),
};

export interface MarkdownRendererProps {
  content: string;
}

/** Renders AURA's markdown replies (tables, lists, code blocks, links) matching the AgriNexus dark theme. Memoized since message lists re-render on every streamed delta. */
export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="text-sm text-foreground">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </div>
  );
});
