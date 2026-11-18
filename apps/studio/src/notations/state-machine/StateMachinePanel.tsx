import { useMemo } from 'react';
import {
  SM_MACHINE_TYPE,
  SM_REGION_TYPE,
  SM_STATE_TYPE,
  SM_TYPES,
  SM_ZONE_TYPE,
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
import type { DiagramSelection } from '@diagc/renderer';
import { parentIn } from '../../canvas-editing/quickAddRecipe';
import { DockSection } from '../../dock/DockSection';
import { IssueList } from '../IssueList';
import type { NotationPanelProps } from '../types';
import { addSmElement, glyphLabel } from './smActions';

type StateMachinePanelProps = Pick<
  NotationPanelProps,
  'model' | 'viewPlane' | 'scopePlane' | 'selection' | 'onCommand' | 'onCreated'
> & {
  editing: boolean;
  /** a row selects a node; an issue may name a transition */
  onSelect: (selection: DiagramSelection) => void;
  /** open a folded state so a substate or region added to it shows */
  onUnfold: (id: string) => void;
};

// exported so the test derives its expectation from this value rather than a magic pixel literal
export const INDENT = 12;

const PSEUDO_TYPES = SM_TYPES.filter(isPseudoState);

/**
 * Where "Add state" and the pseudo-state buttons put the new vertex: into a
 * selected machine, zone or region; beside a selected state or pseudo-state, in its
 * parent on the plane in view (so adding twice — the new state is selected once
 * made — gives two siblings, not one inside the other; "Add substate" nests); with
 * nothing selected, into the plane's machine when it has exactly one; otherwise
 * at top level.
 */
function addParent(model: DiagramModel, plane: string | undefined, selected: string | undefined): string | undefined {
  const type = model.nodes.find((n) => n.id === selected)?.type;
  if (selected !== undefined && (type === SM_MACHINE_TYPE || type === SM_REGION_TYPE || type === SM_ZONE_TYPE)) {
    return selected;
  }
  if (selected !== undefined && isStateMachineType(type)) return parentIn(model, plane, selected);
  const inScope = nodeScopeOn(model, plane);
  const machines = model.nodes.filter((n) => n.type === SM_MACHINE_TYPE && inScope(n));
  return machines.length === 1 ? machines[0]!.id : undefined;
}

/**
 * The machine "Add zone" divides: the selected one, the one that holds the
 * selected zone (so adding twice gives two zones side by side), else the plane's
 * machine when it has exactly one. A zone sits directly in a machine, so with
 * anything else selected, or several machines and none chosen, there is nowhere
 * to put one.
 */
function zoneParent(model: DiagramModel, plane: string | undefined, selected: string | undefined): string | undefined {
  const type = model.nodes.find((n) => n.id === selected)?.type;
  if (selected !== undefined && type === SM_MACHINE_TYPE) return selected;
  if (selected !== undefined && type === SM_ZONE_TYPE) return parentIn(model, plane, selected);
  return addParent(model, plane, undefined);
}

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
 * editing — buttons that add a vertex where `addParent` says. Names are
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
  onUnfold,
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

  const selected = selection?.kind === 'node' ? selection.id : undefined;
  const selectedType = model.nodes.find((n) => n.id === selected)?.type;
  const parent = addParent(model, viewPlane, selected);
  const machineForZone = zoneParent(model, viewPlane, selected);
  const add = (type: SmType, parentId: string | undefined) => {
    const made = addSmElement(model, type, parentId, { node: scopePlane, edge: viewPlane });
    onCommand(made.command);
    // a state given its first substate or region turns composite, and a
    // composite rests folded: open it, or the new node is not drawn
    if (parentId !== undefined && parentId === selected && selectedType === SM_STATE_TYPE) onUnfold(parentId);
    onSelect({ kind: 'node', id: made.id });
    onCreated(made.id);
  };

  return (
    <DockSection id="state-machine" title="State machine" className="sidebar so-panel">
      <IssueList model={model} issues={issues} selects="elements" label="Issues" onSelect={onSelect} />
      {rows.length === 0 ? <p className="so-hint">No machine yet.</p> : null}
      <ul className="sm-rows" aria-label="Machine">
        {rows.map(({ id, name, depth }) => (
          <li key={id} style={{ paddingLeft: `${depth * INDENT}px` }}>
            <button
              type="button"
              className="link-btn"
              aria-label={`Select ${name}`}
              onClick={() => onSelect({ kind: 'node', id })}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
      {editing ? (
        <div className="sm-add" role="group" aria-label="Add">
          <button type="button" onClick={() => add(SM_MACHINE_TYPE, undefined)}>
            Add machine
          </button>
          <button type="button" onClick={() => add(SM_STATE_TYPE, parent)}>
            Add state
          </button>
          <button type="button" disabled={selectedType !== SM_STATE_TYPE} onClick={() => add(SM_STATE_TYPE, selected)}>
            Add substate
          </button>
          <button
            type="button"
            disabled={selectedType !== SM_STATE_TYPE && selectedType !== SM_MACHINE_TYPE}
            onClick={() => add(SM_REGION_TYPE, selected)}
          >
            Add region
          </button>
          <button
            type="button"
            disabled={machineForZone === undefined}
            onClick={() => add(SM_ZONE_TYPE, machineForZone)}
          >
            Add zone
          </button>
          {PSEUDO_TYPES.map((type) => (
            <button key={type} type="button" onClick={() => add(type, parent)}>
              {`Add ${glyphLabel(type).toLowerCase()}`}
            </button>
          ))}
        </div>
      ) : null}
    </DockSection>
  );
}
