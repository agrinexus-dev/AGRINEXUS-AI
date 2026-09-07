import { AdaptiveWorkspaceProvider } from "@/lib/workspace/workspace-context";

import { FullscreenOverlay } from "./fullscreen-overlay";
import { WorkspaceGrid } from "./workspace-grid";
import { WorkspaceToolbar } from "./workspace-toolbar";

/**
 * The Adaptive Workspace Engine's mount point: generic widget-grid
 * infrastructure that any future workspace (Command Center, Digital Twin,
 * AURA,...) will render its real widgets through. Everything rendered here
 * today is a registry placeholder — see `lib/workspace/registry.ts`.
 */
export function AdaptiveWorkspace() {
  return (
    <AdaptiveWorkspaceProvider>
      <div className="flex flex-col gap-4">
        <WorkspaceToolbar />
        <WorkspaceGrid />
        <FullscreenOverlay />
      </div>
    </AdaptiveWorkspaceProvider>
  );
}
