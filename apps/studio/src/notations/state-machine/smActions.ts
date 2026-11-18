import {
  SM_STATE_TYPE,
  SM_ZONE_TYPE,
  defined,
  nextFreeId,
  type DiagramModel,
  type EditorCommand,
  type SmType,
} from '@diagc/core/internal';
import { DEFAULT_TYPE_STYLES } from '@diagc/renderer';

/** What a glyph is called where it has no name of its own: its legend entry. */
export const glyphLabel = (type: string): string => DEFAULT_TYPE_STYLES[type]?.legendLabel ?? type;

const START_NAME: Partial<Record<SmType, string>> = { [SM_STATE_TYPE]: 'State', [SM_ZONE_TYPE]: 'Zone' };

/**
 * The command that adds one `type` inside `parentId` (top level when absent),
 * with the next free `<type>-<n>` id. `planes.node` tags the node (only a plane
 * with nodes of its own; a borrowing plane adds a shared node), `planes.edge` its
 * containment edge (always the plane in view, which resolves to the donor's
 * hierarchy when it borrows) — the split createNodeAt makes for quick add.
 * A state starts named "State", as quick add names it, and a zone "Zone": a zone
 * is its title. Every other vertex starts
 * unnamed — a pseudo-state reads by its glyph, and the app opens a box's name
 * for typing.
 */
export function addSmElement(
  model: DiagramModel,
  type: SmType,
  parentId: string | undefined,
  planes: { node?: string | undefined; edge?: string | undefined },
): { command: EditorCommand; id: string } {
  const id = nextFreeId(`${type}-`, new Set(model.nodes.map((n) => n.id)));
  return {
    id,
    command: {
      type: 'add-node',
      node: { id, name: START_NAME[type] ?? '', type, ...defined({ plane: planes.node }) },
      ...(parentId !== undefined ? { parent: defined({ id: parentId, plane: planes.edge }) } : {}),
    },
  };
}
