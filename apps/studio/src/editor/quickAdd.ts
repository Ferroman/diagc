import {
  FB_CAUSE_TYPE,
  FB_EFFECT_TYPE,
  PLAN_EVENT_TYPE,
  PLAN_NOTATION,
  PLAN_ZONE_TYPE,
  TM_BOUNDARY_TYPE,
  TM_FLOW_KIND,
  TM_NOTATION,
  TM_PROCESS_TYPE,
  atOf,
  childrenOf,
  fishboneTree,
  gitGraph,
  isFishboneNode,
  isPlanEvent,
  isPlanZone,
  isSecondOrderNode,
  isThreatModelNode,
  isoOf,
  latestCommit,
  resolveContainmentPlane,
  spanOf,
  type DiagramModel,
  type DiagramNode,
  type EditorCommand,
  type NotationId,
} from '@diagc/core';
import { createNodeAt, placeTags } from '../create-node';
import { connectKind } from './connectKind';
import { addChild, isSubCause } from './fishboneActions';
import { appendCommit } from './gitActions';
import { thenWhat } from './secondOrderActions';

/** px between a source and the node `+` puts beside it (see quickAddPlaced) */
export const QUICK_ADD_GAP = 40;

export interface QuickAddContext {
  notation: NotationId | undefined;
  /** the active plane, when it keeps nodes of its own (createNodeAt's scoping) */
  plane: string | undefined;
  borrowsContainment: boolean;
  /** the pen layer new nodes and relations land on (null = base sheet) */
  penLayer: string | null;
}

export interface QuickAdd {
  /** what the `+` says it will do — the button's accessible name */
  label: string;
  /** one batch: node + relation (or node + containment); one undo step */
  command: EditorCommand;
  /** the new node's id, for selection and the label editor */
  id: string;
  /** true when the node is a sibling that can be placed beside its source;
   * false for the recipes whose notation lays the node out (fish, bands) or
   * that nest it (a process inside a boundary) */
  beside: boolean;
}

/**
 * The recipes `+` (and Tab) know. One classifier feeds both the label and the
 * command so the button can never promise one thing and dispatch another.
 *
 * Fishbone and second-order own their trees: a node that is not of their types
 * (a comment on the fish) gets nothing, because the tree would ignore whatever
 * hung on it. A threat model is a plain graph with typed elements, so a stray
 * node there falls to the generic sibling. A git graph grows at a lane's tip
 * (see gitLaneToGrow); branching and merging need a target lane the chip
 * cannot ask for, so they stay in the Git panel. A plan zone or event grows
 * its own successor (plan-next) rather than an undated sibling that would
 * fail `plan-missing` on save; any other plan node (a person, a borrowed
 * container) keeps the generic sibling.
 */
type Recipe = 'fb-category' | 'fb-cause' | 'so-then' | 'tm-flow' | 'tm-inside' | 'git-commit' | 'plan-next' | 'sibling';

const LABELS: Record<Exclude<Recipe, 'plan-next'>, string> = {
  'fb-category': 'Add a category',
  'fb-cause': 'Add a cause',
  'so-then': 'And then what?',
  'tm-flow': 'Add a flow to a new process',
  'tm-inside': 'Add a process inside',
  'git-commit': 'Add a commit',
  sibling: 'Add a connected node',
};

/** `+`'s accessible name for a recipe. Every recipe has one fixed label except
 * `plan-next`, whose text depends on what "next" means for the source — a
 * zone's successor bar or an event's successor diamond. */
function labelFor(recipe: Recipe, source: DiagramNode): string {
  return recipe === 'plan-next' ? (isPlanZone(source) ? 'Add the next zone' : 'Add the next event') : LABELS[recipe];
}

/** Bands, frames and interruptible regions: the Activity panel's own furniture,
 * drawn as strips rather than boxes, and the renderer hangs no `+` on any of
 * them (see DiagramNode's activity branches). */
const ACTIVITY_CHROME = new Set(['activity-lane', 'activity-frame', 'activity-region']);

function recipeFor(model: DiagramModel, source: DiagramNode, ctx: QuickAddContext): Recipe | undefined {
  switch (ctx.notation) {
    case 'fishbone':
      if (!isFishboneNode(source)) return undefined;
      if (source.type === FB_EFFECT_TYPE) return 'fb-category';
      // three levels below the effect is the limit (addChild's rule, read once)
      if (source.type === FB_CAUSE_TYPE && isSubCause(fishboneTree(model), source.id)) return undefined;
      return 'fb-cause';
    case 'second-order':
      return isSecondOrderNode(source) ? 'so-then' : undefined;
    case 'git-graph':
      return gitLaneToGrow(model, source, ctx.plane) === undefined ? undefined : 'git-commit';
    case TM_NOTATION:
      if (source.type === TM_BOUNDARY_TYPE) return 'tm-inside';
      return isThreatModelNode(source) ? 'tm-flow' : 'sibling';
    case PLAN_NOTATION:
      // A zone or event with no usable dates offers nothing — plan-next reads
      // `spanOf`/`atOf` below and has no fallback anchor to grow a successor
      // from. Anything else on a plan plane (a person, a borrowed container)
      // is an ordinary sibling.
      if (isPlanZone(source)) return spanOf(source) === undefined ? undefined : 'plan-next';
      if (isPlanEvent(source)) return atOf(source) === undefined ? undefined : 'plan-next';
      return 'sibling';
    default:
      // The invariant: `+` and Tab are one action, so a node the renderer
      // refuses to decorate offers nothing to Tab either. Activity chrome never
      // carries a chip, and neither does a causal-loop group — the notation
      // draws an open one as a bare name tag and arranges its members itself,
      // so "add a connected node" would have nowhere to put the result.
      if (source.type !== undefined && ACTIVITY_CHROME.has(source.type)) return undefined;
      if (ctx.notation === 'causal-loop' && childrenOf(containmentOn(model, ctx.plane)).has(source.id)) return undefined;
      return 'sibling';
  }
}

/**
 * The lane a `+` on `source` appends to: the lane itself, or the commit at a
 * lane's tip. Only the tip, because a second child of one commit on the same
 * lane is a fork — which git draws as a branch, the panel's job — and the
 * layout would stack the two circles in one column (computeColumns has no
 * collision check). A mid-lane or stray commit therefore offers nothing, and
 * so does anything that is neither lane nor commit (a stage frame, a comment).
 * `gitGraph` is the panel's own lane/tip answer, so the two cannot disagree.
 */
function gitLaneToGrow(model: DiagramModel, source: DiagramNode, plane: string | undefined): string | undefined {
  if (source.type === 'branch') return source.id;
  if (source.type !== 'commit') return undefined;
  const g = gitGraph(model, plane);
  const lane = g.laneOf.get(source.id);
  return lane !== undefined && latestCommit(g, lane)?.id === source.id ? lane : undefined;
}

/** The containment edges a view of `plane` reads: those on the plane it resolves
 * to, an untagged edge belonging to the first-declared plane. */
function containmentOn(model: DiagramModel, plane: string | undefined): DiagramModel['containment'] {
  const active = resolveContainmentPlane(model, plane);
  const defaultPlane = model.planes?.[0]?.id;
  return model.containment.filter((e) => (e.plane ?? defaultPlane) === active);
}

/** The source's parent on that plane — the first declared, the pick a reader
 * makes from the drawing (the threat model's `boundaryOf` follows the same
 * rule). */
function parentIn(model: DiagramModel, plane: string | undefined, id: string): string | undefined {
  return containmentOn(model, plane).find((e) => e.child === id)?.parent;
}

/** The tooltip alone — the cheap half, called per render of the selected node. */
export function quickAddLabel(model: DiagramModel, sourceId: string, ctx: QuickAddContext): string | undefined {
  const source = model.nodes.find((n) => n.id === sourceId);
  if (source === undefined) return undefined;
  const recipe = recipeFor(model, source, ctx);
  return recipe === undefined ? undefined : labelFor(recipe, source);
}

/** What the `+` on `sourceId` creates, or undefined when nothing applies. */
export function quickAdd(model: DiagramModel, sourceId: string, ctx: QuickAddContext): QuickAdd | undefined {
  const source = model.nodes.find((n) => n.id === sourceId);
  if (source === undefined) return undefined;
  const recipe = recipeFor(model, source, ctx);
  if (recipe === undefined) return undefined;
  const label = labelFor(recipe, source);
  switch (recipe) {
    case 'fb-category':
    case 'fb-cause': {
      const out = addChild(model, sourceId);
      return out === null ? undefined : { label, beside: false, ...out };
    }
    case 'so-then': {
      const out = thenWhat(model, sourceId, '0');
      return out === null ? undefined : { label, beside: false, ...out };
    }
    case 'git-commit': {
      const lane = gitLaneToGrow(model, source, ctx.plane);
      return lane === undefined ? undefined : { label, beside: false, ...appendCommit(model, ctx.plane, lane) };
    }
    case 'tm-inside': {
      // a boundary is containment, never a flow endpoint: the process goes in,
      // with no relation (a data-flow touching a boundary fails validation)
      const place = createNodeAt(model, { kind: 'process', plane: ctx.plane, borrowsContainment: ctx.borrowsContainment, parentId: sourceId });
      const node: DiagramNode = { id: place.id, name: '', type: TM_PROCESS_TYPE, ...placeTags(place, ctx.penLayer) };
      return {
        label,
        id: place.id,
        beside: false,
        command: { type: 'batch', commands: [{ type: 'add-node', node, ...(place.parent !== undefined ? { parent: place.parent } : {}) }] },
      };
    }
    case 'plan-next': {
      // The successor's parent is the source's own — a nested zone's next
      // zone/event stays inside the same outer zone, a root's stays a root.
      const parentId = parentIn(model, ctx.plane, sourceId);
      const outer = parentId !== undefined ? spanOf(model.nodes.find((n) => n.id === parentId)!) : undefined;
      const zone = isPlanZone(source);
      const metadata = zone
        ? (() => {
            const s = spanOf(source)!; // recipeFor only offers plan-next for a usable span
            const len = s.end - s.start + 1;
            const start = outer !== undefined ? Math.min(s.end + 1, outer.end) : s.end + 1;
            const end = outer !== undefined ? Math.min(start + len - 1, outer.end) : start + len - 1;
            return { start: isoOf(start), end: isoOf(end) };
          })()
        : (() => {
            const next = atOf(source)! + 7; // recipeFor only offers plan-next for a usable `at`
            return { at: isoOf(outer !== undefined ? Math.min(next, outer.end) : next) };
          })();
      const place = createNodeAt(model, { kind: zone ? 'zone' : 'event', plane: ctx.plane, borrowsContainment: ctx.borrowsContainment, parentId });
      // A successor copies the source's look, the same channels a sibling
      // does — a row of tinted zones stays tinted.
      const look: Partial<DiagramNode> = {
        ...(source.color !== undefined ? { color: source.color } : {}),
        ...(source.shape !== undefined ? { shape: source.shape } : {}),
        ...(source.image !== undefined ? { image: source.image } : {}),
        ...(source.icon !== undefined ? { icon: source.icon } : {}),
        ...(source.textColor !== undefined ? { textColor: source.textColor } : {}),
      };
      const node: DiagramNode = {
        id: place.id,
        name: '',
        type: zone ? PLAN_ZONE_TYPE : PLAN_EVENT_TYPE,
        ...look,
        metadata,
        ...placeTags(place, ctx.penLayer),
      };
      return {
        label,
        id: place.id,
        // the source's row: date-locked x is ignored for a root zone/event,
        // but the y is what keeps the successor beside it rather than under
        // the roster; a nested successor is arranged by the layout anyway.
        beside: true,
        command: {
          type: 'batch',
          commands: [
            { type: 'add-node', node, ...(place.parent !== undefined ? { parent: place.parent } : {}) },
            {
              type: 'add-relation',
              from: sourceId,
              to: place.id,
              opts: { kind: connectKind(ctx.notation, model, sourceId, place.id), ...(ctx.penLayer !== null ? { layer: ctx.penLayer } : {}) },
            },
          ],
        },
      };
    }
    case 'tm-flow':
    case 'sibling': {
      const place = createNodeAt(model, {
        kind: recipe === 'tm-flow' ? 'process' : 'node',
        plane: ctx.plane,
        borrowsContainment: ctx.borrowsContainment,
        parentId: parentIn(model, ctx.plane, sourceId),
      });
      // A sibling copies every look channel the source carries — type, colour,
      // silhouette, image, icon, text colour (see core's DiagramNode) — so a row
      // of Persons stays a row of Persons and a row of Lambdas a row of Lambdas,
      // instead of a stencil followed by a default box. Only the fields that are
      // actually set are copied, the way `color` alone used to be. A flow's far
      // end is a process instead: the element a data flow usually lands on.
      const type = recipe === 'tm-flow' ? TM_PROCESS_TYPE : source.type;
      const look: Partial<DiagramNode> =
        recipe !== 'sibling'
          ? {}
          : {
              ...(source.color !== undefined ? { color: source.color } : {}),
              ...(source.shape !== undefined ? { shape: source.shape } : {}),
              ...(source.image !== undefined ? { image: source.image } : {}),
              ...(source.icon !== undefined ? { icon: source.icon } : {}),
              ...(source.textColor !== undefined ? { textColor: source.textColor } : {}),
            };
      const node: DiagramNode = {
        id: place.id,
        name: '',
        ...(type !== undefined ? { type } : {}),
        ...look,
        ...placeTags(place, ctx.penLayer),
      };
      // the same kind the connect gesture would draw between these two
      const kind = recipe === 'tm-flow' ? TM_FLOW_KIND : connectKind(ctx.notation, model, sourceId, place.id);
      return {
        label,
        id: place.id,
        beside: true,
        command: {
          type: 'batch',
          commands: [
            { type: 'add-node', node, ...(place.parent !== undefined ? { parent: place.parent } : {}) },
            { type: 'add-relation', from: sourceId, to: place.id, opts: { kind, ...(ctx.penLayer !== null ? { layer: ctx.penLayer } : {}) } },
          ],
        },
      };
    }
  }
}

export interface QuickAddPlacement {
  /** elk will not place the node (manual plane) or the source is pinned on
   * this plane — either way the new node must be told where to sit */
  pinned: boolean;
  /** the source's on-screen position, parent-relative (LayoutApi.snapshotPositions);
   * undefined when it is not rendered */
  source: { x: number; y: number } | undefined;
  /** the source's footprint width: its saved size, else LEAF_SIZE.width */
  width: number;
  /** the source's saved box size (layout.sizes), when it has one */
  size?: { w: number; h: number };
  plane: string | undefined;
}

/**
 * Where a sibling lands: to the source's right, QUICK_ADD_GAP away, same row —
 * and at the source's size when the source was given one.
 *
 * The position is added only when one is needed at all — in an automatic plane
 * with an unpinned source, elk places the connected node itself, and pinning it
 * there would be the one box the next arrangement cannot move (addNode's
 * manual-plane rule, plus the pinned-source case so a node added beside a
 * hand-placed one stays beside it). Positions are parent-relative on both sides,
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
  if (out.beside && p.pinned && p.source !== undefined) {
    extra.push({
      type: 'set-position',
      nodeId: out.id,
      x: p.source.x + p.width + QUICK_ADD_GAP,
      y: p.source.y,
      ...(p.plane !== undefined ? { plane: p.plane } : {}),
    });
  }
  if (out.beside && p.size !== undefined) {
    extra.push({ type: 'set-size', nodeId: out.id, w: p.size.w, h: p.size.h });
  }
  if (extra.length === 0) return out.command;
  const commands = out.command.type === 'batch' ? out.command.commands : [out.command];
  return { type: 'batch', commands: [...commands, ...extra] };
}
