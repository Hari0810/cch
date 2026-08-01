/**
 * Small shared display pieces for the Organisation surface.
 *
 * Every one of these renders a stored value. None of them computes a score,
 * a verdict or a severity — where a colour appears it marks the *absence of a
 * row* (no review has ever been recorded), which is a fact, not a judgement.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Sensitivity } from "@/lib/types";

/** Absolute dates only. Nothing on this screen reads the wall clock. */
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.slice(0, 5);
}

/** A labelled value. Renders an explicit em-dash when the column is null. */
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <div className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="truncate text-sm">
        {children ?? <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

const SENSITIVITY_CLASS: Record<Sensitivity, string> = {
  public: "border-border text-muted-foreground",
  internal: "border-border text-muted-foreground",
  confidential: "border-warning/40 text-warning",
  restricted: "border-alert/50 text-alert",
};

export function SensitivityBadge({
  value,
  className,
}: {
  value: Sensitivity;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("capitalize", SENSITIVITY_CLASS[value], className)}
    >
      {value}
    </Badge>
  );
}

/**
 * `last_reviewed_at`. A null is not styled as an alarm because we decided it
 * is bad — it is styled loudly because it is the one column a reader would
 * otherwise scan straight past, and the whole point of this screen is that it
 * is inspectable.
 */
export function ReviewCell({
  value,
  className,
}: {
  value: string | null;
  className?: string;
}) {
  const formatted = formatDate(value);
  if (formatted) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>
        {formatted}
      </span>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-alert/50 bg-alert/10 font-semibold text-alert",
        className,
      )}
    >
      Never reviewed
    </Badge>
  );
}

/** Section heading with an optional one-line note about what the rows are. */
export function SectionHeader({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {note && (
          <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/** Monospace identifier — makes it obvious these are database rows. */
export function RowId({ id }: { id: string }) {
  return (
    <span className="font-mono text-[0.6875rem] text-muted-foreground">
      {id}
    </span>
  );
}
