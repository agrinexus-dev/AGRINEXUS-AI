import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "../foundation/Card";
import { Typography } from "../foundation/Typography";
import { TrendIndicator, type TrendDirection } from "./shared/trend";

export interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: string;
  deltaDirection?: TrendDirection;
  period?: string;
  /** Optional sparkline or chart slot — this package does not ship a charting library. */
  children?: ReactNode;
  className?: string;
}

export function KpiCard({ label, value, delta, deltaDirection, period, children, className }: KpiCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-2">
        <Typography variant="caption">{label}</Typography>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-2">
          {/*
            MVP-UI.1-B — `<bdi>` (Bidirectional Isolate) is a native HTML
            element built exactly for this: it isolates `value`'s own
            direction from the surrounding paragraph, so a Latin/numeric
            string like "2 of 2" renders correctly left-to-right even
            inside an RTL (Urdu) ancestor, without needing to know or guess
            `value`'s content. Confirmed live bug (MVP-UI.1-A audit §3/§11):
            without this, "2 of 2" rendered as "of 2 2" under `dir="rtl"`.
            Fixes every current and future `KpiCard` consumer at once,
            rather than patching each call site individually.
          */}
          <bdi className="font-mono text-2xl font-semibold text-foreground">{value}</bdi>
          {delta ? (
            <span className="flex items-center gap-1 text-sm text-foreground-muted">
              {deltaDirection ? <TrendIndicator direction={deltaDirection} /> : null}
              <bdi>{delta}</bdi>
              {period ? <span className="text-foreground-subtle">{period}</span> : null}
            </span>
          ) : null}
        </div>
        {children ? <div>{children}</div> : null}
      </CardContent>
    </Card>
  );
}
