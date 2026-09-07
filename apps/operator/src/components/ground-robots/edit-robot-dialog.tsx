"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import {
  Button,
  Checkbox,
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
  Textarea,
  Typography,
} from "@agrinexus/ui";

import { COMMUNICATION_TYPE_LABELS, COMMUNICATION_TYPES } from "@/lib/fleet/types";
import { useRobotStore } from "@/lib/robots/robot-store";
import { ROBOT_TYPE_LABELS, ROBOT_TYPES, type RobotRecord } from "@/lib/robots/types";

const editRobotSchema = z.object({
  name: z.string().min(1, "Robot name is required"),
  model: z.string().min(1, "Model is required"),
  manufacturer: z.string().min(1, "Manufacturer is required"),
  robotType: z.enum(ROBOT_TYPES as [string, ...string[]]),
  maxSpeedMps: z.coerce.number().positive("Must be a positive number"),
  batteryCapacityMah: z.coerce.number().positive("Must be a positive number"),
  maxRuntimeMinutes: z.coerce.number().positive("Must be a positive number"),
  communicationType: z.enum(COMMUNICATION_TYPES as [string, ...string[]]),
  homePositionX: z.coerce.number().finite("Must be a valid number"),
  homePositionZ: z.coerce.number().finite("Must be a valid number"),
  color: z.string().min(1, "Pick a color"),
  notes: z.string(),
  camera: z.boolean(),
  lidar: z.boolean(),
  sprayer: z.boolean(),
  seeder: z.boolean(),
  fertilizer: z.boolean(),
  aiEnabled: z.boolean(),
});

type EditRobotFormInput = z.input<typeof editRobotSchema>;
type EditRobotFormOutput = z.output<typeof editRobotSchema>;

function valuesFromRobot(robot: RobotRecord): EditRobotFormInput {
  return {
    name: robot.name,
    model: robot.model,
    manufacturer: robot.manufacturer,
    robotType: robot.robotType,
    maxSpeedMps: robot.maxSpeedMps,
    batteryCapacityMah: robot.batteryCapacityMah,
    maxRuntimeMinutes: robot.maxRuntimeMinutes,
    communicationType: robot.communicationType,
    homePositionX: robot.homePosition[0],
    homePositionZ: robot.homePosition[1],
    color: robot.color,
    notes: robot.notes,
    camera: robot.capabilities.camera,
    lidar: robot.capabilities.lidar,
    sprayer: robot.capabilities.sprayer,
    seeder: robot.capabilities.seeder,
    fertilizer: robot.capabilities.fertilizer,
    aiEnabled: robot.capabilities.aiEnabled,
  };
}

/**
 * "Edit Robot" — same field set and layout as
 * `AddRobotDialog` (identity/config fields, including Home Position — the
 * fix for the overlapping-(0,0)-robots bug), pre-filled from the
 * currently selected robot and submitting through the Robot Store's new
 * `updateRobot` action (a real, awaited `PATCH /api/robots/:id`) instead of
 * `addRobot`. Never closes on a failed save — same honesty rule
 * `AddRobotDialog`'s own doc comment documents.
 */
export function EditRobotDialog({
  robot,
  open,
  onOpenChange,
}: {
  robot: RobotRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditRobotFormInput, unknown, EditRobotFormOutput>({
    resolver: zodResolver(editRobotSchema),
    defaultValues: valuesFromRobot(robot),
  });

  useEffect(() => {
    if (open) {
      reset(valuesFromRobot(robot));
      setSubmitError(null);
    }
    // Only re-derive defaults when the dialog opens (or a different robot's
    // dialog opens) — not on every live telemetry tick to `robot`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, robot.id, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await useRobotStore.getState().updateRobot(robot.id, {
        name: values.name,
        model: values.model,
        manufacturer: values.manufacturer,
        robotType: values.robotType as (typeof ROBOT_TYPES)[number],
        color: values.color,
        maxSpeedMps: values.maxSpeedMps,
        batteryCapacityMah: values.batteryCapacityMah,
        maxRuntimeMinutes: values.maxRuntimeMinutes,
        communicationType: values.communicationType as (typeof COMMUNICATION_TYPES)[number],
        homePosition: [values.homePositionX, values.homePositionZ],
        notes: values.notes,
        capabilities: {
          camera: values.camera,
          lidar: values.lidar,
          sprayer: values.sprayer,
          seeder: values.seeder,
          fertilizer: values.fertilizer,
          aiEnabled: values.aiEnabled,
        },
      });
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Couldn't save these changes — please try again.");
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Robot</DialogTitle>
          <DialogDescription>
            Changes apply instantly across the Robot Table, the Digital Twin, and AURA — no page refresh needed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
          <Field label="Robot Name" error={errors.name?.message}>
            <Input placeholder="Robot Charlie" {...register("name")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Model" error={errors.model?.message}>
              <Input placeholder="AgriNexus GX-200" {...register("model")} />
            </Field>
            <Field label="Manufacturer" error={errors.manufacturer?.message}>
              <Input placeholder="AgriNexus Robotics" {...register("manufacturer")} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Robot Type" error={errors.robotType?.message}>
              <Controller
                control={control}
                name="robotType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROBOT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {ROBOT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Communication Type" error={errors.communicationType?.message}>
              <Controller
                control={control}
                name="communicationType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMUNICATION_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {COMMUNICATION_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Max Speed (m/s)" error={errors.maxSpeedMps?.message}>
              <Input type="number" min={0} step="any" {...register("maxSpeedMps")} />
            </Field>
            <Field label="Battery (mAh)" error={errors.batteryCapacityMah?.message}>
              <Input type="number" min={0} {...register("batteryCapacityMah")} />
            </Field>
            <Field label="Max Runtime (min)" error={errors.maxRuntimeMinutes?.message}>
              <Input type="number" min={0} {...register("maxRuntimeMinutes")} />
            </Field>
          </div>

          <Field label="Home Position (X / Z)" error={errors.homePositionX?.message ?? errors.homePositionZ?.message}>
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" step="any" aria-label="Home Position X" {...register("homePositionX")} />
              <Input type="number" step="any" aria-label="Home Position Z" {...register("homePositionZ")} />
            </div>
          </Field>

          <Field label="Robot Color" error={errors.color?.message}>
            <input
              type="color"
              className="h-9 w-full cursor-pointer rounded-md border border-border bg-surface"
              {...register("color")}
            />
          </Field>

          <Field label="Equipment & Capabilities">
            <div className="grid grid-cols-2 gap-2.5">
              <CapabilityCheckbox control={control} name="camera" label="Camera" />
              <CapabilityCheckbox control={control} name="lidar" label="LiDAR" />
              <CapabilityCheckbox control={control} name="sprayer" label="Sprayer" />
              <CapabilityCheckbox control={control} name="seeder" label="Seeder" />
              <CapabilityCheckbox control={control} name="fertilizer" label="Fertilizer" />
              <CapabilityCheckbox control={control} name="aiEnabled" label="Enable AI" />
            </div>
          </Field>

          <Field label="Notes" error={errors.notes?.message}>
            <Textarea placeholder="Optional notes about this robot's role or assignment" {...register("notes")} />
          </Field>
        </form>

        {submitError ? (
          <Typography variant="small" className="text-critical" role="alert">
            {submitError}
          </Typography>
        ) : null}

        <DialogFooter>
          <Button intent="ghost" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button intent="primary" onClick={onSubmit} loading={isSubmitting}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {error ? (
        <Typography variant="small" className="text-critical">
          {error}
        </Typography>
      ) : null}
    </div>
  );
}

function CapabilityCheckbox({
  control,
  name,
  label,
}: {
  control: ReturnType<typeof useForm<EditRobotFormInput, unknown, EditRobotFormOutput>>["control"];
  name: "camera" | "lidar" | "sprayer" | "seeder" | "fertilizer" | "aiEnabled";
  label: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox checked={Boolean(field.value)} onCheckedChange={(checked) => field.onChange(checked === true)} />
          {label}
        </label>
      )}
    />
  );
}
