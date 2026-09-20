/** Rough-engine drawing parameters (subset of roughjs Options we expose). */
export interface RoughStyle {
  roughness: number;
  bowing: number;
  strokeWidth: number;
  fillStyle: 'solid' | 'hachure' | 'cross-hatch' | 'zigzag' | 'dots';
  /** stroke width of hatch fill lines (hachure/zigzag/…) */
  fillWeight?: number;
  /** spacing between hatch fill lines */
  hachureGap?: number;
  /** 0–1 strength of the hatch lines over the node's opaque base. They run
   *  straight behind the label in the OUTLINE's colour, so at full strength a
   *  heavy hatch (marker) is louder than the text it carries. Absent = 0.35;
   *  the thinner the line, the more of it a preset can afford. */
  hatchOpacity?: number;
}

/** A named visual style: pure data read by the rough engine, node/edge
 * chrome, and canvas CSS. Mirrors the notation-profile pattern
 * (notations.ts) — adding a preset here is the whole job. */
export interface StylePreset {
  id: string;
  label: string;
  /** rough drawing params; absent = crisp CSS rendering */
  rough?: RoughStyle;
  /** rounded corners for 'box' rough shapes; rough presets only */
  cornerRadius?: number;
  /** CSS font-family stack for node/edge text */
  fontFamily?: string;
  /** node.color tint strength, as color-mix percentages:
   *  fill   → color-mix(in srgb, color N%, var(--dg-node-fill))
   *  stroke → color-mix(in srgb, color N%, var(--dg-node-stroke))
   *  absent = the original sketch behavior (fill 14, stroke 100). */
  colorMix?: { fill: number; stroke: number };
  /** canvas-level CSS custom property overrides (--dg-* only) */
  cssVars?: Record<string, string>;
}

const CLEAN: StylePreset = { id: 'clean', label: 'Clean' };

const SKETCH: StylePreset = {
  id: 'sketch',
  label: 'Sketch',
  rough: { roughness: 1.15, bowing: 1, strokeWidth: 1.5, fillStyle: 'solid' },
  fontFamily: "'Kalam', system-ui, sans-serif",
  colorMix: { fill: 14, stroke: 100 },
};

const HAND_DRAWN: StylePreset = {
  id: 'hand-drawn',
  label: 'Hand-drawn',
  rough: { roughness: 0.9, bowing: 0.8, strokeWidth: 1.2, fillStyle: 'hachure', fillWeight: 0.8, hachureGap: 5, hatchOpacity: 0.45 },
  cornerRadius: 14,
  fontFamily: "'Caveat', 'Kalam', cursive",
  colorMix: { fill: 22, stroke: 85 },
};

const BLUEPRINT: StylePreset = {
  id: 'blueprint',
  label: 'Blueprint',
  fontFamily: "ui-monospace, 'Cascadia Mono', 'Source Code Pro', monospace",
  cssVars: {
    '--dg-canvas-bg': '#0d2740',
    '--dg-surface': '#0d2740',
    '--dg-node-fill': '#103052',
    '--dg-node-stroke': '#9ec8e8',
    '--dg-group-fill': '#0f2c4a',
    '--dg-group-stroke': '#5f8ab0',
    '--dg-text': '#e4f1fb',
    '--dg-text-muted': '#8fb3cf',
    '--dg-border': '#2a4a6b',
    '--dg-edge': '#9ec8e8',
    '--dg-edge-label-bg': '#103052',
  },
};

const PENCIL: StylePreset = {
  id: 'pencil',
  label: 'Pencil',
  // Near-zero roughness/bowing: the outline reads as carefully ruled, not
  // wobbled — the pencil feel comes entirely from the delicate hachure fill.
  rough: { roughness: 0.3, bowing: 0.1, strokeWidth: 1.4, fillStyle: 'hachure', fillWeight: 0.55, hachureGap: 5, hatchOpacity: 0.5 },
  cornerRadius: 16,
  fontFamily: "'Caveat', 'Kalam', cursive",
  colorMix: { fill: 22, stroke: 85 },
};

const MARKER: StylePreset = {
  id: 'marker',
  label: 'Marker',
  rough: { roughness: 1.6, bowing: 1.2, strokeWidth: 2.5, fillStyle: 'zigzag', fillWeight: 1.8, hachureGap: 7, hatchOpacity: 0.25 },
  cornerRadius: 8,
  fontFamily: "'Kalam', system-ui, sans-serif",
  colorMix: { fill: 28, stroke: 100 },
};

export const STYLE_PRESETS: StylePreset[] = [CLEAN, SKETCH, HAND_DRAWN, PENCIL, BLUEPRINT, MARKER];

/** Resolve a preset id; unknown/absent ids fall back to clean (crisp). */
export const stylePreset = (id?: string): StylePreset => STYLE_PRESETS.find((p) => p.id === id) ?? CLEAN;

export const isKnownStyle = (id?: string): boolean => STYLE_PRESETS.some((p) => p.id === id);
