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
import { useMissionStore } from "@/lib/missions/mission-store";
import { MISSION_TYPES, MISSION_TYPE_LABELS, type MissionType } from "@/lib/missions/types";

const schema = z.object({
  name: z.string().min(1, "Mission name is required"),
  missionType: z.enum(MISSION_TYPES as [string, ...string[]]),
});

type FormValues = z.infer<typeof schema>;

export interface CreateMissionDialogProps {
  plot: FarmPlotDefinition | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (missionId: string) => void;
}

/** Step 2 of the prompt's own flow — "Click Plot → Create Mission → Mission Marker appears" — opened by the Mission Planner viewport right after a plot click. */
export function CreateMissionDialog({ plot, onOpenChange, onCreated }: CreateMissionDialogProps) {
  const defaultValues: FormValues = { name: plot ? `${plot.label} Survey` : "New Mission", missionType: "survey" };

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues });

  useEffect(() => {
    if (plot) reset({ name: `${plot.label} Survey`, missionType: "survey" });
  }, [plot, reset]);

  const onSubmit = handleSubmit((values) => {
    if (!plot) return;
    const mission = useMissionStore.getState().createMission({
      name: values.name,
      missionType: values.missionType as MissionType,
      targetPlotId: plot.id,
    });
    onCreated(mission.id);
    onOpenChange(false);
  });

  return (
    <Dialog open={plot !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Mission</DialogTitle>
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
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MISSION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {MISSION_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
