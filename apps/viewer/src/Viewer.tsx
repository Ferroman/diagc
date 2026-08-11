import { useEffect, useRef, useState } from 'react';
import { BUILTIN_NOTATIONS, type DiagramModel, type LayoutOverlay, type NotationId } from '@diagramming/core';
import { applyTheme, DiagramView, isKnownStyle, lightTheme, type LayoutApi } from '@diagramming/renderer';
import { createIconRegistry } from '@diagramming/icons';

const icons = createIconRegistry();

export interface ViewerData {
  model: DiagramModel;
  layout?: LayoutOverlay;
}

interface ExportWindow {
  __DG_READY__?: boolean;
  __DG_BOUNDS__?: { width: number; height: number };
  __DG_FIT__?: () => void;
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

export function Viewer({ data, expandAll = false }: { data: ViewerData | null; expandAll?: boolean }) {
  // Export snapshots want a complete overview, so seed every container group as
  // expanded; interactive pages start folded (empty pins) so viewers explore.
  const [pins, setPins] = useState<Record<string, 'expanded' | 'collapsed'>>(() =>
    expandAll && data !== null && typeof data === 'object' && (data as ViewerData).model != null
      ? Object.fromEntries(
          [...new Set((data as ViewerData).model.containment.map((c) => c.parent))].map((id) => [id, 'expanded' as const]),
        )
      : {},
  );
  const [enteredPath, setEnteredPath] = useState<string[]>([]);
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
  useEffect(() => {
    if (!expandAll) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        const b = apiRef.current?.contentBounds();
        const reserve = apiRef.current?.legendReserve() ?? null;
        const w = window as unknown as ExportWindow;
        const base = b !== undefined ? { width: Math.ceil(b.width), height: Math.ceil(b.height) } : { width: 1200, height: 800 };
        // The legend is a viewport-fixed overlay, so grow the capture frame by
        // its extent and fit with that side padded — otherwise it would sit on
        // top of the diagram in the committed image.
        w.__DG_BOUNDS__ =
          reserve === null ? base : { width: base.width, height: base.height + reserve.px };
        // Re-read the reserve when the fit is actually requested, not now: the
        // harness calls __DG_FIT__ *after* setViewportSize, and the legend
        // re-measures against that new frame (rows wrap differently, so its
        // height moves). Closing over the handshake-time value pads by a stale
        // number — the one measured against the pre-resize window.
        w.__DG_FIT__ = () => {
          const now = apiRef.current?.legendReserve() ?? null;
          if (now === null) {
            apiRef.current?.fitView();
            return;
          }
          apiRef.current?.fitView({ [now.side]: legendPadding(now.px, window.innerHeight) });
        };
        w.__DG_READY__ = true;
      }, 500);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [expandAll]);

  if (data === null || typeof data !== 'object' || (data as ViewerData).model == null) {
    return <div style={{ padding: 24 }}>No diagram to display.</div>;
  }
  const { model, layout } = data;
  const styleId = model.style !== undefined && isKnownStyle(model.style) ? model.style : 'clean';
  // DiagramView defaults to the model's first plane when no `plane` prop is
  // given (Viewer doesn't offer a plane switcher), so mirror that plane's
  // notation to keep the drawn language faithful to the pinned diagram.
  // Narrow to a known id the same way styleId does — an unrecognized
  // notation falls back to the default look instead of erroring.
  const activeNotation = model.planes[0]?.notation;
  const notation = (BUILTIN_NOTATIONS as readonly string[]).includes(activeNotation ?? '')
    ? (activeNotation as NotationId)
    : undefined;
  const togglePin = (id: string) =>
    setPins((p) => ({ ...p, [id]: p[id] === 'expanded' ? 'collapsed' : 'expanded' }));
  return (
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
      {...(notation !== undefined ? { notation } : {})}
      {...(layout !== undefined ? { layout } : {})}
    />
  );
}
