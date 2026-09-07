"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import { GRID_COLUMNS } from "@/lib/workspace/layout";
import { widgetRegistry } from "@/lib/workspace/registry";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import type { WidgetId } from "@/lib/workspace/types";

import { WidgetCard } from "./widget-card";

export function WorkspaceGrid() {
  const { visibleOrder, reorder } = useWorkspace();
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnUnitPx, setColumnUnitPx] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setColumnUnitPx(entry.contentRect.width / GRID_COLUMNS);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorder(active.id as WidgetId, over.id as WidgetId);
    }
  }

  return (
    <DndContext
      id="workspace-grid"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={visibleOrder} strategy={rectSortingStrategy}>
        {/* `auto-rows-[88px]` must stay in sync with `GRID_ROW_UNIT_PX` in lib/workspace/layout.ts. */}
        <div
          ref={containerRef}
          className="grid auto-rows-[88px] grid-cols-1 gap-4 sm:grid-cols-6 lg:grid-cols-12"
        >
          {visibleOrder.map((id) => {
            const definition = widgetRegistry[id];
            return <WidgetCard key={id} id={id} title={definition.title} icon={definition.icon} columnUnitPx={columnUnitPx} />;
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
