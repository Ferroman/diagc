import {
  containmentOn,
  containmentPlaneOf,
  defined,
  type DiagramModel,
  type DiagramNode,
  type EditorCommand,
  type NotationId,
} from '@diagc/core/internal';
import type { CreateNodePlace } from './create-node';

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

/** The node a `+` (or Tab) was pressed on, and where. */
export interface QuickAddSource {
  model: DiagramModel;
  source: DiagramNode;
  ctx: QuickAddContext;
  /** the kind the connect gesture would draw from the source to `to` */
  kindTo: (to: string) => string;
}

/**
 * One recipe: the label the `+` shows and the add it makes. One classifier
 * hands out both, so the button can never promise one thing and dispatch
 * another; the add is built only when it runs, since the label is asked on
 * every render of the selected node.
 */
export interface QuickAddRecipe {
  label: string;
  build: () => Omit<QuickAdd, 'label'> | undefined;
}

/** A notation's (or the activity's) recipes, as one answer per source: the
 * recipe that applies, `'none'` when `+` offers nothing there, or undefined to
 * leave the source to the generic sibling. */
export type QuickAddRecipes = (src: QuickAddSource) => QuickAddRecipe | 'none' | undefined;

/** The source's parent in the containment a view of `plane` reads — the first
 * declared, the pick a reader makes from the drawing (the threat model's
 * `boundaryOf` follows the same rule). */
export function parentIn(model: DiagramModel, plane: string | undefined, id: string): string | undefined {
  return containmentOn(model, containmentPlaneOf(model, plane)).find((e) => e.child === id)?.parent;
}

/** The look channels a new node copies from its source — colour, silhouette,
 * image, icon, text colour (see core's DiagramNode), only those actually set —
 * so a row of tinted or iconed boxes stays one look. */
export const lookOf = (source: DiagramNode): Partial<DiagramNode> =>
  defined({
    color: source.color,
    shape: source.shape,
    image: source.image,
    icon: source.icon,
    textColor: source.textColor,
  });

/** One batch: the new node where `place` puts it, and a relation of `kind`
 * from the source to it on the pen layer — one undo step. */
export function addConnected(
  { source, ctx }: QuickAddSource,
  node: DiagramNode,
  place: CreateNodePlace,
  kind: string,
): EditorCommand {
  return {
    type: 'batch',
    commands: [
      { type: 'add-node', node, ...defined({ parent: place.parent }) },
      {
        type: 'add-relation',
        from: source.id,
        to: place.id,
        opts: defined({ kind, layer: ctx.penLayer ?? undefined }),
      },
    ],
  };
}
