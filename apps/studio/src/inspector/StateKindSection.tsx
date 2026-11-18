import { SM_STATE_TYPE, STATE_KINDS, type DiagramNode, type EditorCommand, type StateKind } from '@diagc/core/internal';
import { STATE_KIND_LABEL } from '@diagc/renderer';

/** the select's value for "no kind" */
const NONE = '';

/** How a state is going, which colours it: a good end, a failure, a wait, or
 * nothing. Offered on a state only; the state's own colour still wins. */
export function StateKindSection({
  node,
  onCommand,
}: {
  node: DiagramNode;
  onCommand: (command: EditorCommand) => void;
}) {
  if (node.type !== SM_STATE_TYPE) return null;
  return (
    <section className="panel-section">
      <h3>Kind</h3>
      <select
        aria-label="State kind"
        value={node.stateKind ?? NONE}
        onChange={(e) =>
          onCommand({
            type: 'set-node-details',
            id: node.id,
            details: { stateKind: e.target.value === NONE ? null : (e.target.value as StateKind) },
          })
        }
      >
        <option value={NONE}>None</option>
        {STATE_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {STATE_KIND_LABEL[kind]}
          </option>
        ))}
      </select>
    </section>
  );
}
