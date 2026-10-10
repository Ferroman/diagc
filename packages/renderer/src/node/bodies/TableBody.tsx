import { TableNode } from '../TableNode';
import type { BodyProps } from './types';

/** An ER table: its header, rows and ports are TableNode's own. */
export function TableBody({ id, data, selected, parts }: BodyProps) {
  // The table draws its own header, so no other body ever places `name` for it:
  // hand the rename field over, or double-click and a dropped Table stencil
  // would flip `labelEditing` with nothing on screen to type into.
  return (
    <TableNode
      id={id}
      data={data}
      selected={selected}
      titleEditor={data.labelEditing === true ? parts.name : undefined}
    />
  );
}
