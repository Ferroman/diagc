import {
  SM_STATE_TYPE,
  defined,
  nextFreeId,
  type DiagramModel,
  type EditorCommand,
  type SmType,
} from '@diagc/core/internal';
import { DEFAULT_TYPE_STYLES } from '@diagc/renderer';

/** What a glyph is called where it has no name of its own: its legend entry. */
export const glyphLabel = (type: string): string => DEFAULT_TYPE_STYLES[type]?.legendLabel ?? type;

/**
 * The command that adds one `type` inside `parentId` (top level when absent),
 * with the next free `<type>-<n>` id. `plane` tags both the node and its
 * containment edge, the way quick add does, so a plane's own nodes stay on it.
 * A state starts named "State", as quick add names it; every other vertex starts
 * unnamed — a pseudo-state reads by its glyph, and the app opens a box's name
 * for typing.
 */
export function addSmElement(
  model: DiagramModel,
  type: SmType,
  parentId: string | undefined,
  plane: string | undefined,
): { command: EditorCommand; id: string } {
  const id = nextFreeId(`${type}-`, new Set(model.nodes.map((n) => n.id)));
  return {
    id,
    command: {
      type: 'add-node',
      node: { id, name: type === SM_STATE_TYPE ? 'State' : '', type, ...defined({ plane }) },
      ...(parentId !== undefined ? { parent: defined({ id: parentId, plane }) } : {}),
    },
  };
}
