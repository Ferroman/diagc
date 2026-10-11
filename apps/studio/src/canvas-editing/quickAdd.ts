import {
  defined,
  type DiagramModel,
  type DiagramNode,
  type EditorCommand,
  type Point,
  type Size,
} from '@diagc/core/internal';
import type { QuickAddSide } from '@diagc/renderer';
import { activityQuickAdd } from '../activity/quickAdd';
import { connectKind, studioNotation } from '../notations';
import { createNodeAt, placeTags } from './create-node';
import {
  addConnected,
  lookOf,
  parentIn,
  type QuickAdd,
  type QuickAddContext,
  type QuickAddRecipe,
  type QuickAddSource,
} from './quickAddRecipe';

export type { QuickAdd, QuickAddContext } from './quickAddRecipe';

/** px between a source and the node `+` puts beside it (see quickAddPlaced) */
export const QUICK_ADD_GAP = 40;

/** The generic `+`: a connected sibling in the source's container. It copies
 * the source's type and look, so a row of Persons stays a row of Persons and a
 * row of Lambdas a row of Lambdas, instead of a stencil followed by a default
 * box, and its relation is the kind the connect gesture would draw. */
function sibling(src: QuickAddSource): QuickAddRecipe {
  const { model, source, ctx } = src;
  return {
    label: 'Add a connected node',
    build: () => {
      const place = createNodeAt(model, {
        kind: 'node',
        plane: ctx.plane,
        borrowsContainment: ctx.borrowsContainment,
        parentId: parentIn(model, ctx.plane, source.id),
      });
      const node: DiagramNode = {
        id: place.id,
        name: '',
        ...defined({ type: source.type }),
        ...lookOf(source),
        ...placeTags(place, ctx.penLayer),
      };
      return { id: place.id, beside: true, command: addConnected(src, node, place, src.kindTo(place.id)) };
    },
  };
}

/**
 * The recipe `+` (and Tab) offers on a source, in a fixed order: the activity's
 * rules (keyed by node type, on any plane); then nothing for a `side`, which
 * only a lane's `+` has; then the notation's own recipes; then the generic
 * sibling.
 */
function recipeFor(
  model: DiagramModel,
  source: DiagramNode,
  ctx: QuickAddContext,
  side?: QuickAddSide,
): QuickAddRecipe | undefined {
  const src: QuickAddSource = {
    model,
    source,
    ctx,
    kindTo: (to) => connectKind(ctx.notation, model, source.id, to),
  };
  const activity = activityQuickAdd(src, side);
  if (activity !== undefined) return activity === 'none' ? undefined : activity;
  if (side !== undefined) return undefined;
  const own = studioNotation(ctx.notation).quickAdd?.(src);
  if (own !== undefined) return own === 'none' ? undefined : own;
  return sibling(src);
}

/** The tooltip alone — the cheap half, called per render of the selected node. */
export function quickAddLabel(
  model: DiagramModel,
  sourceId: string,
  ctx: QuickAddContext,
  side?: QuickAddSide,
): string | undefined {
  const source = model.nodes.find((n) => n.id === sourceId);
  return source === undefined ? undefined : recipeFor(model, source, ctx, side)?.label;
}

/** What the `+` on `sourceId` creates, or undefined when nothing applies. */
export function quickAdd(
  model: DiagramModel,
  sourceId: string,
  ctx: QuickAddContext,
  side?: QuickAddSide,
): QuickAdd | undefined {
  const source = model.nodes.find((n) => n.id === sourceId);
  const recipe = source === undefined ? undefined : recipeFor(model, source, ctx, side);
  const out = recipe?.build();
  return recipe === undefined || out === undefined ? undefined : { label: recipe.label, ...out };
}

export interface QuickAddPlacement {
  /** elk will not place the node (manual plane) or the source has a saved
   * position on this plane — either way the new node must be told where to sit */
  needsPosition: boolean;
  /** the source's on-screen position, parent-relative (LayoutApi.snapshotPositions);
   * undefined when it is not rendered */
  source: Point | undefined;
  /** the source's footprint width: its saved size, else LEAF_SIZE.width */
  width: number;
  /** the source's saved box size (layout.sizes), when it has one */
  size?: Size;
  plane: string | undefined;
}

/**
 * Where a sibling lands: to the source's right, QUICK_ADD_GAP away, same row —
 * and at the source's size when the source was given one.
 *
 * The position is added only when one is needed at all — in an automatic plane
 * with a source that has no saved position, elk places the connected node
 * itself, and saving one for it there would make it the one box the next
 * arrangement cannot move (addNode's manual-plane rule, plus the saved-source
 * case so a node added beside a hand-placed one stays beside it). Positions are parent-relative on both sides,
 * so the rule holds for siblings inside a container.
 *
 * The size is not tied to that: sizes live outside any plane and a resized
 * stencil (the library's icons are resized all the time) should breed
 * same-sized siblings whether or not elk owns the arrangement. Both join the
 * add's batch: one undo step. Notation recipes (`beside: false`) get neither —
 * there the notation's own layout decides.
 */
export function quickAddPlaced(out: QuickAdd, p: QuickAddPlacement): EditorCommand {
  const extra: EditorCommand[] = [];
  if (out.beside && p.needsPosition && p.source !== undefined) {
    extra.push({
      type: 'set-position',
      nodeId: out.id,
      x: p.source.x + p.width + QUICK_ADD_GAP,
      y: p.source.y,
      ...defined({ plane: p.plane }),
    });
  }
  if (out.beside && p.size !== undefined) {
    extra.push({ type: 'set-size', nodeId: out.id, w: p.size.w, h: p.size.h });
  }
  if (extra.length === 0) return out.command;
  const commands = out.command.type === 'batch' ? out.command.commands : [out.command];
  return { type: 'batch', commands: [...commands, ...extra] };
}
