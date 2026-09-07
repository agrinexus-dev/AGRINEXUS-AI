import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "../foundation/Card";
import { Typography } from "../foundation/Typography";

export interface WeatherMetric {
  label: string;
  value: string;
}

export interface WeatherCardProps {
  condition: string;
  temperature: string | number;
  unit?: string;
  icon?: ReactNode;
  metrics?: WeatherMetric[];
  className?: string;
}

export function WeatherCard({ condition, temperature, unit = "°", icon, metrics, className }: WeatherCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <Typography variant="caption">{condition}</Typography>
        {icon ? (
          <span className="flex text-foreground-muted [&_svg]:size-5" aria-hidden>
            {icon}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <span className="font-mono text-3xl font-semibold text-foreground">
          {temperature}
          <span className="ml-0.5 text-lg font-medium text-foreground-muted">{unit}</span>
        </span>
        {metrics && metrics.length > 0 ? (
          <div className="flex items-center gap-4 border-t border-border-subtle pt-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="flex flex-col gap-0.5">
                <Typography variant="caption">{metric.label}</Typography>
                <Typography variant="small" className="text-foreground">
                  {metric.value}
                </Typography>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
