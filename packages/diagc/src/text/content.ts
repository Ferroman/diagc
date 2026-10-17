import {
  ACTIVITY_END_TYPE,
  FB_EFFECT_TYPE,
  type Column,
  type NotationId,
  type ViewEdge,
  type ViewNode,
} from '@diagc/core/internal';
import type { Glyphs } from './glyphs';
import { subtitleOf, typeLook, type TextShape } from './vocabulary';
import { cellWidth, fitCells, printable, wrapCells } from './width';

/** The cells a name or subtitle wraps at: about what a browser box shows on a line. */
export const NAME_WRAP = 28;

/** The cells an edge label is cut to: the renderer's edge chip ellipsises near here,
 * and a terminal has less room than a canvas, not more. */
export const LABEL_MAX = 32;

/** An open container's title is one line in its top border; past this it is cut. */
const TITLE_MAX = 60;

export interface BoxLine {
  text: string;
  role: 'title' | 'subtitle' | 'row' | 'note';
}

/** What a box holds and the cells it needs, border included. */
export interface BoxText {
  lines: BoxLine[];
  width: number;
  height: number;
  shape: TextShape;
  dashed: boolean;
}

export interface BoxContext {
  notation?: NotationId;
  /** a container's direct children on the plane, for a folded one's note */
  inside: number;
  glyphs: Glyphs;
}

/** The mark a glyph type's name follows, which is what a legend keys it by. */
export function typeMark(type: string | undefined, shape: TextShape, glyphs: Glyphs): string | undefined {
  if (shape === 'diamond') return glyphs.decision;
  if (type === ACTIVITY_END_TYPE) return glyphs.end;
  // an activity's start, a git commit: the dot is the element, the name a caption
  if (shape === 'dot') return glyphs.start;
  return undefined;
}

const markOf = (vn: ViewNode, shape: TextShape, glyphs: Glyphs): string | undefined =>
  vn.external !== undefined ? glyphs.external : typeMark(vn.node.type, shape, glyphs);

/** A table's rows: a key column when any row is a key, names padded so the types
 * line up in one column. */
function columnRows(columns: readonly Column[]): BoxLine[] {
  const keyed = columns.some((c) => c.pk === true || c.fk === true);
  const nameWidth = Math.max(0, ...columns.map((c) => cellWidth(printable(c.name))));
  return columns.map((c) => {
    const key = !keyed ? '' : c.pk === true ? 'PK ' : c.fk === true ? 'FK ' : '   ';
    const own = printable(c.name);
    const name = c.type === undefined ? own : `${own}${' '.repeat(nameWidth - cellWidth(own))}  ${printable(c.type)}`;
    return { text: `${key}${name}`, role: 'row' as const };
  });
}

/** The cells a box's lines need with its border and a cell of padding each side. */
const widthOf = (lines: readonly BoxLine[]): number => Math.max(...lines.map((l) => cellWidth(l.text))) + 4;

export function boxText(vn: ViewNode, ctx: BoxContext): BoxText {
  const look = typeLook(vn.node.type, ctx.notation);
  const dashed = look.dashed === true || vn.external !== undefined;
  // A table's header is its name alone, as the renderer draws it: the rows say what it is.
  const subtitle = printable(look.shape === 'table' ? '' : subtitleOf(vn.node, ctx.notation));
  if (vn.state === 'expanded') {
    // one line in the border: a name's own line breaks become spaces there
    const own = printable(vn.node.name);
    const title = fitCells(subtitle === '' ? own : `${own} ${subtitle}`, TITLE_MAX, ctx.glyphs.ellipsis);
    return {
      lines: [{ text: title, role: 'title' }],
      width: cellWidth(title) + 6,
      height: 3,
      shape: look.shape,
      dashed,
    };
  }
  const mark = markOf(vn, look.shape, ctx.glyphs);
  const name = mark === undefined ? vn.node.name : vn.node.name === '' ? mark : `${mark} ${vn.node.name}`;
  // A name keeps its own line breaks (the studio's name field takes them), each line
  // wrapped on its own. A fishbone's head is one line, as on the page: it names the
  // whole fish, where wrapping would leave a word on a line of its own.
  const lines: BoxLine[] =
    vn.node.type === FB_EFFECT_TYPE
      ? [{ text: fitCells(printable(name), TITLE_MAX, ctx.glyphs.ellipsis), role: 'title' }]
      : name
          .split(/\r?\n/)
          .flatMap((line) => wrapCells(printable(line), NAME_WRAP))
          .map((text) => ({ text, role: 'title' }));
  for (const text of subtitle === '' ? [] : wrapCells(subtitle, NAME_WRAP)) lines.push({ text, role: 'subtitle' });
  const columns = look.shape === 'table' ? (vn.columns ?? vn.node.columns ?? []) : [];
  lines.push(...columnRows(columns));
  if (vn.state === 'collapsed') lines.push({ text: `${ctx.glyphs.folded} ${ctx.inside} inside`, role: 'note' });
  // a cylinder's lid and a table's rule under its title each take a row
  const extra = look.shape === 'cylinder' || columns.length > 0 ? 1 : 0;
  return { lines, width: widthOf(lines), height: lines.length + 2 + extra, shape: look.shape, dashed };
}

/** What an edge says beside its line: the relation's labels, or an aggregate's own
 * label, then a causal link's polarity and delay. Cut to `LABEL_MAX`. */
export function edgeText(edge: ViewEdge, glyphs: Glyphs): string {
  const said =
    edge.constituents.length === 1
      ? (edge.labels ?? [])
          .map((l) => printable(l.text).trim())
          .filter((t) => t !== '')
          .join(' / ')
      : printable(edge.label ?? '');
  const parts = [said];
  if (edge.polarity !== undefined) parts.push(`(${edge.polarity})`);
  if (edge.delay === true) parts.push(glyphs.delay);
  return fitCells(parts.filter((p) => p !== '').join(' '), LABEL_MAX, glyphs.ellipsis);
}
