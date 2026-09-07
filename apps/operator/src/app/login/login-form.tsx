"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button, Checkbox, Divider, IconButton, Input, Typography } from "@agrinexus/ui";

import { getDefaultLandingPath } from "@/lib/auth/roles";
import type { AppSessionUser } from "@/lib/auth/types";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean(),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember: false },
  });

  const remember = watch("remember");

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      remember: values.remember ? "true" : "false",
      redirect: false,
    });

    if (!result || result.error) {
      setFormError("Invalid email or password.");
      return;
    }

    // Part 5/10 — an explicit callbackUrl (a deep link that redirected here
    // through the login gate) always wins; otherwise land on the profile's
    // own default role's section. Reads the just-established session
    // directly rather than trusting any client-side role state.
    if (callbackUrl) {
      router.push(callbackUrl);
    } else {
      const session = await getSession();
      const role = (session?.user as AppSessionUser | undefined)?.role;
      router.push(role ? getDefaultLandingPath(role) : "/");
    }
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@agrinexus.ai"
          leadingIcon={<Mail />}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <Typography id="email-error" variant="small" className="text-critical">
            {errors.email.message}
          </Typography>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <Button type="button" intent="ghost" size="sm" disabled aria-disabled="true" className="h-auto px-1.5 py-0.5 text-xs">
            Forgot password?
          </Button>
        </div>
        <div className="relative flex items-center">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            leadingIcon={<Lock />}
            className="pr-9"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          <IconButton
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            icon={showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            intent="ghost"
            size="sm"
            className="absolute right-1"
            onClick={() => setShowPassword((value) => !value)}
          />
        </div>
        {errors.password ? (
          <Typography id="password-error" variant="small" className="text-critical">
            {errors.password.message}
          </Typography>
        ) : null}
      </div>

      <label className="flex items-center gap-2">
        <Checkbox
          checked={remember}
          onCheckedChange={(checked) => setValue("remember", checked === true)}
        />
        <Typography variant="small" className="select-none text-foreground-muted">
          Remember me
        </Typography>
      </label>

      {formError ? (
        <Typography variant="small" role="alert" className="text-critical">
          {formError}
        </Typography>
      ) : null}

      <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
        Sign In
      </Button>

      <Divider />

      <Typography variant="small" className="text-center text-foreground-subtle">
        Access is provisioned by your administrator. There is no self-service registration.
      </Typography>
    </form>
  );
}
