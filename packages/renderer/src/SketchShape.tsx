import { useMemo } from 'react';
import { seedFrom, sketchNode, type SketchShapeKind } from './sketch';
import type { StylePreset } from './stylePresets';

// the original sketch behavior: subtle fill wash, full-strength stroke
const DEFAULT_MIX = { fill: 14, stroke: 100 };
// see RoughStyle.hatchOpacity
const DEFAULT_HATCH_OPACITY = 0.35;

/** What goes inside the outline.
 *  - `preset`: the preset's own fill — a leaf box. A hatched preset draws its
 *    lines over an opaque base: rough returns a hatch as lines and nothing under
 *    them, and the crisp chrome is switched off in rough mode, so without the
 *    base the label would sit on bare lines with the canvas showing through.
 *  - `wash`: a solid polygon whatever the preset fills with — an open container.
 *    Its area is where its children and their edges are drawn; hatch lines laid
 *    across it, and again by every container nested inside, bury the lot.
 *  - `none`: the outline alone — the registry's outline look (a C4 boundary, an
 *    AWS region), whose crisp twin is a transparent box with a coloured border. */
export type SketchFill = 'preset' | 'wash' | 'none';

/** hand-drawn shape drawn behind a node's content; sized to the node box.
 * Callers gate on preset.rough — a crisp preset renders no SketchShape. */
export function SketchShape({
  id,
  kind,
  width,
  height,
  color,
  preset,
  fill = 'preset',
}: {
  id: string;
  kind: SketchShapeKind;
  width: number;
  height: number;
  color?: string;
  preset: StylePreset;
  fill?: SketchFill;
}) {
  const rough = preset.rough;
  const seed = useMemo(() => seedFrom(id), [id]);
  const hatched = rough !== undefined && rough.fillStyle !== 'solid' && fill === 'preset';
  const paths = useMemo(() => {
    if (rough === undefined) return null;
    const radius = preset.cornerRadius ?? 0;
    // The solid pass is the polygon under everything. Same seed, and rough draws
    // the outline before it fills, so both passes wobble the same outline and the
    // polygon sits exactly under the hatched pass's stroke.
    const solid = sketchNode(kind, width, height, seed, { ...rough, fillStyle: 'solid' }, radius);
    return hatched ? { ...sketchNode(kind, width, height, seed, rough, radius), fill: solid.fill } : solid;
  }, [kind, width, height, seed, rough, hatched, preset.cornerRadius]);
  if (paths === null || rough === undefined) return null;
  const mix = preset.colorMix ?? DEFAULT_MIX;
  const tinted = (pct: number, cssVar: string): string | undefined =>
    color !== undefined ? `color-mix(in srgb, ${color} ${pct}%, var(${cssVar}))` : undefined;
  const fillColor = tinted(mix.fill, '--dg-node-fill');
  const strokeColor = tinted(mix.stroke, '--dg-node-stroke');
  return (
    <svg className="dg-sketch-shape" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {fill !== 'none' && paths.fill !== '' && (
        <path className="dg-sketch-fill" d={paths.fill} {...(fillColor !== undefined ? { style: { fill: fillColor } } : {})} />
      )}
      {hatched && paths.hatch !== '' && (
        <path
          className="dg-sketch-hatch"
          d={paths.hatch}
          style={{
            strokeWidth: rough.fillWeight ?? 1,
            opacity: rough.hatchOpacity ?? DEFAULT_HATCH_OPACITY,
            ...(strokeColor !== undefined ? { stroke: strokeColor } : {}),
          }}
        />
      )}
      <path
        className="dg-sketch-stroke"
        d={paths.stroke}
        style={{ strokeWidth: rough.strokeWidth, ...(strokeColor !== undefined ? { stroke: strokeColor } : {}) }}
      />
    </svg>
  );
}
