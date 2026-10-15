import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type DiagramModel,
  type DiagramPlane,
  type DiffMarks,
  type Drawings,
  type LayoutOverlay,
} from '@diagc/core/internal';
import {
  applyTheme,
  darkTheme,
  DiagramView,
  LeveragePanel,
  lightTheme,
  STYLE_PRESETS,
  useReaderView,
  type DiagramSelection,
  type LayoutApi,
  type LeverageFocus,
  type LoopEdgeInput,
} from '@diagc/renderer';
import { createIconRegistry } from '@diagc/icons';
import { ThreatTable, showsThreatTable } from './ThreatTable';
import { useStyle } from './style';
import { useTheme } from './theme';

const icons = createIconRegistry();

export interface ViewerData {
  model: DiagramModel;
  layout?: LayoutOverlay;
  drawings?: Drawings;
  /** a `diagc diff` side: outline what changed against the other version */
  diff?: { marks: DiffMarks };
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
 * The folds an export opens with: every container open, so the snapshot is a
 * complete overview. The one exception is `layout.export.collapsed`: a view too
 * big to unfold (hundreds of leaves) names the groups to keep folded for the
 * image. Folding is deliberate: a folded box still anchors its hidden children's
 * edges, so the relations survive the fold.
 */
function exportFolds(model: DiagramModel, layout: LayoutOverlay | undefined): Record<string, 'expanded' | 'collapsed'> {
  const folded = new Set(layout?.export?.collapsed ?? []);
  return Object.fromEntries(
    [...new Set(model.containment.map((c) => c.parent))].map((id) => [
      id,
      folded.has(id) ? ('collapsed' as const) : ('expanded' as const),
    ]),
  );
}

/** A picker is only worth its pixels when there is a choice to make. */
export function showsPlanePicker(planes: readonly DiagramPlane[], expandAll: boolean): boolean {
  return !expandAll && planes.length > 1;
}

/**
 * May this page ever show the leverage report? True for an interactive page
 * with a causal-loop view to click in. Decided from the model, not from the
 * selection: the wrapper the panel sits in has to be there BEFORE the first
 * click, because adding it later re-parents the canvas, which remounts React
 * Flow and throws away the viewport the reader had.
 */
export function showsLeverage(model: DiagramModel, expandAll: boolean): boolean {
  return !expandAll && (model.notation === 'causal-loop' || model.planes.some((p) => p.notation === 'causal-loop'));
}

// The report's column beside the canvas. The panel itself (renderer styles.css
// `.dg-leverage`) fills the column and scrolls inside it; only the width and the
// divider are the page's to decide.
const leverageColumnStyle: CSSProperties = {
  flex: 'none',
  width: 300,
  minHeight: 0,
  borderLeft: '1px solid var(--dg-border)',
};

// Chrome styling, matched to the renderer's own overlays (`.dg-breadcrumbs-nav`
// / `.dg-legend`): the theme's surface tokens, a 6px radius, 12px system-ui.
// Inline rather than a stylesheet because the viewer app carries no CSS of its
// own and the published page is a single inlined file.
const barStyle: CSSProperties = {
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

const planeGroupStyle: CSSProperties = { display: 'inline-flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' };

// The style picker, drawn as one more chip of the bar: no box of its own, the
// muted text the unselected plane chips use, the arrow the browser gives a select.
const styleSelectStyle = (afterPlanes: boolean): CSSProperties => ({
  background: 'none',
  border: 'none',
  // a hairline between the planes and the style, where both are shown
  borderLeft: afterPlanes ? '1px solid var(--dg-border)' : 'none',
  marginLeft: afterPlanes ? 4 : 0,
  paddingLeft: afterPlanes ? 8 : 4,
  borderRadius: 0,
  color: 'var(--dg-text-muted)',
  cursor: 'pointer',
  font: 'inherit',
  padding: '2px 4px',
});

/** The bar over the drawing: the plane chips and the style picker, together top-centre. */
function TopBar({ children }: { children: ReactNode }) {
  return (
    <div style={barStyle} role="toolbar" aria-label="View">
      {children}
    </div>
  );
}

/**
 * The published page's style picker: every preset, the one the page is drawn in
 * selected. A pick lasts the visit (see useStyle); the diagram's own style is
 * what the page opens on.
 */
export function StylePicker({
  style,
  afterPlanes,
  onSelect,
}: {
  style: string;
  /** drawn beside plane chips, so with a divider */
  afterPlanes: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <select
      aria-label="Style"
      title="Style"
      style={styleSelectStyle(afterPlanes)}
      value={style}
      onChange={(e) => onSelect(e.target.value)}
    >
      {STYLE_PRESETS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

const planeButtonStyle = (current: boolean): CSSProperties => ({
  background: current ? 'var(--dg-badge-bg)' : 'none',
  border: 'none',
  borderRadius: 4,
  // the badge's own text colour: --dg-text on the badge fill is light on light in dark
  color: current ? 'var(--dg-badge-text)' : 'var(--dg-text-muted)',
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
    <span style={planeGroupStyle} role="group" aria-label="Plane">
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
    </span>
  );
}

export function Viewer({
  data,
  expandAll = false,
  exportPlane,
}: {
  data: ViewerData | null;
  expandAll?: boolean;
  /** the plane an export draws (`?plane=`); the first plane when absent */
  exportPlane?: string;
}) {
  const model =
    data !== null && typeof data === 'object' && (data as ViewerData).model != null
      ? (data as ViewerData).model
      : undefined;
  const layout = model !== undefined ? (data as ViewerData).layout : undefined;
  // The page opens on the model's first plane (what `<name>.png` shows) with that
  // plane's preset layers, unfolded where the layout was SAVED open (a
  // hand-placed interior is only visible while its container is open) and
  // folded elsewhere, so readers explore. An export opens everything instead,
  // on the plane the publisher asked for.
  const {
    props: readerProps,
    plane,
    notation,
    setPlane,
  } = useReaderView({
    model,
    layout,
    exportMode: expandAll,
    ...(expandAll && model !== undefined
      ? { opening: { pins: exportFolds(model, layout), ...(exportPlane !== undefined ? { plane: exportPlane } : {}) } }
      : {}),
  });
  // The causal-loop reading aids, all viewer state and none of it saved: the
  // clicked variable the report is about, the ctrl-clicked one to compare it
  // with, the report row the canvas is glowing, and the signed graph the canvas
  // compiled (the report runs on the exact edge ids drawn, so a layer switch
  // changes both together).
  const [selected, setSelected] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [focus, setFocus] = useState<LeverageFocus | null>(null);
  const [cldEdges, setCldEdges] = useState<LoopEdgeInput[]>([]);
  const onSelect = useCallback((sel: DiagramSelection | null) => {
    setSelected(sel?.kind === 'node' ? sel.id : null);
    // a new subject drops the comparison and the row highlight with it
    setCompareId(null);
    setFocus(null);
  }, []);
  const onCompareSelect = useCallback((id: string) => {
    setCompareId(id);
    setFocus(null);
  }, []);
  const apiRef = useRef<LayoutApi | null>(null);

  // Which theme, and the reader's switch where they have one (see theme.ts for the
  // order: an export is light unless the publisher said otherwise). The style the
  // same way (style.ts): the URL, the reader's pick, the diagram's own.
  const { theme, toggle: toggleTheme } = useTheme(expandAll);
  const { style, setStyle } = useStyle(expandAll, model?.style);
  // Publish the theme's --dg-* tokens so node strokes/fills and the dashed
  // group-container borders resolve. Without this every published page loses those
  // variables (React Flow's colorMode themes React Flow itself, not our tokens), so
  // group boxes render border-less. `color-scheme` makes scrollbars and form controls
  // follow the page rather than the system.
  useEffect(() => {
    applyTheme(document.documentElement, theme === 'dark' ? darkTheme : lightTheme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

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

  // The report is about a variable on the causal-loop view being drawn — a
  // box clicked on another plane, or a selection the model no longer has, gets
  // none. Derived ahead of the fallback return below because the re-fit effect
  // keys on it, and hooks cannot follow a return.
  const leverage = model !== undefined && showsLeverage(model, expandAll);
  const target =
    leverage && notation === 'causal-loop' && selected !== null && model.nodes.some((n) => n.id === selected)
      ? selected
      : null;
  // The report takes a column off the canvas, and gives it back on close. Re-fit
  // both times: its rows glow paths anywhere in the graph, so the part the
  // column would cover is exactly what the reader is about to look at. Only on
  // the change — the mount fit is the canvas's own.
  const reportOpen = target !== null;
  const wasOpen = useRef(reportOpen);
  useEffect(() => {
    if (wasOpen.current === reportOpen) return;
    wasOpen.current = reportOpen;
    apiRef.current?.fitView();
  }, [reportOpen]);

  if (model === undefined || readerProps === undefined) {
    return <div style={{ padding: 24 }}>No diagram to display.</div>;
  }
  const { drawings, diff } = data as ViewerData;
  const pickPlane = (id: string) => {
    setPlane(id);
    // The canvas clears its own selection on a recompile; the report follows,
    // or a switch back to the causal plane would revive a stale one.
    onSelect(null);
  };
  const view = (
    <DiagramView
      {...readerProps}
      styleId={style}
      colorMode={theme}
      {...(toggleTheme !== undefined ? { onToggleTheme: toggleTheme } : {})}
      // Export mode is a one-shot screenshot: no one clicks the controls, and
      // they would be baked into the committed PNG.
      chrome={!expandAll}
      assetBase=""
      icons={icons}
      layoutApiRef={apiRef}
      // The leverage report's hooks: which variable was clicked, which to compare
      // it with, the compiled signed graph, and the row to glow. Export mode
      // passes none — nothing is clicked in a screenshot.
      {...(leverage ? { onSelect, onCompareSelect, onCldEdges: setCldEdges, externalHighlight: focus } : {})}
      {...(drawings !== undefined ? { drawings } : {})}
      {...(diff !== undefined ? { diffMarks: diff.marks } : {})}
    />
  );
  const picker = showsPlanePicker(model.planes, expandAll);
  const styling = setStyle !== undefined;
  const table = showsThreatTable(model, expandAll);
  // A page with nothing to add — one plane, no threats, the style fixed by its
  // address — and every export render keep exactly the DOM they had before this
  // chrome existed: no wrapper, nothing over the canvas, nothing under it, so the
  // PNG pipeline (which measures and screenshots this tree) is untouched. That is
  // also why the register never renders in export mode: the snapshot screenshots
  // `.react-flow` and frames it from __DG_BOUNDS__, measured off the canvas host,
  // so a strip below the canvas would shrink the drawing without ever appearing
  // in the image.
  if (!picker && !styling && !table && !leverage) return view;
  // the canvas keeps its own positioning context: the bar is placed against the
  // drawing, not against the page with the table in it
  const host = (
    <div style={{ position: 'relative', flex: '1 1 0', minHeight: 0, minWidth: 0 }}>
      {(picker || styling) && (
        <TopBar>
          {picker && <PlanePicker planes={model.planes} active={plane} onSelect={pickPlane} />}
          {setStyle !== undefined && <StylePicker style={style} afterPlanes={picker} onSelect={setStyle} />}
        </TopBar>
      )}
      {view}
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {leverage ? (
        // The drawing and, once a variable is clicked, its report side by side.
        // The row is there from the first render so opening the report never
        // re-parents the canvas (see showsLeverage); pages without the notation
        // keep the DOM they had.
        <div style={{ display: 'flex', flexDirection: 'row', flex: '1 1 0', minHeight: 0 }}>
          {host}
          {target !== null && (
            <div style={leverageColumnStyle}>
              <LeveragePanel
                key={target}
                model={model}
                edges={cldEdges}
                target={target}
                activeFocusKey={focus?.key ?? null}
                onFocus={setFocus}
                onClose={() => onSelect(null)}
                compareId={compareId}
                onClearCompare={() => setCompareId(null)}
              />
            </div>
          )}
        </div>
      ) : (
        host
      )}
      {table && <ThreatTable model={model} {...(plane !== undefined ? { plane } : {})} />}
    </div>
  );
}
