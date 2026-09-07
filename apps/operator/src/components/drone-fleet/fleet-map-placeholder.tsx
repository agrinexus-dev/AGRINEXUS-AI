"use client";

import { Map } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, EmptyState } from "@agrinexus/ui";

/** Honest placeholder — no live GPS/mapping backend exists yet. The Digital Twin already shows real-time drone position on its own MiniMap; this section reserves a layout slot for it without fabricating a map. */
export function FleetMapPlaceholder() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet Map</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState
          icon={<Map />}
          title="Live fleet map coming soon"
          description="Real-time GPS mapping isn't wired up yet — track drone positions in the Digital Twin's mini-map in the meantime."
          className="py-10"
        />
      </CardContent>
    </Card>
  );
}
