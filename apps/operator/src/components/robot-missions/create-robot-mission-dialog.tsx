"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agrinexus/ui";

import type { FarmPlotDefinition } from "@/components/digital-twin/scene/farm-data";
import { ROBOT_MISSION_CAPABILITIES, getRobotMissionCapability } from "@/lib/robot-missions/robot-mission-capabilities";
import { useRobotMissionStore } from "@/lib/robot-missions/robot-mission-store";
import type { RobotMissionType } from "@/lib/robot-missions/types";

import { RobotCapabilityBreakdown } from "./robot-capability-breakdown";

const CURATED_TYPES = ROBOT_MISSION_CAPABILITIES.map((entry) => entry.type);

const schema = z.object({
  name: z.string().min(1, "Mission name is required"),
  missionType: z.enum(CURATED_TYPES as [RobotMissionType, ...RobotMissionType[]]),
});

type FormValues = z.infer<typeof schema>;

export interface CreateRobotMissionDialogProps {
  plot: FarmPlotDefinition | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (missionId: string) => void;
}

/** Step 2 of the prompt's own flow — "Select Plot → Create Robot Mission → Assign Robot → Generate Ground Route" — opened by the Robot Mission Planner viewport right after a plot click. Mirrors `CreateMissionDialog` (drones). */
export function CreateRobotMissionDialog({ plot, onOpenChange, onCreated }: CreateRobotMissionDialogProps) {
  const defaultValues: FormValues = { name: plot ? `${plot.label} Inspection` : "New Robot Mission", missionType: "crop-inspection" };

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues });

  useEffect(() => {
    if (plot) reset({ name: `${plot.label} Inspection`, missionType: "crop-inspection" });
  }, [plot, reset]);

  const onSubmit = handleSubmit((values) => {
    if (!plot) return;
    const mission = useRobotMissionStore.getState().createMission({
      name: values.name,
      missionType: values.missionType as RobotMissionType,
      targetPlotId: plot.id,
    });
    onCreated(mission.id);
    onOpenChange(false);
  });

  return (
    <Dialog open={plot !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Robot Mission</DialogTitle>
          <DialogDescription>{plot ? `Target plot: ${plot.label}` : ""}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Mission Name</label>
            <Input {...register("name")} />
            {errors.name ? <p className="text-sm text-critical">{errors.name.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Mission Type</label>
            <Controller
              control={control}
              name="missionType"
              render={({ field }) => {
                const capability = getRobotMissionCapability(field.value as RobotMissionType);
                return (
                  <>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROBOT_MISSION_CAPABILITIES.map((entry) => (
                          <SelectItem key={entry.type} value={entry.type}>
                            {entry.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* The explicit Detects/Can Resolve/
                        Robot Action breakdown, sourced from
                        `ROBOT_MISSION_CAPABILITIES` (never invented text)
                        so the operator understands exactly what this
                        mission type will find and fix BEFORE launching it,
                        not just a one-line label. */}
                    {capability ? <RobotCapabilityBreakdown capability={capability} /> : null}
                  </>
                );
              }}
            />
          </div>
        </form>

        <DialogFooter>
          <Button intent="ghost" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button intent="primary" onClick={onSubmit} loading={isSubmitting}>
            Create Mission
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
