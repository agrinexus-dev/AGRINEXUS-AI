"use client";

import { ShieldAlert } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button, EmptyState } from "@agrinexus/ui";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <EmptyState
          icon={<ShieldAlert />}
          title="Access restricted"
          description="Your account does not have a role permitted to access this section of AgriNexus."
          action={
            <Button intent="secondary" onClick={() => void signOut({ callbackUrl: "/login" })}>
              Sign out and return to login
            </Button>
          }
        />
      </div>
    </div>
  );
}
