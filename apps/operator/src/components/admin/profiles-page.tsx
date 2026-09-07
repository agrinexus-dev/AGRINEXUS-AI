"use client";

import { useEffect, useState } from "react";
import { Plus, ShieldAlert, UserCog } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Typography,
} from "@agrinexus/ui";

import { ROLES, type Role } from "@/lib/auth/roles";

interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  roles: Role[];
  status: "active" | "disabled";
  createdAt: string;
  farms: { id: string; name: string }[];
}

interface Farm {
  id: string;
  name: string;
}

interface ProfileFormState {
  name: string;
  email: string;
  password: string;
  roles: Role[];
  defaultRole: Role;
  farmId: string | null;
  status: "active" | "disabled";
}

const EMPTY_FORM: ProfileFormState = {
  name: "",
  email: "",
  password: "",
  roles: [],
  defaultRole: "farmer",
  farmId: null,
  status: "active",
};

/**
 * The Admin profile-management foundation: list, create,
 * and edit profiles (name/roles/farm assignment/active-disabled), backed by
 * `/api/admin/users`. Deliberately no pagination/search/bulk actions — "a
 * clean foundation that can be expanded later", not a full admin console.
 */
export function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/admin/users");
      if (!response.ok) throw new Error("Failed to load profiles.");
      const data = (await response.json()) as { profiles: Profile[]; farms: Farm[] };
      setProfiles(data.profiles);
      setFarms(data.farms);
    } catch {
      setLoadError("Couldn't load profiles. Try refreshing the page.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setSubmitError(null);
    setDialogMode("create");
  }

  function openEdit(profile: Profile) {
    setForm({
      name: profile.name,
      email: profile.email,
      password: "",
      roles: profile.roles,
      defaultRole: profile.role,
      farmId: profile.farms[0]?.id ?? null,
      status: profile.status,
    });
    setEditingId(profile.id);
    setSubmitError(null);
    setDialogMode("edit");
  }

  function toggleRole(role: Role) {
    setForm((current) => {
      const has = current.roles.includes(role);
      const roles = has ? current.roles.filter((r) => r !== role) : [...current.roles, role];
      const defaultRole = roles.includes(current.defaultRole) ? current.defaultRole : (roles[0] ?? current.defaultRole);
      return { ...current, roles, defaultRole, farmId: roles.includes("farmer") ? current.farmId : null };
    });
  }

  async function submit() {
    setSubmitError(null);
    if (form.roles.length === 0) {
      setSubmitError("Select at least one role.");
      return;
    }
    setSubmitting(true);
    try {
      if (dialogMode === "create") {
        const response = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            password: form.password,
            roles: form.roles,
            defaultRole: form.defaultRole,
            farmId: form.farmId,
          }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Couldn't create profile.");
        }
      } else if (dialogMode === "edit" && editingId) {
        const response = await fetch(`/api/admin/users/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            roles: form.roles,
            defaultRole: form.defaultRole,
            farmId: form.farmId,
            status: form.status,
            ...(form.password ? { password: form.password } : {}),
          }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Couldn't update profile.");
        }
      }
      setDialogMode(null);
      await load();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Typography variant="h2">Profiles</Typography>
          <Typography variant="small" className="text-foreground-subtle">
            Create and manage Farmer, Operator, and Admin accounts.
          </Typography>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          Create profile
        </Button>
      </div>

      {loadError ? (
        <EmptyState icon={<ShieldAlert />} title="Couldn't load profiles" description={loadError} />
      ) : profiles === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : profiles.length === 0 ? (
        <EmptyState icon={<UserCog />} title="No profiles yet" description="Create the first profile to get started." />
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => openEdit(profile)}
                // UI-UPGRADE.3 — was `bg-white/[var(--opacity-hover)]`; see `sensor-table.tsx`'s identical fix.
                className="flex items-center justify-between gap-4 px-4 py-3 text-left transition-colors duration-(--duration-fast) ease-standard hover:bg-foreground/[var(--opacity-hover)]"
              >
                <div>
                  <Typography variant="small" className="font-medium text-foreground">
                    {profile.name}
                  </Typography>
                  <Typography variant="small" className="text-foreground-subtle">
                    {profile.email}
                    {profile.farms.length > 0 ? ` · ${profile.farms.map((farm) => farm.name).join(", ")}` : ""}
                  </Typography>
                </div>
                <div className="flex items-center gap-2">
                  {profile.roles.map((role) => (
                    <Badge key={role} intent={role === profile.role ? "accent" : "outline"} className="capitalize">
                      {role}
                    </Badge>
                  ))}
                  <Badge intent={profile.status === "active" ? "success" : "outline"} className="capitalize">
                    {profile.status}
                  </Badge>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Create profile" : "Edit profile"}</DialogTitle>
            <DialogDescription>
              {dialogMode === "create"
                ? "Set the profile's roles and, if Farmer is assigned, which farm they can access."
                : "Update this profile's roles, farm assignment, or status."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input value={form.name} onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))} />
            </div>

            {dialogMode === "create" ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Email</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))}
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                {dialogMode === "create" ? "Password" : "Reset password (optional)"}
              </label>
              <Input
                type="password"
                placeholder={dialogMode === "create" ? undefined : "Leave blank to keep the current password"}
                value={form.password}
                onChange={(event) => setForm((f) => ({ ...f, password: event.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Roles</span>
              <div className="flex flex-col gap-2">
                {ROLES.map((role) => (
                  <label key={role} className="flex items-center gap-2 capitalize">
                    <Checkbox checked={form.roles.includes(role)} onCheckedChange={() => toggleRole(role)} />
                    {role}
                  </label>
                ))}
              </div>
            </div>

            {form.roles.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Default landing role</label>
                <Select value={form.defaultRole} onValueChange={(value) => setForm((f) => ({ ...f, defaultRole: value as Role }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {form.roles.map((role) => (
                      <SelectItem key={role} value={role} className="capitalize">
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {form.roles.includes("farmer") ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Farm</label>
                <Select value={form.farmId ?? ""} onValueChange={(value) => setForm((f) => ({ ...f, farmId: value || null }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a farm" />
                  </SelectTrigger>
                  <SelectContent>
                    {farms.map((farm) => (
                      <SelectItem key={farm.id} value={farm.id}>
                        {farm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {dialogMode === "edit" ? (
              <label className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">Active</span>
                <Switch
                  checked={form.status === "active"}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, status: checked ? "active" : "disabled" }))}
                />
              </label>
            ) : null}

            {submitError ? (
              <Typography variant="small" role="alert" className="text-critical">
                {submitError}
              </Typography>
            ) : null}
          </div>

          <DialogFooter>
            <Button intent="ghost" onClick={() => setDialogMode(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} loading={submitting}>
              {dialogMode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
