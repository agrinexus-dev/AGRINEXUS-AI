import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @agrinexus/ui ships raw TypeScript source (no build step), so Next must
  // transpile it as part of this app's own build rather than treating it as
  // a pre-compiled dependency. Resolution of @agrinexus/ui's internal `@/*`
  // imports (e.g. `@/lib/utils`) is handled by the fallback entry in this
  // app's tsconfig.json `paths`, which both `tsc` and Turbopack read.
  transpilePackages: ["@agrinexus/ui"],
};

export default nextConfig;
