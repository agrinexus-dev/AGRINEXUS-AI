import { Card, CardContent, CardHeader, Typography } from "@agrinexus/ui";

import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-1 text-center">
          <Typography as="span" variant="h2">
            AgriNexus
          </Typography>
          <Typography variant="small" className="text-foreground-subtle">
            Smart Farm Platform
          </Typography>
        </div>

        <Card>
          <CardHeader>
            <Typography variant="h4">Welcome back</Typography>
            <Typography variant="small" className="text-foreground-muted">
              Enter your credentials to continue.
            </Typography>
          </CardHeader>
          <CardContent>
            <LoginForm callbackUrl={callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : undefined} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
