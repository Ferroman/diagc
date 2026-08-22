import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';
import type { RoughStyle } from './stylePresets';

// One generator for the whole app; it holds no per-drawing state (seed is passed
// per call), so reuse is safe and avoids re-instantiation churn.
const gen = rough.generator();

// Sentinel colors classify gen.toPaths() output without depending on drawing
// order: rough copies option colors into path attributes verbatim, and a
// non-solid fill (hachure/zigzag/…) comes back as STROKED lines carrying the
// fill color in `stroke`. The sentinels never render — CSS classes and inline
// styles own the real colors.
const FILL_SENTINEL = 'sentinel-fill';
const STROKE_SENTINEL = 'sentinel-stroke';

export type SketchShapeKind = 'box' | 'cylinder' | 'hexagon' | 'bubble';
export interface SketchPaths {
  /** combined `d` for solid fill polygon(s) — render with fill */
  fill: string;
  /** combined `d` for hatch fill lines (hachure/zigzag/…) — render as strokes */
  hatch: string;
  /** combined `d` for the hand-drawn outline stroke(s) */
  stroke: string;
}

/** stable 32-bit hash → rough seed, so a node/edge sketches the same way every render */
export function seedFrom(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // rough treats seed 0 as "no seed" and falls back to Math.random(), which
  // would make that one node/edge re-wobble nondeterministically every render.
  return (h >>> 0) || 1;
}

interface PathInfo {
  d: string;
  stroke: string;
  fill?: string;
}

const toOptions = (style: RoughStyle, seed: number): Options => ({
  roughness: style.roughness,
  bowing: style.bowing,
  strokeWidth: style.strokeWidth,
  fillStyle: style.fillStyle,
  ...(style.fillWeight !== undefined ? { fillWeight: style.fillWeight } : {}),
  ...(style.hachureGap !== undefined ? { hachureGap: style.hachureGap } : {}),
  fill: FILL_SENTINEL,
  stroke: STROKE_SENTINEL,
  seed,
});

function partition(infos: PathInfo[]): SketchPaths {
  const joined = (pred: (i: PathInfo) => boolean) => infos.filter(pred).map((i) => i.d).join(' ');
  return {
    fill: joined((i) => i.fill === FILL_SENTINEL),
    hatch: joined((i) => i.stroke === FILL_SENTINEL),
    stroke: joined((i) => i.stroke === STROKE_SENTINEL),
  };
}

function hexPoints(w: number, h: number): [number, number][] {
  const inset = Math.min(w * 0.2, 24);
  return [
    [inset, 1],
    [w - inset, 1],
    [w - 1, h / 2],
    [w - inset, h - 1],
    [inset, h - 1],
    [1, h / 2],
  ];
}

/** Speech-bubble tail, in px from the body's bottom-left corner: where its base
 * sits on the bottom edge and how far the tip hangs below the box. The tail is
 * OUTSIDE the node's layout box on purpose — elk spaces and edges attach to the
 * body rect, exactly as for a box; the tail is decoration. The crisp twin in
 * styles.css (.dg-shape-bubble::before/::after) uses the same numbers. */
export const BUBBLE_TAIL = { left: 14, width: 16, height: 12 } as const;

/** rounded-rect outline (quadratic corner arcs), inset 1px like the sharp box.
 * `bottom` replaces the bottom edge, drawn right-to-left from `xr` to `xl` — the
 * bubble hangs its tail off it while staying one closed sub-path (a separate
 * triangle would fill twice and draw a seam across the tail base). */
function roundedBoxPath(
  w: number,
  h: number,
  r: number,
  bottom: (xr: number, y: number, xl: number) => string[] = (_xr, y, xl) => [`L ${xl} ${y}`],
): string {
  const x0 = 1;
  const y0 = 1;
  const x1 = w - 1;
  const y1 = h - 1;
  const rad = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  return [
    `M ${x0 + rad} ${y0}`,
    `L ${x1 - rad} ${y0}`,
    `Q ${x1} ${y0} ${x1} ${y0 + rad}`,
    `L ${x1} ${y1 - rad}`,
    `Q ${x1} ${y1} ${x1 - rad} ${y1}`,
    ...bottom(x1 - rad, y1, x0 + rad),
    `Q ${x0} ${y1} ${x0} ${y1 - rad}`,
    `L ${x0} ${y0 + rad}`,
    `Q ${x0} ${y0} ${x0 + rad} ${y0}`,
    'Z',
  ].join(' ');
}

/** rounded box whose bottom edge dips into a tail at the bottom-left; the tail
 * shrinks to fit (and to nothing) on a box too narrow to hold it */
function bubblePath(w: number, h: number, r: number): string {
  return roundedBoxPath(w, h, r, (xr, y, xl) => {
    const base0 = Math.max(xl, Math.min(xl + BUBBLE_TAIL.left, xr));
    const base1 = Math.min(base0 + BUBBLE_TAIL.width, xr);
    return [`L ${base1} ${y}`, `L ${base0} ${y + BUBBLE_TAIL.height}`, `L ${base0} ${y}`, `L ${xl} ${y}`];
  });
}

export function sketchNode(
  kind: SketchShapeKind,
  width: number,
  height: number,
  seed: number,
  style: RoughStyle,
  cornerRadius = 0,
): SketchPaths {
  const w = Math.max(2, width);
  const h = Math.max(2, height);
  const o = toOptions(style, seed);
  const drawables =
    kind === 'hexagon'
      ? [gen.polygon(hexPoints(w, h), o)]
      : kind === 'cylinder'
        ? [gen.rectangle(1, 8, w - 2, h - 10, o), gen.ellipse(w / 2, 8, w - 6, 14, o)]
        : kind === 'bubble'
          ? [gen.path(bubblePath(w, h, cornerRadius), o)]
          : cornerRadius > 0
          ? [gen.path(roundedBoxPath(w, h, cornerRadius), o)]
          : [gen.rectangle(1, 1, w - 2, h - 2, o)];
  return partition(drawables.flatMap((d) => gen.toPaths(d) as PathInfo[]));
}

export function sketchCircle(cx: number, cy: number, diameter: number, seed: number, style: RoughStyle): SketchPaths {
  const d = Math.max(2, diameter);
  return partition(gen.toPaths(gen.circle(cx, cy, d, toOptions(style, seed))) as PathInfo[]);
}

export function sketchEdge(path: string, seed: number, style: RoughStyle): string {
  // A single stroke pass: rough draws each line as two overlapping passes by
  // default, which on a long curved edge (e.g. a CLD bow) run visibly parallel
  // and read as two separate edges. Nodes keep the default two-pass look.
  const o = { ...toOptions(style, seed), fill: undefined, disableMultiStroke: true };
  const infos = gen.toPaths(gen.path(path, o)) as PathInfo[];
  const d = infos.filter((i) => i.stroke === STROKE_SENTINEL).map((i) => i.d).join(' ');
  // A degenerate input (e.g. a bare moveto) can roughen to zero stroke
  // sub-paths — fall back to the original path rather than blank the edge.
  return d === '' ? path : d;
}
