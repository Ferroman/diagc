import { useState } from 'react';
import {
  resolveContainmentPlane,
  uniqueNodeId,
  type DiagramModel,
  type DiagramNode,
  type EditorCommand,
} from '@diagramming/core';
import { ACTIVITY_LAYOUT } from '@diagramming/renderer';
import type { DiagramSelection } from '@diagramming/renderer';
import { ColorRow } from './pickers';
import { DockSection } from '../DockSection';

interface ActivityPanelProps {
  model: DiagramModel;
  plane: string | undefined;
  selection: DiagramSelection | null;
  onCommand: (command: EditorCommand) => void;
  onSelect: (id: string) => void;
}

const SCOPE_TYPES = new Set(['activity-frame', 'activity-lane', 'activity-region']);

/** quick-add vocabulary: accessible label + created type + default name */
const ELEMENTS = [
  { type: 'activity-action', label: 'Add action', defaultName: 'Action' },
  { type: 'activity-decision', label: 'Add decision', defaultName: '' },
  { type: 'activity-bar', label: 'Add bar', defaultName: '' },
  { type: 'activity-start', label: 'Add start', defaultName: '' },
  { type: 'activity-end', label: 'Add end', defaultName: '' },
  { type: 'activity-send', label: 'Add send signal', defaultName: 'Signal' },
  { type: 'activity-receive', label: 'Add receive signal', defaultName: 'Signal' },
  { type: 'activity-object', label: 'Add object', defaultName: 'Object' },
  { type: 'activity-note', label: 'Add note', defaultName: 'Note' },
] as const;

export function isActivityScope(model: DiagramModel, selection: DiagramSelection | null): DiagramNode | undefined {
  if (selection?.kind !== 'node') return undefined;
  const n = model.nodes.find((x) => x.id === selection.id);
  return n !== undefined && n.type !== undefined && SCOPE_TYPES.has(n.type) ? n : undefined;
}

/**
 * The activity-diagram editing surface: scaffolds the structure (frame → lane
 * → elements/region) as single batches, sidestepping drag-into-container
 * entirely. Every add parents the node correctly at creation and places it at
 * a deterministic cascade spot inside its scope, so the model never passes
 * through a state validation would refuse.
 */
export function ActivityPanel({ model, plane, selection, onCommand, onSelect }: ActivityPanelProps) {
  const [laneName, setLaneName] = useState('');
  const [laneColor, setLaneColor] = useState('');
  const [elementName, setElementName] = useState('');

  const selected = isActivityScope(model, selection);
  if (selected === undefined) return null;
  const planeId = resolveContainmentPlane(model, plane);
  const withPlane = planeId !== undefined ? { plane: planeId } : {};

  const childCount = model.containment.filter(
    (e) => e.parent === selected.id && (e.plane ?? resolveContainmentPlane(model, undefined)) === planeId,
  ).length;
  const L = ACTIVITY_LAYOUT;
  const cascade = { x: L.LANE_STRIP_W + L.PAD + 24 * childCount, y: L.PAD + 16 * childCount };

  const addChild = (node: DiagramNode) => {
    onCommand({
      type: 'batch',
      commands: [
        { type: 'add-node', node, parent: { id: selected.id, ...withPlane } },
        { type: 'set-position', nodeId: node.id, x: cascade.x, y: cascade.y, ...withPlane },
      ],
    });
    onSelect(node.id);
  };

  const addLane = () => {
    const name = laneName.trim();
    if (name === '') return;
    addChild({
      id: uniqueNodeId(model, name),
      name,
      type: 'activity-lane',
      ...(laneColor !== '' ? { color: laneColor } : {}),
    });
    setLaneName('');
  };

  const addElement = (type: string, defaultName: string) => {
    const name = elementName.trim() !== '' ? elementName.trim() : defaultName;
    const idBase = name !== '' ? name : type.replace('activity-', '');
    addChild({ id: uniqueNodeId(model, idBase), name, type });
    setElementName('');
  };

  return (
    <DockSection id="activity" title="Activity" label="Activity diagram" className="sidebar git-panel">
      {selected.type === 'activity-frame' ? (
        <section className="panel-section">
          <h3>Lanes</h3>
          <input aria-label="New lane name" value={laneName} onChange={(e) => setLaneName(e.target.value)} placeholder="Lane name" />
          <ColorRow label="Lane color" value={laneColor} onChange={setLaneColor} />
          <button type="button" className="chip" onClick={addLane} disabled={laneName.trim() === ''}>
            Add lane
          </button>
        </section>
      ) : (
        <section className="panel-section">
          <h3>Elements</h3>
          <input aria-label="Element name" value={elementName} onChange={(e) => setElementName(e.target.value)} placeholder="Name (optional)" />
          {ELEMENTS.map((el) => (
            <button key={el.type} type="button" className="chip" onClick={() => addElement(el.type, el.defaultName)}>
              {el.label}
            </button>
          ))}
          {selected.type === 'activity-lane' && (
            <button type="button" className="chip" onClick={() => addElement('activity-region', 'Region')}>
              Add region
            </button>
          )}
        </section>
      )}
    </DockSection>
  );
}
