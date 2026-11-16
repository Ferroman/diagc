import { useMemo } from 'react';
import {
  SM_MACHINE_TYPE,
  SM_REGION_TYPE,
  SM_STATE_TYPE,
  SM_TYPES,
  containmentOn,
  containmentPlaneOf,
  diagramWarnings,
  isPseudoState,
  isStateMachineType,
  nodeScopeOn,
  viewedPlane,
  type DiagramModel,
  type SmType,
} from '@diagc/core/internal';
import { DockSection } from '../../dock/DockSection';
import { IssueList } from '../IssueList';
import type { NotationPanelProps } from '../types';
import { addSmElement, glyphLabel } from './smActions';

type StateMachinePanelProps = Pick<
  NotationPanelProps,
  'model' | 'viewPlane' | 'scopePlane' | 'selection' | 'onCommand' | 'onSelect' | 'onCreated'
> & { editing: boolean };

// exported so the test derives its expectation from this value rather than a magic pixel literal
export const INDENT = 12;

const PSEUDO_TYPES = SM_TYPES.filter(isPseudoState);
/** the vertices that hold others: where an add lands when one is selected */
const CONTAINERS: readonly string[] = [SM_MACHINE_TYPE, SM_STATE_TYPE, SM_REGION_TYPE];

/** The machines on `plane` and everything below them, in containment order. */
function treeRows(model: DiagramModel, plane: string | undefined): { id: string; name: string; depth: number }[] {
  const inScope = nodeScopeOn(model, plane);
  const nodes = new Map(model.nodes.filter((n) => isStateMachineType(n.type) && inScope(n)).map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  for (const edge of containmentOn(model, containmentPlaneOf(model, plane))) {
    if (!nodes.has(edge.parent) || !nodes.has(edge.child)) continue;
    children.set(edge.parent, [...(children.get(edge.parent) ?? []), edge.child]);
  }
  const rows: { id: string; name: string; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number): void => {
    const node = nodes.get(id);
    // a plane may list one child twice; a cycle is validation's to report
    if (node === undefined || seen.has(id)) return;
    seen.add(id);
    rows.push({ id, name: node.name !== '' ? node.name : glyphLabel(node.type ?? ''), depth });
    for (const child of children.get(id) ?? []) walk(child, depth + 1);
  };
  for (const node of nodes.values()) if (node.type === SM_MACHINE_TYPE) walk(node.id, 0);
  return rows;
}

/**
 * The state machine's dock panel: what validation objects to (unreachable
 * states first, the likeliest slip), the machine as a nested list, and — while
 * editing — buttons that add a vertex inside whatever is selected. Names are
 * edited on the canvas or in Properties; a row only selects.
 */
export function StateMachinePanel({
  model,
  viewPlane,
  scopePlane,
  selection,
  onCommand,
  onSelect,
  onCreated,
  editing,
}: StateMachinePanelProps) {
  const rows = useMemo(() => treeRows(model, viewPlane), [model, viewPlane]);
  const issues = useMemo(() => {
    // the core words a plane into each message on a model that has planes; the
    // viewed plane is the only one this panel's picture shows
    const at = (model.planes ?? []).length > 0 ? ` on plane '${viewedPlane(model.planes ?? [], viewPlane)?.id}'` : '';
    const mine = diagramWarnings(model).filter((i) => i.code.startsWith('sm-') && i.message.endsWith(at));
    return [...mine.filter((i) => i.code === 'sm-unreachable'), ...mine.filter((i) => i.code !== 'sm-unreachable')];
  }, [model, viewPlane]);

  const selectedType = selection?.kind === 'node' ? model.nodes.find((n) => n.id === selection.id)?.type : undefined;
  const parent =
    selection !== null && selectedType !== undefined && CONTAINERS.includes(selectedType) ? selection.id : undefined;
  const add = (type: SmType, parentId: string | undefined) => {
    const made = addSmElement(model, type, parentId, scopePlane);
    onCommand(made.command);
    onSelect(made.id);
    onCreated(made.id);
  };

  return (
    <DockSection id="state-machine" title="State machine" className="sidebar so-panel">
      <IssueList
        model={model}
        issues={issues}
        selects="nodes"
        label="Issues"
        onSelect={(target) => onSelect(target.id)}
      />
      {rows.length === 0 ? <p className="so-hint">No machine yet.</p> : null}
      <ul className="plan-rows" aria-label="Machine">
        {rows.map(({ id, name, depth }) => (
          <li key={id} style={{ paddingLeft: `${depth * INDENT}px` }}>
            <button type="button" className="link-btn" aria-label={`Select ${name}`} onClick={() => onSelect(id)}>
              {name}
            </button>
          </li>
        ))}
      </ul>
      {editing ? (
        <div className="so-answers" role="group" aria-label="Add">
          <button type="button" onClick={() => add(SM_MACHINE_TYPE, undefined)}>
            Add machine
          </button>
          <button type="button" onClick={() => add(SM_STATE_TYPE, parent)}>
            Add state
          </button>
          <button
            type="button"
            disabled={selectedType !== SM_STATE_TYPE && selectedType !== SM_MACHINE_TYPE}
            onClick={() => add(SM_REGION_TYPE, parent)}
          >
            Add region
          </button>
          {PSEUDO_TYPES.map((type) => (
            <button key={type} type="button" disabled={parent === undefined} onClick={() => add(type, parent)}>
              {`Add ${glyphLabel(type).toLowerCase()}`}
            </button>
          ))}
        </div>
      ) : null}
    </DockSection>
  );
}
