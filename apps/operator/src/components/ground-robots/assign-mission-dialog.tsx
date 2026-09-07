"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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

import { farmPlots } from "@/components/digital-twin/scene/farm-data";
import { useRobotStore } from "@/lib/robots/robot-store";
import type { RobotRecord } from "@/lib/robots/types";

const NO_PLOT_VALUE = "none";

const assignMissionSchema = z.object({
  label: z.string().min(1, "Mission label is required"),
  targetPlotId: z.string(),
});

type AssignMissionFormValues = z.infer<typeof assignMissionSchema>;

/**
 * The "Assign Mission" action from the RIGHT PANEL — Robot Details (Prompt
 * 015A). Deliberately lightweight (a label + an optional target plot, not a
 * full flight-path/waypoint plan): ground robot missions reuse the Robot
 * Store's own `assignMission`, never `lib/missions/mission-store.ts` (explicit
 * DO-NOT-MODIFY this change — see that store's own doc comment for why.
 */
export function AssignMissionDialog({
  robot,
  open,
  onOpenChange,
}: {
  robot: RobotRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AssignMissionFormValues>({
    resolver: zodResolver(assignMissionSchema),
    defaultValues: { label: "", targetPlotId: NO_PLOT_VALUE },
  });

  const onSubmit = handleSubmit((values) => {
    if (!robot) return;
    useRobotStore.getState().assignMission(robot.id, {
      label: values.label,
      targetPlotId: values.targetPlotId === NO_PLOT_VALUE ? null : values.targetPlotId,
    });
    reset({ label: "", targetPlotId: NO_PLOT_VALUE });
    onOpenChange(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset({ label: "", targetPlotId: NO_PLOT_VALUE });
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Mission</DialogTitle>
          <DialogDescription>{robot ? `Dispatch ${robot.name} on a task.` : "Dispatch this robot on a task."}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Mission Label</label>
            <Input placeholder="Weed Treatment — East Field" {...register("label")} />
            {errors.label ? <p className="text-sm text-critical">{errors.label.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Target Plot</label>
            <Controller
              control={control}
              name="targetPlotId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PLOT_VALUE}>No specific plot</SelectItem>
                    {farmPlots.map((plot) => (
                      <SelectItem key={plot.id} value={plot.id}>
                        {plot.label}
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
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
