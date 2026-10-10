import { toBlob } from 'html-to-image';

/**
 * Client-side PNG export of the live canvas: what the studio shows (folds,
 * layers, theme, drawings) at the content's full extent, not the window's.
 *
 * The CLI's `publish` screenshots a headless viewer instead; this is the same
 * idea without the browser round trip — the canvas element is cloned to an SVG
 * foreignObject and rasterised (html-to-image), after the viewport is moved so
 * the content sits at 1:1 inside a frame cut to its own size.
 */

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportFrame {
  /** frame size in CSS px (content + padding at zoom 1) */
  width: number;
  height: number;
  /** the viewport that puts the content's top-left `padding` px in */
  viewport: { x: number; y: number; zoom: 1 };
  /** device px per CSS px, lowered for a huge diagram so the canvas stays drawable */
  pixelRatio: number;
}

/** Browsers refuse canvases much past this on a side (Chrome ~16k, Safari less);
 * a giant diagram is scaled down to fit rather than coming back blank. */
export const MAX_EXPORT_SIDE = 12_000;

export function exportFrame(bounds: Bounds, opts: { padding?: number; pixelRatio?: number } = {}): ExportFrame {
  const padding = opts.padding ?? 32;
  const width = Math.ceil(bounds.width + 2 * padding);
  const height = Math.ceil(bounds.height + 2 * padding);
  const wanted = opts.pixelRatio ?? 2;
  const pixelRatio = Math.min(wanted, MAX_EXPORT_SIDE / Math.max(width, height, 1));
  return { width, height, viewport: { x: padding - bounds.x, y: padding - bounds.y, zoom: 1 }, pixelRatio };
}

/** Chrome that is the canvas's furniture, not the diagram: the corner controls,
 * the minimap, overlay panels, connection handles and resize grips — and the dot
 * grid, which the clone keeps at the on-screen canvas size, so in a frame cut to
 * the whole diagram it stopped partway across (the frame's own background colour
 * fills it instead). */
const SKIP = [
  'react-flow__panel',
  'react-flow__handle',
  'react-flow__resize-control',
  'react-flow__minimap',
  'react-flow__background',
  'dg-no-export',
];

export function keepInExport(node: Node): boolean {
  if (!(node instanceof Element)) return true;
  return !SKIP.some((c) => node.classList.contains(c));
}

/** Rasterise `el` (the `.react-flow` element, already moved to `frame.viewport`). */
export async function captureCanvas(el: HTMLElement, frame: ExportFrame): Promise<Blob | null> {
  const style = getComputedStyle(el);
  const background = style.getPropertyValue('--xy-background-color').trim() || style.backgroundColor;
  return toBlob(el, {
    width: frame.width,
    height: frame.height,
    pixelRatio: frame.pixelRatio,
    ...(background !== '' ? { backgroundColor: background } : {}),
    style: { width: `${frame.width}px`, height: `${frame.height}px` },
    filter: keepInExport,
  });
}
