"use client";

import { Boxes, Plus, Route, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button, Card, CardContent } from "@agrinexus/ui";

export function QuickActions({ onAddDrone }: { onAddDrone: () => void }) {
  const router = useRouter();

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2 p-4">
        <Button intent="primary" leadingIcon={<Plus />} onClick={onAddDrone}>
          Add Drone
        </Button>
        <Button intent="secondary" leadingIcon={<Route />} onClick={() => router.push("/drone-fleet/missions")}>
          Mission Planner
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
