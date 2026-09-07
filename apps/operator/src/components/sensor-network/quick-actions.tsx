"use client";

import { BarChart3, Boxes, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button, Card, CardContent } from "@agrinexus/ui";

export function QuickActions({ onAddSensor }: { onAddSensor: () => void }) {
  const router = useRouter();

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2 p-4">
        <Button intent="primary" leadingIcon={<Plus />} onClick={onAddSensor}>
          Add Sensor
        </Button>
        <Button intent="secondary" leadingIcon={<BarChart3 />} onClick={() => router.push("/sensor-network/analytics")}>
          Analytics
        </Button>
        <Button intent="secondary" leadingIcon={<Boxes />} onClick={() => router.push("/digital-twin")}>
          Open Digital Twin
        </Button>
        <Button intent="ghost" leadingIcon={<Sparkles />} onClick={() => router.push("/")}>
          Open Mission Control
        </Button>
      </CardContent>
    </Card>
  );
}
