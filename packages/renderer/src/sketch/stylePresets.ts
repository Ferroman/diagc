import { asciiFrameVars } from './asciiFrames';

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

/** A preset's own line drawing (the text looks bend square and draw lines as characters). */
export interface EdgeLook {
  /** corner radius of a routed line in px, in place of the layout's (0 = square bends) */
  corner?: number;
  /** stroke-dasharray per line style, in place of the default */
  dash?: Partial<Record<'solid' | 'dashed', string>>;
  /** the default arrow head drawn open (a stroked `>`) rather than filled */
  openArrow?: boolean;
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
  /** colours for node types, in slot order: present = the preset colours boxes
   *  by type (canvas/type-hues.ts) and draws each box from its `--dg-hue` */
  palette?: readonly string[];
  /** how the preset draws lines, where it departs from the default */
  edges?: EdgeLook;
  /** the canvas grid: absent = React Flow's dots */
  grid?: 'lines' | 'none';
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
  rough: {
    roughness: 0.9,
    bowing: 0.8,
    strokeWidth: 1.2,
    fillStyle: 'hachure',
    fillWeight: 0.8,
    hachureGap: 5,
    hatchOpacity: 0.45,
  },
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
  rough: {
    roughness: 0.3,
    bowing: 0.1,
    strokeWidth: 1.4,
    fillStyle: 'hachure',
    fillWeight: 0.55,
    hachureGap: 5,
    hatchOpacity: 0.5,
  },
  cornerRadius: 16,
  fontFamily: "'Caveat', 'Kalam', cursive",
  colorMix: { fill: 22, stroke: 85 },
};

const MARKER: StylePreset = {
  id: 'marker',
  label: 'Marker',
  rough: {
    roughness: 1.6,
    bowing: 1.2,
    strokeWidth: 2.5,
    fillStyle: 'zigzag',
    fillWeight: 1.8,
    hachureGap: 7,
    hatchOpacity: 0.25,
  },
  cornerRadius: 8,
  fontFamily: "'Kalam', system-ui, sans-serif",
  colorMix: { fill: 28, stroke: 100 },
};

const INTER = "'Inter', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

/** Type colours for the looks that follow light and dark: mid-tones, which the
 * looks mix toward the surface (washes) or the text (glyphs), so one list reads
 * on both. */
const TINTS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#f43f5e', '#06b6d4', '#84cc16', '#d946ef'];

/** An edge part-way from the text to the page: the newer looks keep lines quieter than boxes. */
const quietEdge = (pct: number): string => `color-mix(in srgb, var(--dg-text) ${pct}%, var(--dg-bg))`;

const SOFT: StylePreset = {
  id: 'soft',
  label: 'Soft',
  fontFamily: INTER,
  cssVars: {
    '--dg-edge': quietEdge(38),
    '--dg-node-stroke': 'color-mix(in srgb, var(--dg-text) 9%, var(--dg-surface))',
  },
};

const PASTEL: StylePreset = {
  id: 'pastel',
  label: 'Pastel',
  fontFamily: INTER,
  palette: TINTS,
  cssVars: { '--dg-edge': quietEdge(38) },
};

const CARDS: StylePreset = {
  id: 'cards',
  label: 'Cards',
  fontFamily: INTER,
  palette: TINTS,
  cssVars: { '--dg-edge': quietEdge(40) },
};

const LAYERED: StylePreset = {
  id: 'layered',
  label: 'Layered',
  fontFamily: INTER,
  grid: 'none',
  cssVars: {
    '--dg-canvas-bg': 'color-mix(in srgb, #3b82f6 3%, var(--dg-bg))',
    '--dg-edge': 'color-mix(in srgb, #64748b 75%, var(--dg-text))',
  },
};

const NEON: StylePreset = {
  id: 'neon',
  label: 'Neon',
  fontFamily: "'Chakra Petch', system-ui, sans-serif",
  // tube colours: cyan, magenta, yellow, green, orange, violet, red
  palette: ['#00e5ff', '#ff2bd6', '#f2ff3d', '#5cff7a', '#ff9d2b', '#b18cff', '#ff4d6d'],
  grid: 'lines',
  cssVars: {
    '--dg-canvas-bg': '#07080f',
    '--dg-bg': '#07080f',
    '--dg-surface': '#0b0d17',
    '--dg-node-fill': '#0b0d17',
    '--dg-node-stroke': '#00e5ff',
    '--dg-group-fill': 'rgba(255, 43, 214, 0.035)',
    '--dg-group-stroke': '#ff2bd6',
    '--dg-text': '#e8f9ff',
    '--dg-text-muted': '#86a4bb',
    '--dg-border': '#1f2a3d',
    '--dg-edge': '#22d3ee',
    '--dg-edge-label-bg': '#07080f',
    '--dg-accent': '#00e5ff',
    '--dg-badge-bg': '#ff2bd6',
    '--dg-badge-text': '#07080f',
    '--dg-ink': '#e8f9ff',
  },
};

const TERMINAL: StylePreset = {
  id: 'terminal',
  label: 'Terminal',
  fontFamily: MONO,
  // phosphor green first, then the colours a terminal's palette adds
  palette: ['#39ff88', '#5ef2ff', '#ffb000', '#ff79c6', '#bd93f9', '#ff5555', '#f1fa8c'],
  grid: 'none',
  cssVars: {
    '--dg-canvas-bg': '#050805',
    '--dg-bg': '#050805',
    '--dg-surface': '#0a110b',
    '--dg-node-fill': '#0a110b',
    '--dg-node-stroke': '#39ff88',
    '--dg-group-fill': 'rgba(255, 176, 0, 0.03)',
    '--dg-group-stroke': '#ffb000',
    '--dg-text': '#d4ffe2',
    '--dg-text-muted': '#6fbf8a',
    '--dg-border': '#1d3a24',
    '--dg-edge': '#2fd16f',
    '--dg-edge-label-bg': '#050805',
    '--dg-accent': '#39ff88',
    '--dg-badge-bg': '#39ff88',
    '--dg-badge-text': '#050805',
    '--dg-ink': '#d4ffe2',
  },
};

const ASCII: StylePreset = {
  id: 'ascii',
  label: 'ASCII',
  fontFamily: MONO,
  palette: TINTS,
  grid: 'none',
  edges: { corner: 0, dash: { solid: '5 3', dashed: '5 11' }, openArrow: true },
  cssVars: { '--dg-canvas-bg': 'var(--dg-bg)', '--dg-edge': quietEdge(62), ...asciiFrameVars() },
};

const DOS: StylePreset = {
  id: 'dos',
  label: 'DOS',
  fontFamily: MONO,
  // CGA's light colours: every one takes black text
  palette: ['#aaaaaa', '#00aaaa', '#00aa00', '#55ffff', '#ffff55', '#55ff55', '#ff55ff', '#ff5555'],
  grid: 'none',
  edges: { corner: 0 },
  cssVars: {
    '--dg-canvas-bg': '#0000aa',
    '--dg-bg': '#0000aa',
    '--dg-surface': '#aaaaaa',
    '--dg-node-fill': '#aaaaaa',
    '--dg-node-stroke': '#ffffff',
    '--dg-group-fill': 'transparent',
    '--dg-group-stroke': '#ffffff',
    '--dg-text': '#ffffff',
    '--dg-text-muted': '#55ffff',
    '--dg-border': '#5555ff',
    '--dg-edge': '#ffffff',
    '--dg-edge-label-bg': '#0000aa',
    '--dg-accent': '#ffff55',
    '--dg-badge-bg': '#ffff55',
    '--dg-badge-text': '#000000',
    '--dg-ink': '#ffffff',
  },
};

export const STYLE_PRESETS: StylePreset[] = [
  CLEAN,
  SKETCH,
  HAND_DRAWN,
  PENCIL,
  BLUEPRINT,
  MARKER,
  SOFT,
  PASTEL,
  CARDS,
  LAYERED,
  NEON,
  TERMINAL,
  ASCII,
  DOS,
];

/** Resolve a preset id; unknown/absent ids fall back to clean (crisp). */
export const stylePreset = (id?: string): StylePreset => STYLE_PRESETS.find((p) => p.id === id) ?? CLEAN;

export const isKnownStyle = (id?: string): boolean => STYLE_PRESETS.some((p) => p.id === id);
