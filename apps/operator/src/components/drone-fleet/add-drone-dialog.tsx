"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
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
  Textarea,
  Typography,
} from "@agrinexus/ui";

import {
  CAMERA_TYPE_LABELS,
  CAMERA_TYPES,
  COMMUNICATION_TYPE_LABELS,
  COMMUNICATION_TYPES,
  DRONE_TYPE_LABELS,
  DRONE_TYPES,
} from "@/lib/fleet/types";
import { useFleetStore } from "@/lib/fleet/fleet-store";

const addDroneSchema = z.object({
  name: z.string().min(1, "Drone name is required"),
  model: z.string().min(1, "Model is required"),
  serialNumber: z.string().min(1, "Serial number is required"),
  droneType: z.enum(DRONE_TYPES as [string, ...string[]]),
  cameraType: z.enum(CAMERA_TYPES as [string, ...string[]]),
  batteryCapacityMah: z.coerce.number().positive("Must be a positive number"),
  maxFlightTimeMinutes: z.coerce.number().positive("Must be a positive number"),
  communicationType: z.enum(COMMUNICATION_TYPES as [string, ...string[]]),
  firmwareVersion: z.string().min(1, "Firmware version is required"),
  homeLocationX: z.coerce.number(),
  homeLocationZ: z.coerce.number(),
  color: z.string().min(1, "Pick a color"),
  notes: z.string(),
});

type AddDroneFormInput = z.input<typeof addDroneSchema>;
type AddDroneFormOutput = z.output<typeof addDroneSchema>;

const DEFAULT_VALUES: AddDroneFormInput = {
  name: "",
  model: "",
  serialNumber: "",
  droneType: "quadcopter",
  cameraType: "rgb",
  batteryCapacityMah: 5200,
  maxFlightTimeMinutes: 25,
  communicationType: "radio",
  firmwareVersion: "1.0.0",
  homeLocationX: 0,
  homeLocationZ: 0,
  color: "#4fd1c5",
  notes: "",
};

export function AddDroneDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddDroneFormInput, unknown, AddDroneFormOutput>({
    resolver: zodResolver(addDroneSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (open) {
      reset(DEFAULT_VALUES);
      setSubmitError(null);
    }
  }, [open, reset]);

  // Awaits the Fleet Store's `addDrone` (that store action
  // itself calls `POST /api/drones` and only resolves once the database row
  // genuinely exists), mirroring `AddSensorDialog`'s own doc comment: this
  // dialog never closes on a failed create.
  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await useFleetStore.getState().addDrone({
        name: values.name,
        model: values.model,
        serialNumber: values.serialNumber,
        droneType: values.droneType as (typeof DRONE_TYPES)[number],
        cameraType: values.cameraType as (typeof CAMERA_TYPES)[number],
        batteryCapacityMah: values.batteryCapacityMah,
        maxFlightTimeMinutes: values.maxFlightTimeMinutes,
        communicationType: values.communicationType as (typeof COMMUNICATION_TYPES)[number],
        firmwareVersion: values.firmwareVersion,
        homeLocation: [values.homeLocationX, values.homeLocationZ],
        color: values.color,
        notes: values.notes,
      });
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Couldn't create this drone — please try again.");
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Drone</DialogTitle>
          <DialogDescription>
            New drones appear instantly in the Fleet table, the Digital Twin, and AURA — no page refresh needed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
          <Field label="Drone Name" error={errors.name?.message}>
            <Input placeholder="Drone Echo" {...register("name")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Model" error={errors.model?.message}>
              <Input placeholder="AgriNexus AX-100" {...register("model")} />
            </Field>
            <Field label="Serial Number" error={errors.serialNumber?.message}>
              <Input placeholder="AX100-0005" {...register("serialNumber")} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Drone Type" error={errors.droneType?.message}>
              <Controller
                control={control}
                name="droneType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DRONE_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {DRONE_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Camera Type" error={errors.cameraType?.message}>
              <Controller
                control={control}
                name="cameraType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMERA_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {CAMERA_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Battery Capacity (mAh)" error={errors.batteryCapacityMah?.message}>
              <Input type="number" min={0} {...register("batteryCapacityMah")} />
            </Field>
            <Field label="Max Flight Time (min)" error={errors.maxFlightTimeMinutes?.message}>
              <Input type="number" min={0} {...register("maxFlightTimeMinutes")} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            <Field label="Firmware Version" error={errors.firmwareVersion?.message}>
              <Input placeholder="2.4.1" {...register("firmwareVersion")} />
            </Field>
          </div>

          <Field label="Home Location (X / Z)" error={errors.homeLocationX?.message ?? errors.homeLocationZ?.message}>
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" step="any" aria-label="Home Location X" {...register("homeLocationX")} />
              <Input type="number" step="any" aria-label="Home Location Z" {...register("homeLocationZ")} />
            </div>
          </Field>

          <Field label="Drone Color" error={errors.color?.message}>
            <input
              type="color"
              className="h-9 w-full cursor-pointer rounded-md border border-border bg-surface"
              {...register("color")}
            />
          </Field>

          <Field label="Notes" error={errors.notes?.message}>
            <Textarea placeholder="Optional notes about this drone's role or assignment" {...register("notes")} />
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
            Add Drone
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
