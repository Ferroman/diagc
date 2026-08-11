import type { DiagramModel, EditorCommand } from '@diagramming/core';

/**
 * Commands for a connect gesture that starts on a db-table column handle: an
 * `fk` relation (fromColumn = the dragged column, toColumn = the target's PK if
 * any) and — unless the column is already flagged — a `set-table-columns` that
 * marks it `fk`. Returns null when the source isn't a db-table column, so the
 * caller falls back to its default edge.
 */
export function fkConnectionCommands(
  model: DiagramModel,
  from: string,
  to: string,
  sourceHandle: string | null | undefined,
  opts?: { layer?: string },
): EditorCommand[] | null {
  const src = model.nodes.find((n) => n.id === from);
  if (src?.type !== 'db-table' || src.columns === undefined) return null;
  const col = src.columns.find((c) => c.name === sourceHandle);
  if (col === undefined) return null;
  const toPk = model.nodes.find((n) => n.id === to)?.columns?.find((c) => c.pk === true)?.name;
  const cmds: EditorCommand[] = [
    {
      type: 'add-relation',
      from,
      to,
      opts: {
        kind: 'fk',
        fromColumn: col.name,
        ...(toPk !== undefined ? { toColumn: toPk } : {}),
        ...(opts?.layer !== undefined ? { layer: opts.layer } : {}),
      },
    },
  ];
  if (col.fk !== true) {
    cmds.push({
      type: 'set-table-columns',
      id: from,
      columns: src.columns.map((c) => (c.name === col.name ? { ...c, fk: true } : c)),
    });
  }
  return cmds;
}
