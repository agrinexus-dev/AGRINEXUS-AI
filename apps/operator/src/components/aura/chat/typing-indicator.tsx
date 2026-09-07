export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1.5" role="status" aria-label="AURA is responding">
      <span className="size-1.5 animate-bounce rounded-full bg-foreground-subtle [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-foreground-subtle [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-foreground-subtle" />
    </div>
  );
}
