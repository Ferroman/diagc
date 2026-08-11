import { useMemo } from 'react';
import { seedFrom, sketchNode, type SketchShapeKind } from './sketch';
import type { StylePreset } from './stylePresets';

// the original sketch behavior: subtle fill wash, full-strength stroke
const DEFAULT_MIX = { fill: 14, stroke: 100 };

/** hand-drawn shape drawn behind a node's content; sized to the node box.
 * Callers gate on preset.rough — a crisp preset renders no SketchShape. */
export function SketchShape({
  id,
  kind,
  width,
  height,
  color,
  preset,
}: {
  id: string;
  kind: SketchShapeKind;
  width: number;
  height: number;
  color?: string;
  preset: StylePreset;
}) {
  const rough = preset.rough;
  const seed = useMemo(() => seedFrom(id), [id]);
  const paths = useMemo(
    () => (rough === undefined ? null : sketchNode(kind, width, height, seed, rough, preset.cornerRadius ?? 0)),
    [kind, width, height, seed, rough, preset.cornerRadius],
  );
  if (paths === null || rough === undefined) return null;
  const mix = preset.colorMix ?? DEFAULT_MIX;
  const tinted = (pct: number, cssVar: string): string | undefined =>
    color !== undefined ? `color-mix(in srgb, ${color} ${pct}%, var(${cssVar}))` : undefined;
  const fillColor = tinted(mix.fill, '--dg-node-fill');
  const strokeColor = tinted(mix.stroke, '--dg-node-stroke');
  return (
    <svg className="dg-sketch-shape" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {paths.fill !== '' && (
        <path className="dg-sketch-fill" d={paths.fill} {...(fillColor !== undefined ? { style: { fill: fillColor } } : {})} />
      )}
      {paths.hatch !== '' && (
        <path
          className="dg-sketch-hatch"
          d={paths.hatch}
          style={{ strokeWidth: rough.fillWeight ?? 1, ...(strokeColor !== undefined ? { stroke: strokeColor } : {}) }}
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
