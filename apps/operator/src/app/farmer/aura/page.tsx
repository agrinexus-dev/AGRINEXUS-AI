import { Suspense } from "react";

import { FarmerAuraPage } from "@/components/farmer/farmer-aura-page";

// `FarmerAuraPage` now reads
// `useSearchParams()` (for `?ask=1`, see that component's own doc comment),
// which Next.js requires a Suspense boundary around to keep this route
// statically prerenderable rather than opting the whole page into
// client-only rendering.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <FarmerAuraPage />
    </Suspense>
  );
}
