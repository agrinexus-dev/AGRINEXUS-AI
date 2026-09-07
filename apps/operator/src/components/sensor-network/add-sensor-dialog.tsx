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
import { usePlots, usePlotStore } from "@/lib/plots/plot-store";
import { useSensorStore } from "@/lib/sensors/sensor-store";
import { SENSOR_TYPE_LABELS, SENSOR_TYPES } from "@/lib/sensors/types";

const NO_PLOT_VALUE = "none";

const addSensorSchema = z.object({
  name: z.string().min(1, "Sensor name is required"),
  sensorType: z.enum(SENSOR_TYPES as [string, ...string[]]),
  serialNumber: z.string().min(1, "Serial number is required"),
  locationX: z.coerce.number(),
  locationZ: z.coerce.number(),
  assignedPlotId: z.string(),
  communicationType: z.enum(COMMUNICATION_TYPES as [string, ...string[]]),
  batteryCapacityMah: z.coerce.number().positive("Must be a positive number"),
  samplingIntervalSeconds: z.coerce.number().positive("Must be a positive number"),
  gateway: z.string().min(1, "Gateway is required"),
  notes: z.string(),
  batteryPowered: z.boolean(),
  gatewayConnected: z.boolean(),
});

type AddSensorFormInput = z.input<typeof addSensorSchema>;
type AddSensorFormOutput = z.output<typeof addSensorSchema>;

const DEFAULT_VALUES: AddSensorFormInput = {
  name: "",
  sensorType: "soil-moisture",
  serialNumber: "",
  locationX: 0,
  locationZ: 0,
  assignedPlotId: NO_PLOT_VALUE,
  communicationType: "radio",
  batteryCapacityMah: 3400,
  samplingIntervalSeconds: 60,
  gateway: "Gateway 1",
  notes: "",
  batteryPowered: true,
  gatewayConnected: true,
};

/**
 * "Add Sensor" — mirrors `AddRobotDialog`/`AddDroneDialog`
 * field-for-field where the concept overlaps. `onSubmit` now awaits the
 * Sensor Store's `addSensor` (that store action itself calls
 * `POST /api/sensors` and only resolves once the database row genuinely
 * exists), so this dialog never closes on a failed create — the EXISTING
 * `isSubmitting` state (from `useForm`, already wired to the submit
 * button's `loading` prop) now honestly reflects real network time, and a
 * failed create surfaces as a real, visible form error instead of the
 * dialog quietly closing over nothing.
 */
export function AddSensorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const plots = usePlots();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddSensorFormInput, unknown, AddSensorFormOutput>({
    resolver: zodResolver(addSensorSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (open) {
      reset(DEFAULT_VALUES);
      setSubmitError(null);
      // Real farm-scoped Plot data, same store/API
      // `analytics-page.tsx`/`reports-page.tsx`/`digital-twin-page.tsx`
      // already hydrate from — never a second, hardcoded plot list.
      void usePlotStore.getState().fetchPlots();
    }
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await useSensorStore.getState().addSensor({
        name: values.name,
        sensorType: values.sensorType as (typeof SENSOR_TYPES)[number],
        serialNumber: values.serialNumber,
        position: [values.locationX, values.locationZ],
        assignedPlotId: values.assignedPlotId === NO_PLOT_VALUE ? null : values.assignedPlotId,
        communicationType: values.communicationType as (typeof COMMUNICATION_TYPES)[number],
        batteryCapacityMah: values.batteryCapacityMah,
        samplingIntervalSeconds: values.samplingIntervalSeconds,
        gateway: values.gateway,
        notes: values.notes,
        batteryPowered: values.batteryPowered,
        gatewayConnected: values.gatewayConnected,
      });
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Couldn't create this sensor — please try again.");
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Sensor</DialogTitle>
          <DialogDescription>
            New sensors appear instantly in the Sensor Network, the Digital Twin, and AURA — no page refresh needed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
          <Field label="Sensor Name" error={errors.name?.message}>
            <Input placeholder="Plot B Soil Moisture" {...register("name")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Sensor Type" error={errors.sensorType?.message}>
              <Controller
                control={control}
                name="sensorType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SENSOR_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {SENSOR_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Serial Number" error={errors.serialNumber?.message}>
              <Input placeholder="SN-0007" {...register("serialNumber")} />
            </Field>
          </div>

          <Field label="Location (X / Z)" error={errors.locationX?.message ?? errors.locationZ?.message}>
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" step="any" aria-label="Location X" {...register("locationX")} />
              <Input type="number" step="any" aria-label="Location Z" {...register("locationZ")} />
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Assigned Plot" error={errors.assignedPlotId?.message}>
              <Controller
                control={control}
                name="assignedPlotId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PLOT_VALUE}>Unassigned</SelectItem>
                      {plots.map((plot) => (
                        <SelectItem key={plot.id} value={plot.id}>
                          {plot.label}
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Battery Capacity (mAh)" error={errors.batteryCapacityMah?.message}>
              <Input type="number" min={0} {...register("batteryCapacityMah")} />
            </Field>
            <Field label="Sampling Interval (s)" error={errors.samplingIntervalSeconds?.message}>
              <Input type="number" min={0} {...register("samplingIntervalSeconds")} />
            </Field>
          </div>

          <Field label="Gateway" error={errors.gateway?.message}>
            <Input placeholder="Gateway 1" {...register("gateway")} />
          </Field>

          <div className="flex items-center gap-5">
            <Controller
              control={control}
              name="batteryPowered"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                  Battery Powered
                </label>
              )}
            />
            <Controller
              control={control}
              name="gatewayConnected"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                  Gateway Connected
                </label>
              )}
            />
          </div>

          <Field label="Notes" error={errors.notes?.message}>
            <Textarea placeholder="Optional notes about this sensor's role or placement" {...register("notes")} />
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
            Add Sensor
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
