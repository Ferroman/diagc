import {
  buildHierarchy,
  presetLayers,
  relationLayer,
  relationOnPlane,
  scopeToRoot,
  type DiagramModel,
  type LegendItem,
  type LegendPosition,
  type LegendSection,
  type NotationId,
} from '@diagc/core/internal';
import { Canvas, type Cell, type Style } from './canvas';
import { typeMark } from './content';
import { DOWN, LEFT, RIGHT, type Glyphs, type Weight } from './glyphs';
import { accentCss, CORNER, rgb, WEIGHT } from './paint';
import type { Scene } from './scene';
import { KIND_LOOKS, kindLook, TYPE_LOOKS, typeLook, type EndMark, type KindLook, type TypeLook } from './vocabulary';
import { cellWidth, fitCells, printable } from './width';

// The legend in text: the browser's key (packages/renderer/src/legend/legendRows.ts)
// for what a terminal draws. The same sections in the same order, the same rule for
// keying a diagram that declared none, items that recaption a derived row; each swatch
// is drawn the way the picture draws what it stands for. Nothing the picture leaves
// out (a threat badge, a drawing) is keyed, nor a layer that is off: no row here can
// switch one on, and the TUI's title row lists the layers with their keys.

export interface LegendRow {
  /** `${section}:${key}`, which an item that names the same kind or type recaptions */
  id: string;
  /** `SWATCH` cells */
  swatch: string;
  style: Style;
  label: string;
  /** a shape, a line or a mark that says nothing about itself on the canvas: one such
   * row is what offers a legend on a diagram that declared none */
  vocabulary?: true;
}

export interface TextLegend {
  title: string;
  position: LegendPosition;
  /** the diagram asked for it; one it did not ask for is only offered (the TUI's `L`) */
  declared: boolean;
  /** the sections with rows, each under the browser's title for it */
  sections: { title: string; rows: LegendRow[] }[];
}

/** What the legend is read from: a scene, before its legend is added to it. */
type Keyed = Pick<Scene, 'input' | 'view' | 'nodes' | 'notation'>;

/** A swatch's cells: three, the width of a line with a mark at each end. */
const SWATCH = 3;

const TITLES: Record<LegendSection | 'items', string> = {
  layers: 'Layers',
  kinds: 'Connections',
  types: 'Elements',
  marks: 'Marks',
  items: 'Notes',
};

/** What a legend with no `show` derives; the types are keyed only where they need it. */
const DEFAULT_SECTIONS: readonly LegendSection[] = ['layers', 'kinds', 'marks'];

const MARKS = { pk: ['PK', 'Primary key'], fk: ['FK', 'Foreign key column'] } as const;

const DIM: Style = { dim: true };

/** `text` in the middle of the swatch's cells. */
function centre(text: string): string {
  const left = Math.max(0, (SWATCH - cellWidth(text)) >> 1);
  return `${' '.repeat(left)}${text}${' '.repeat(Math.max(0, SWATCH - left - cellWidth(text)))}`;
}

const colour = (css: string | undefined): Style => {
  const fg = rgb(css);
  return fg === undefined ? {} : { fg };
};

/** Each key with its value where every entry for it agrees, else undefined: a swatch
 * takes a colour only when all it stands for are drawn in that colour. */
function agreed(entries: Iterable<readonly [string, string | undefined]>): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  for (const [key, value] of entries) {
    if (!out.has(key)) out.set(key, value);
    else if (out.get(key) !== value) out.set(key, undefined);
  }
  return out;
}

/** The vocabulary's own order first (an authored one), then unknown ids alphabetically:
 * never the order things are met in, which would reshuffle the key at every fold. */
function ordered(ids: Iterable<string>, known: readonly string[]): string[] {
  const rank = new Map(known.map((k, i) => [k, i] as const));
  const at = (id: string): number => rank.get(id) ?? known.length;
  return [...ids].sort((a, b) => at(a) - at(b) || a.localeCompare(b));
}

/** A line as the picture draws one of the kind: its weight, then its ends' marks. */
function lineSwatch(look: KindLook, glyphs: Glyphs): string {
  const line = glyphs.line(LEFT | RIGHT, WEIGHT[look.line]);
  const end = (mark: EndMark | undefined, toward: 'left' | 'right'): string =>
    mark === undefined || mark === 'none' ? line : mark === 'arrow' ? glyphs.arrow(toward) : glyphs.mark(mark);
  return `${end(look.start, 'left')}${line}${end(look.end, 'right')}`;
}

/** A box of the type as the picture draws it: the mark its name follows where it has
 * one, else the top of its border, which carries its corners and its dashes. */
function shapeSwatch(type: string | undefined, look: TypeLook, glyphs: Glyphs): string {
  const mark = typeMark(type, look.shape, glyphs);
  if (mark !== undefined) return centre(mark);
  const weight: Weight = look.shape === 'bar' ? 'heavy' : look.dashed === true ? 'dashed' : 'light';
  const corner = CORNER[look.shape];
  return `${glyphs.line(DOWN | RIGHT, weight, corner)}${glyphs.line(LEFT | RIGHT, weight)}${glyphs.line(DOWN | LEFT, weight, corner)}`;
}

const vocabulary = (caption: string | undefined): { vocabulary?: true } =>
  caption !== undefined ? { vocabulary: true } : {};

/** The layers something in this view carries, folded away or not: what the plane holds,
 * or a drill's inside. The browser's rule (legendRows' `drawableSlice`), so a layer's row
 * does not come and go as its boxes fold. */
function carriedLayers({ model, plane, root }: { model: DiagramModel; plane?: string; root?: string }): Set<string> {
  const hierarchy = buildHierarchy(model, plane);
  const viewed = plane ?? model.planes[0]?.id;
  const visible = new Set(hierarchy.childrenOf.keys());
  const { nodes, relations } =
    root !== undefined && hierarchy.childrenOf.has(root)
      ? scopeToRoot(model, hierarchy, root).model
      : {
          nodes: model.nodes.filter((n) => visible.has(n.id)),
          relations: model.relations.filter((r) => visible.has(r.from) && visible.has(r.to)),
        };
  const carried = new Set<string>();
  for (const n of nodes) {
    if (n.layer !== undefined) carried.add(n.layer);
    for (const c of n.columns ?? []) if (c.layer !== undefined) carried.add(c.layer);
  }
  // the effective layer: one a `layerRules` entry puts a relation on counts as a tag does
  for (const r of relations) {
    const layer = relationOnPlane(r, viewed) ? relationLayer(model, r) : undefined;
    if (layer !== undefined) carried.add(layer);
  }
  return carried;
}

function layerRows(scene: Keyed, glyphs: Glyphs): LegendRow[] {
  const { model, plane, layers } = scene.input;
  const carried = carriedLayers(scene.input);
  const on = new Set(layers ?? presetLayers(model.planes, plane));
  return model.layers
    .filter((l) => carried.has(l.id) && on.has(l.id))
    .map((l) => ({
      id: `layers:${l.id}`,
      swatch: centre(glyphs.mark('square')),
      style: colour(l.tint),
      label: printable(l.name),
    }));
}

function kindRows(scene: Keyed, glyphs: Glyphs): LegendRow[] {
  // the layer's tint, not a relation's own colour: that is one arrow's, not the kind's
  const inks = agreed(scene.view.edges.map((e) => [e.kind, e.tint] as const));
  return ordered(inks.keys(), Object.keys(KIND_LOOKS)).map((kind) => {
    const look = kindLook({ kind }, scene.notation);
    return {
      id: `kinds:${kind}`,
      swatch: lineSwatch(look, glyphs),
      style: colour(inks.get(kind)),
      label: look.legend ?? printable(kind),
      ...vocabulary(look.legend),
    };
  });
}

function typeRows(scene: Keyed, glyphs: Glyphs): LegendRow[] {
  const { model } = scene.input;
  const accents = agreed(
    [...scene.nodes.values()].flatMap((vn) =>
      vn.node.type === undefined ? [] : [[vn.node.type, accentCss(model, vn.node, scene.notation)] as const],
    ),
  );
  return ordered(accents.keys(), Object.keys(TYPE_LOOKS)).map((type) => {
    const look = typeLook(type, scene.notation);
    // `label: ''` keeps a glyph type's box free of a subtitle; it is not a caption
    const label = look.legend ?? (look.label === undefined || look.label === '' ? printable(type) : look.label);
    return {
      id: `types:${type}`,
      swatch: shapeSwatch(type, look, glyphs),
      style: colour(accents.get(type)),
      label,
      ...vocabulary(look.legend),
    };
  });
}

/** A table's key columns, which the picture tags `PK` and `FK`. */
function markRows(scene: Keyed): LegendRow[] {
  const seen = new Set<keyof typeof MARKS>();
  for (const vn of scene.nodes.values()) {
    if (typeLook(vn.node.type, scene.notation).shape !== 'table') continue;
    for (const c of vn.columns ?? vn.node.columns ?? []) {
      if (c.pk === true) seen.add('pk');
      else if (c.fk === true) seen.add('fk');
    }
  }
  return (Object.keys(MARKS) as (keyof typeof MARKS)[])
    .filter((m) => seen.has(m))
    .map((m) => ({ id: `marks:${m}`, swatch: centre(MARKS[m][0]), style: {}, label: MARKS[m][1], vocabulary: true }));
}

/** The hand-written rows. One naming a kind or a type already keyed recaptions that row
 * in place, keeping its swatch; the rest are rows of their own. */
function itemRows(
  items: readonly LegendItem[],
  derived: LegendRow[],
  notation: NotationId | undefined,
  glyphs: Glyphs,
) {
  return items.flatMap((item, i): LegendRow[] => {
    const label = printable(item.label);
    const target = item.kind !== undefined ? `kinds:${item.kind}` : item.type !== undefined ? `types:${item.type}` : '';
    const hit = derived.find((r) => r.id === target);
    if (hit !== undefined) {
      hit.label = label;
      if (item.color !== undefined) hit.style = colour(item.color);
      return [];
    }
    const swatch =
      item.kind !== undefined
        ? lineSwatch(kindLook({ kind: item.kind }, notation), glyphs)
        : item.type !== undefined
          ? shapeSwatch(item.type, typeLook(item.type, notation), glyphs)
          : item.color !== undefined
            ? centre(glyphs.mark('square'))
            : centre('');
    return [{ id: `items:${i}`, swatch, style: colour(item.color), label }];
  });
}

/** The legend of a scene: the one its diagram declares, or the one it is offered for
 * what its picture cannot say; none when there is nothing to key. */
export function legendOf(scene: Keyed, glyphs: Glyphs): TextLegend | undefined {
  const config = scene.input.model.legend ?? {};
  const shown = config.show ?? DEFAULT_SECTIONS;
  // As the browser: an explicit `show` to the letter; without one, types only where the
  // box says nothing of its own — elsewhere a box prints its type and the key repeats it.
  const types = shown.includes('types')
    ? typeRows(scene, glyphs)
    : config.show === undefined
      ? typeRows(scene, glyphs).filter((r) => r.vocabulary === true)
      : [];
  const derived: Record<LegendSection, LegendRow[]> = {
    layers: shown.includes('layers') ? layerRows(scene, glyphs) : [],
    kinds: shown.includes('kinds') ? kindRows(scene, glyphs) : [],
    types,
    marks: shown.includes('marks') ? markRows(scene) : [],
  };
  const items = itemRows(config.items ?? [], [...derived.kinds, ...derived.types], scene.notation, glyphs);
  const sections = (['layers', 'kinds', 'types', 'marks', 'items'] as const)
    .map((s) => ({ title: TITLES[s], rows: s === 'items' ? items : derived[s] }))
    .filter((s) => s.rows.length > 0);
  const declared = scene.input.model.legend !== undefined;
  if (sections.length === 0) return undefined;
  if (!declared && !sections.some((s) => s.rows.some((r) => r.vocabulary === true))) return undefined;
  return {
    title: printable(config.title ?? 'Legend'),
    position: config.position ?? 'bottom-right',
    declared,
    sections,
  };
}

interface Line {
  swatch?: { text: string; style: Style };
  text: string;
  style: Style;
}

const linesOf = (legend: TextLegend): Line[] =>
  legend.sections.flatMap((s) => [
    { text: s.title, style: DIM },
    ...s.rows.map((r) => ({ swatch: { text: r.swatch, style: r.style }, text: r.label, style: {} })),
  ]);

const lineWidth = (line: Line): number => (line.swatch === undefined ? 0 : SWATCH + 1) + cellWidth(line.text);

/** The cells the framed legend needs: its lines with a border and a cell of padding
 * each side, and its title in the top border. */
export function legendSize(legend: TextLegend): { width: number; height: number } {
  const lines = linesOf(legend);
  return {
    width: Math.max(Math.max(...lines.map(lineWidth)) + 4, cellWidth(legend.title) + 6),
    height: lines.length + 2,
  };
}

/** The legend framed, its title in the top border as an open container's is. In less
 * room than it needs its labels are cut and its last line says how many are left out. */
export function legendCells(legend: TextLegend, glyphs: Glyphs, room = legendSize(legend)): Cell[][] {
  const natural = legendSize(legend);
  const width = Math.min(natural.width, room.width);
  const height = Math.min(natural.height, room.height);
  const canvas = new Canvas(width, height);
  canvas.rect({ x: 0, y: 0, width, height }, 'light', DIM);
  canvas.text({ x: 2, y: 0 }, ` ${legend.title} `, { bold: true }, width - 2);
  const lines = linesOf(legend);
  const inside = Math.max(0, height - 2);
  const shown =
    lines.length <= inside
      ? lines
      : [...lines.slice(0, inside - 1), { text: `${glyphs.ellipsis} ${lines.length - inside + 1} more`, style: DIM }];
  const maxX = width - 2;
  shown.forEach((line, i) => {
    let x = 2;
    if (line.swatch !== undefined) {
      canvas.text({ x, y: i + 1 }, line.swatch.text, line.swatch.style, maxX);
      x += SWATCH + 1;
    }
    canvas.text({ x, y: i + 1 }, fitCells(line.text, maxX - x, glyphs.ellipsis), line.style, maxX);
  });
  return canvas.cells(glyphs);
}
