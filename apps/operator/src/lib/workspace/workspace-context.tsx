"use client";

import { arrayMove } from "@dnd-kit/sortable";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import { clampSpan, defaultLayoutFor } from "./layout";
import { clearPersistedLayout, loadPersistedLayout, savePersistedLayout } from "./persistence";
import { defaultWidgetOrder, widgetRegistry } from "./registry";
import type { PersistedWorkspaceLayout, WidgetId, WidgetLayoutState, WidgetSizePreset, WidgetSpan } from "./types";

interface WorkspaceState {
  order: WidgetId[];
  widgets: Record<WidgetId, WidgetLayoutState>;
  presentationMode: boolean;
  /** Transient UI state — deliberately not persisted (only position/size/collapsed/hidden are). */
  fullscreenId: WidgetId | null;
}

function buildDefaultState(): WorkspaceState {
  const widgets = {} as Record<WidgetId, WidgetLayoutState>;
  for (const id of defaultWidgetOrder) {
    widgets[id] = defaultLayoutFor(widgetRegistry[id].defaultSize);
  }
  return { order: [...defaultWidgetOrder], widgets, presentationMode: false, fullscreenId: null };
}

type Action =
  | { type: "HYDRATE"; payload: PersistedWorkspaceLayout }
  | { type: "REORDER"; activeId: WidgetId; overId: WidgetId }
  | { type: "SET_PRESET_SIZE"; id: WidgetId; preset: Exclude<WidgetSizePreset, "custom"> }
  | { type: "SET_CUSTOM_SPAN"; id: WidgetId; span: WidgetSpan }
  | { type: "TOGGLE_COLLAPSE"; id: WidgetId }
  | { type: "SET_FULLSCREEN"; id: WidgetId | null }
  | { type: "HIDE"; id: WidgetId }
  | { type: "SHOW"; id: WidgetId }
  | { type: "RESET" }
  | { type: "TOGGLE_PRESENTATION_MODE" };

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case "HYDRATE": {
      const persistedOrder = action.payload.order.filter((id): id is WidgetId => id in widgetRegistry);
      const missing = defaultWidgetOrder.filter((id) => !persistedOrder.includes(id));
      const order = [...persistedOrder, ...missing];

      const widgets = {} as Record<WidgetId, WidgetLayoutState>;
      for (const id of order) {
        const persisted = action.payload.widgets[id];
        widgets[id] = persisted ?? defaultLayoutFor(widgetRegistry[id].defaultSize);
      }
      return { ...state, order, widgets };
    }
    case "REORDER": {
      const oldIndex = state.order.indexOf(action.activeId);
      const newIndex = state.order.indexOf(action.overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return state;
      return { ...state, order: arrayMove(state.order, oldIndex, newIndex) };
    }
    case "SET_PRESET_SIZE": {
      const current = state.widgets[action.id];
      return {
        ...state,
        widgets: { ...state.widgets, [action.id]: { ...current, ...defaultLayoutFor(action.preset), hidden: current.hidden } },
      };
    }
    case "SET_CUSTOM_SPAN": {
      const current = state.widgets[action.id];
      return {
        ...state,
        widgets: {
          ...state.widgets,
          [action.id]: { ...current, size: "custom", span: clampSpan(action.span) },
        },
      };
    }
    case "TOGGLE_COLLAPSE": {
      const current = state.widgets[action.id];
      return {
        ...state,
        widgets: { ...state.widgets, [action.id]: { ...current, collapsed: !current.collapsed } },
      };
    }
    case "SET_FULLSCREEN":
      return { ...state, fullscreenId: action.id };
    case "HIDE": {
      const current = state.widgets[action.id];
      return { ...state, widgets: { ...state.widgets, [action.id]: { ...current, hidden: true } } };
    }
    case "SHOW": {
      const current = state.widgets[action.id];
      return { ...state, widgets: { ...state.widgets, [action.id]: { ...current, hidden: false } } };
    }
    case "RESET":
      return { ...buildDefaultState(), presentationMode: state.presentationMode };
    case "TOGGLE_PRESENTATION_MODE":
      return { ...state, presentationMode: !state.presentationMode, fullscreenId: null };
    default:
      return state;
  }
}

interface WorkspaceContextValue {
  order: WidgetId[];
  visibleOrder: WidgetId[];
  hiddenOrder: WidgetId[];
  widgets: Record<WidgetId, WidgetLayoutState>;
  presentationMode: boolean;
  fullscreenId: WidgetId | null;
  reorder: (activeId: WidgetId, overId: WidgetId) => void;
  setPresetSize: (id: WidgetId, preset: Exclude<WidgetSizePreset, "custom">) => void;
  setCustomSpan: (id: WidgetId, span: WidgetSpan) => void;
  toggleCollapse: (id: WidgetId) => void;
  enterFullscreen: (id: WidgetId) => void;
  exitFullscreen: () => void;
  hide: (id: WidgetId) => void;
  show: (id: WidgetId) => void;
  resetLayout: () => void;
  togglePresentationMode: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const PERSIST_DEBOUNCE_MS = 300;

export function AdaptiveWorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, buildDefaultState);
  const hydratedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // One-time client-side hydration from localStorage, after the SSR-safe default render.
  useEffect(() => {
    const persisted = loadPersistedLayout();
    if (persisted) dispatch({ type: "HYDRATE", payload: persisted });
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      savePersistedLayout({ version: 1, order: state.order, widgets: state.widgets });
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(saveTimeoutRef.current);
  }, [state.order, state.widgets]);

  const visibleOrder = useMemo(() => state.order.filter((id) => !state.widgets[id].hidden), [state.order, state.widgets]);
  const hiddenOrder = useMemo(() => state.order.filter((id) => state.widgets[id].hidden), [state.order, state.widgets]);

  const resetLayout = useCallback(() => {
    clearPersistedLayout();
    dispatch({ type: "RESET" });
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      order: state.order,
      visibleOrder,
      hiddenOrder,
      widgets: state.widgets,
      presentationMode: state.presentationMode,
      fullscreenId: state.fullscreenId,
      reorder: (activeId, overId) => dispatch({ type: "REORDER", activeId, overId }),
      setPresetSize: (id, preset) => dispatch({ type: "SET_PRESET_SIZE", id, preset }),
      setCustomSpan: (id, span) => dispatch({ type: "SET_CUSTOM_SPAN", id, span }),
      toggleCollapse: (id) => dispatch({ type: "TOGGLE_COLLAPSE", id }),
      enterFullscreen: (id) => dispatch({ type: "SET_FULLSCREEN", id }),
      exitFullscreen: () => dispatch({ type: "SET_FULLSCREEN", id: null }),
      hide: (id) => dispatch({ type: "HIDE", id }),
      show: (id) => dispatch({ type: "SHOW", id }),
      resetLayout,
      togglePresentationMode: () => dispatch({ type: "TOGGLE_PRESENTATION_MODE" }),
    }),
    [state, visibleOrder, hiddenOrder, resetLayout],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within an AdaptiveWorkspaceProvider");
  return ctx;
}
