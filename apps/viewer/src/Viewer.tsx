import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  activeNotation,
  presetLayers,
  type DiagramModel,
  type DiagramPlane,
  type Drawings,
  type LayoutOverlay,
} from '@diagramming/core';
import { applyTheme, DiagramView, isKnownStyle, lightTheme, type LayoutApi } from '@diagramming/renderer';
import { createIconRegistry } from '@diagramming/icons';

const icons = createIconRegistry();

export interface ViewerData {
  model: DiagramModel;
  layout?: LayoutOverlay;
  drawings?: Drawings;
}

interface ExportWindow {
  __DG_READY__?: boolean;
  /** the graph's true extent in flow units — no legend, no padding */
  __DG_BOUNDS__?: { width: number; height: number };
  /** the legend's extent in SCREEN px, which the snapshot must add to the frame
   * at full size. Kept apart from __DG_BOUNDS__ on purpose: the content is
   * scaled to fit the frame and the legend is not, so a reserve folded into the
   * bounds shrinks with the graph and the frame comes out too short. */
  __DG_RESERVE__?: { side: 'top' | 'right' | 'bottom' | 'left'; px: number } | null;
  /** re-fit the graph into the (already resized) frame, padding `pad` px on
   * every side and `pad` + the legend's extent on the legend's side */
  __DG_FIT__?: (pad?: number) => void;
}

/**
 * How much of the frame the legend may claim as `fitView` padding. The reserve is
 * measured in CSS px against the page as it was at handshake time, but the fit
 * runs after the snapshot has resized the window to an aspect-clamped frame
 * (≤1400px tall). A legend taller than that frame would ask fitView to pad away
 * more than the whole viewport, leaving the graph nowhere to go; cap it at half
 * the frame, where the diagram still gets equal billing with its key.
 */
export function legendPadding(px: number, frameHeight: number): number {
  return Math.max(0, Math.min(px, Math.floor(frameHeight / 2)));
}

/** How often the export handshake re-measures the graph while it waits. */
const SETTLE_POLL_MS = 120;
/** How long it waits for a layout before publishing the fallback bounds anyway.
 * Must stay under snapshot.ts's 15s `waitForFunction` timeout, or a slow page
 * fails the export outright instead of exporting a badly framed image. */
const SETTLE_DEADLINE_MS = 10_000;

/**
 * May the export handshake publish the bounds it just measured?
 *
 * Two consecutive agreeing measurements, or the deadline. Both conditions are
 * load-bearing. `contentBounds()` returns undefined until React Flow has nodes,
 * which on a big page happens long after the old fixed 500ms delay — the
 * handshake then published the 1200x800 no-layout fallback, the snapshot sized
 * its frame from that aspect, and the real graph was fitted into the wrong
 * shape. Requiring agreement also covers the subtler case of a layout that has
 * nodes but is still moving them.
 */
export function handshakeReady(
  prev: { width: number; height: number } | undefined,
  next: { width: number; height: number } | undefined,
  elapsedMs: number,
  deadlineMs: number,
): boolean {
  if (elapsedMs >= deadlineMs) return true;
  if (next === undefined) return false;
  return prev !== undefined && prev.width === next.width && prev.height === next.height;
}

/**
 * Which plane the page draws, or undefined for "whatever DiagramView defaults
 * to" (the model's first plane). Export mode ignores the reader's pick: the
 * committed PNG is defined as the first plane, and pages are published with the
 * first plane as the resting view.
 */
export function activePlaneId(
  planes: readonly DiagramPlane[],
  picked: string | undefined,
  expandAll: boolean,
): string | undefined {
  if (expandAll) return undefined;
  // A pick that no longer names a plane (stale state after the model changed)
  // falls back to the default rather than compiling an empty view.
  return planes.some((p) => p.id === picked) ? picked : undefined;
}

/** A picker is only worth its pixels when there is a choice to make. */
export function showsPlanePicker(planes: readonly DiagramPlane[], expandAll: boolean): boolean {
  return !expandAll && planes.length > 1;
}

// Chrome styling, matched to the renderer's own overlays (`.dg-breadcrumbs-nav`
// / `.dg-legend`): the theme's surface tokens, a 6px radius, 12px system-ui.
// Inline rather than a stylesheet because the viewer app carries no CSS of its
// own and the published page is a single inlined file.
const pickerStyle: CSSProperties = {
  position: 'absolute',
  // Top-CENTRE, not a corner: every corner is already spoken for by renderer
  // chrome the published page can show — breadcrumbs top-left once a reader
  // drills in, the zoom/legend controls bottom-left, and the legend in any
  // corner it declares (default bottom-right).
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 10,
  display: 'flex',
  gap: 2,
  alignItems: 'center',
  maxWidth: 'calc(100% - 24px)',
  flexWrap: 'wrap',
  justifyContent: 'center',
  background: 'var(--dg-node-fill)',
  border: '1px solid var(--dg-border)',
  borderRadius: 6,
  boxShadow: '0 1px 3px rgb(0 0 0 / 0.15)',
  padding: '3px 4px',
  font: '400 12px system-ui, sans-serif',
};

const planeButtonStyle = (current: boolean): CSSProperties => ({
  background: current ? 'var(--dg-badge-bg)' : 'none',
  border: 'none',
  borderRadius: 4,
  color: current ? 'var(--dg-text)' : 'var(--dg-text-muted)',
  cursor: current ? 'default' : 'pointer',
  font: 'inherit',
  fontWeight: current ? 600 : 400,
  padding: '2px 8px',
});

/**
 * The published page's plane switcher. Presentational, like the studio's
 * PlaneSwitcher — but with no "Default" chip: a reader of a published page is
 * choosing between the diagram's declared viewpoints, and the base (plane-less)
 * view is an authoring concept.
 */
export function PlanePicker({
  planes,
  active,
  onSelect,
}: {
  planes: readonly DiagramPlane[];
  /** the plane being drawn; undefined means the first one (DiagramView's default) */
  active: string | undefined;
  onSelect: (id: string) => void;
}) {
  const currentId = active ?? planes[0]?.id;
  return (
    <div style={pickerStyle} role="group" aria-label="Plane">
      {planes.map((p) => {
        const current = p.id === currentId;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={current}
            style={planeButtonStyle(current)}
            onClick={() => onSelect(p.id)}
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

export function Viewer({ data, expandAll = false }: { data: ViewerData | null; expandAll?: boolean }) {
  // Export snapshots want a complete overview, so seed every container group as
  // expanded; interactive pages start folded (empty pins) so viewers explore.
  // The one exception is `layout.export.collapsed`: a view too big to unfold
  // (hundreds of leaves) names the groups to keep folded for the image, and
  // those seed as collapsed instead. Folding is deliberate — a folded box still
  // anchors its hidden children's edges, so the relations survive the fold.
  const [pins, setPins] = useState<Record<string, 'expanded' | 'collapsed'>>(() => {
    if (!expandAll || data === null || typeof data !== 'object' || (data as ViewerData).model == null) return {};
    const d = data as ViewerData;
    const folded = new Set(d.layout?.export?.collapsed ?? []);
    return Object.fromEntries(
      [...new Set(d.model.containment.map((c) => c.parent))].map((id) => [
        id,
        folded.has(id) ? ('collapsed' as const) : ('expanded' as const),
      ]),
    );
  });
  const [enteredPath, setEnteredPath] = useState<string[]>([]);
  // The plane the reader picked; undefined until they pick one, so the page
  // opens on the model's first plane (what the PNG shows).
  const [picked, setPicked] = useState<string | undefined>(undefined);
  // The layers the reader has ON. Seeded from the presets of the plane the page
  // opens on, and owned by the reader from then on: a plane's `layers` are a
  // DEFAULT, not a floor the compiler re-imposes (see ViewportState.activeLayers).
  // Export mode never reads this — it passes no `activeLayers` at all, so the PNG
  // compiles straight from the presets, exactly as it did before the toggles.
  const [layers, setLayers] = useState<string[]>(() =>
    data === null || typeof data !== 'object' || (data as ViewerData).model == null
      ? []
      : presetLayers((data as ViewerData).model.planes),
  );
  const apiRef = useRef<LayoutApi | null>(null);

  // The Viewer renders in light mode; publish the light theme's --dg-* tokens so
  // node strokes/fills and the dashed group-container borders resolve. Without
  // this every published page loses those variables (React Flow's colorMode
  // themes React Flow itself, not our tokens), so group boxes render border-less.
  useEffect(() => {
    applyTheme(document.documentElement, lightTheme);
  }, []);

  // Export handshake: once layout has settled, publish the TRUE content bounds
  // (flow coordinates, not a post-fit viewport measurement) and a re-fit hook so
  // the headless snapshot can size its frame to the whole graph and refit into
  // it — otherwise a wide diagram overflows the capture and boxes get clipped.
  // "Settled" is measured, not assumed: the graph is re-measured every
  // SETTLE_POLL_MS until two readings agree (see handshakeReady).
  useEffect(() => {
    if (!expandAll) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    let prev: { width: number; height: number } | undefined;
    const raf = requestAnimationFrame(() => {
      const attempt = (): void => {
        const b = apiRef.current?.contentBounds();
        const measured = b === undefined ? undefined : { width: Math.ceil(b.width), height: Math.ceil(b.height) };
        // Layout is asynchronous (ELK), so keep re-measuring until it stops
        // moving — see handshakeReady. Publishing the first sample is what made
        // big pages export into a frame sized from the fallback aspect.
        if (!handshakeReady(prev, measured, Date.now() - started, SETTLE_DEADLINE_MS)) {
          prev = measured;
          timer = setTimeout(attempt, SETTLE_POLL_MS);
          return;
        }
        const reserve = apiRef.current?.legendReserve() ?? null;
        const w = window as unknown as ExportWindow;
        // The legend is a viewport-fixed overlay: the snapshot grows the frame
        // by its extent so it never sits on top of the diagram. Both numbers go
        // over the wire unmixed — see __DG_RESERVE__.
        w.__DG_BOUNDS__ = measured ?? { width: 1200, height: 800 };
        w.__DG_RESERVE__ = reserve;
        // Re-read the reserve when the fit is actually requested, not now: the
        // harness calls __DG_FIT__ *after* setViewportSize, and the legend
        // re-measures against that new frame (rows wrap differently, so its
        // height moves). Closing over the handshake-time value pads by a stale
        // number — the one measured against the pre-resize window.
        w.__DG_FIT__ = (pad = 0) => {
          const now = apiRef.current?.legendReserve() ?? null;
          const sides: Record<string, number> = { top: pad, right: pad, bottom: pad, left: pad };
          if (now !== null) sides[now.side] = pad + legendPadding(now.px, window.innerHeight);
          apiRef.current?.fitView(sides);
        };
        w.__DG_READY__ = true;
      };
      // The first measurement still waits out the old 500ms: fonts and images
      // settle in that window, and small diagrams keep their previous timing.
      timer = setTimeout(attempt, 500);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [expandAll]);

  if (data === null || typeof data !== 'object' || (data as ViewerData).model == null) {
    return <div style={{ padding: 24 }}>No diagram to display.</div>;
  }
  const { model, layout, drawings } = data;
  const styleId = model.style !== undefined && isKnownStyle(model.style) ? model.style : 'clean';
  // Which plane is drawn: the reader's pick on an interactive page, and always
  // the model's first plane in export mode. `undefined` leaves DiagramView on
  // its own default, which IS the first plane.
  const plane = activePlaneId(model.planes, picked, expandAll);
  // Mirror the drawn plane's notation so the visual language follows the plane
  // the reader is on — the studio resolves it the same way, so an editable
  // diagram and its published page always agree.
  const notation = activeNotation(model.planes, plane);
  const togglePin = (id: string) =>
    setPins((p) => ({ ...p, [id]: p[id] === 'expanded' ? 'collapsed' : 'expanded' }));
  // A plane change re-seeds the layer switch from the new plane's presets, so the
  // reader's choice on one viewpoint never silently governs another — the studio
  // does the same on switchPlane.
  const pickPlane = (id: string) => {
    setPicked(id);
    setLayers(presetLayers(model.planes, id));
  };
  const toggleLayer = (id: string) =>
    setLayers((ls) => (ls.includes(id) ? ls.filter((l) => l !== id) : [...ls, id]));
  const view = (
    <DiagramView
      model={model}
      pins={pins}
      onTogglePin={togglePin}
      onToggleExpand={togglePin}
      enteredPath={enteredPath}
      onEnteredPathChange={setEnteredPath}
      colorMode="light"
      // Export mode is a one-shot screenshot: no one clicks the controls, and
      // they would be baked into the committed PNG.
      chrome={!expandAll}
      assetBase=""
      styleId={styleId}
      icons={icons}
      layoutApiRef={apiRef}
      // The layer switch: `onToggleLayer` is what turns the legend's LAYERS rows
      // into buttons (Legend.tsx) and what makes an off layer visible as a greyed
      // row at all (legend.ts `canToggleLayers`). Export mode passes neither, so
      // the image keeps inert rows and presets-only compilation.
      {...(expandAll ? {} : { activeLayers: layers, onToggleLayer: toggleLayer })}
      {...(plane !== undefined ? { plane } : {})}
      {...(notation !== undefined ? { notation } : {})}
      {...(layout !== undefined ? { layout } : {})}
      {...(drawings !== undefined ? { drawings } : {})}
    />
  );
  // Single-plane pages and export renders keep exactly the DOM they had before
  // the picker existed — no wrapper, nothing over the canvas — so the PNG
  // pipeline (which measures and screenshots this tree) is untouched.
  if (!showsPlanePicker(model.planes, expandAll)) return view;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <PlanePicker planes={model.planes} active={plane} onSelect={pickPlane} />
      {view}
    </div>
  );
}
