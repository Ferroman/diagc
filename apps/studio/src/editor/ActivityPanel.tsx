import { useState } from 'react';
import {
  bestLaneOrder,
  resolveContainmentPlane,
  uniqueNodeId,
  type DiagramModel,
  type DiagramNode,
  type EditorCommand,
} from '@diagc/core';
import { ACTIVITY_LAYOUT } from '@diagc/renderer';
import type { DiagramSelection } from '@diagc/renderer';
import { ColorRow } from './pickers';
import { DockSection } from '../DockSection';

interface ActivityPanelProps {
  model: DiagramModel;
  plane: string | undefined;
  selection: DiagramSelection | null;
  onCommand: (command: EditorCommand) => void;
  onSelect: (id: string) => void;
}

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

/**
 * The move-child steps that restack a frame's lanes from `current` into
 * `target`, as one undo step — or null when the orders already agree. Each lane
 * in turn is walked up into its slot, so the batch replays exactly on the model
 * the panel saw.
 */
export function reorderLanesCommand(frameId: string, current: readonly string[], target: readonly string[], plane: string | undefined): EditorCommand | null {
  const order = [...current];
  const commands: EditorCommand[] = [];
  target.forEach((lane, slot) => {
    for (let at = order.indexOf(lane); at > slot; at--) {
      commands.push({ type: 'move-child', parent: frameId, child: lane, offset: -1, ...(plane !== undefined ? { plane } : {}) });
      [order[at - 1], order[at]] = [order[at]!, order[at - 1]!];
    }
  });
  if (commands.length === 0) return null;
  return commands.length === 1 ? commands[0]! : { type: 'batch', commands };
}

/** A lane moved `offset` band slots (a canvas drag can cross several at once)
 * as one undo step: move-child steps a single slot, so it repeats. null for no
 * move at all. */
export function moveLaneCommand(frameId: string, laneId: string, offset: number, plane: string | undefined): EditorCommand | null {
  if (offset === 0) return null;
  const step: EditorCommand = {
    type: 'move-child',
    parent: frameId,
    child: laneId,
    offset: offset < 0 ? -1 : 1,
    ...(plane !== undefined ? { plane } : {}),
  };
  const n = Math.abs(offset);
  return n === 1 ? step : { type: 'batch', commands: Array.from({ length: n }, () => step) };
}

export interface ActivityContext {
  frame: DiagramNode;
  /** where an element quick-add lands: the selected lane or region, or the one
   * around the selected element; undefined on the frame itself */
  target?: DiagramNode;
}

/**
 * The frame the panel works on, and the lane or region it adds into. Anything
 * inside a frame resolves to it — an action as much as a lane — so the lanes stay
 * listed while you work on their contents. With nothing selected a diagram's only
 * frame is the one; with several, a selection has to say which.
 */
export function activityContext(model: DiagramModel, selection: DiagramSelection | null, planeId: string | undefined): ActivityContext | undefined {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const defaultPlane = resolveContainmentPlane(model, undefined);
  const parentOf = new Map<string, string>();
  for (const e of model.containment) {
    if ((e.plane ?? defaultPlane) === planeId && !parentOf.has(e.child)) parentOf.set(e.child, e.parent);
  }
  if (selection?.kind === 'node') {
    let target: DiagramNode | undefined;
    const seen = new Set<string>();
    for (let n = byId.get(selection.id); n !== undefined && !seen.has(n.id); n = byId.get(parentOf.get(n.id) ?? '')) {
      seen.add(n.id);
      if (n.type === 'activity-frame') return { frame: n, ...(target !== undefined ? { target } : {}) };
      if (target === undefined && (n.type === 'activity-lane' || n.type === 'activity-region')) target = n;
    }
  }
  const frames = model.nodes.filter((n) => n.type === 'activity-frame' && (n.plane === undefined || n.plane === planeId));
  return frames.length === 1 ? { frame: frames[0]! } : undefined;
}

/**
 * The activity-diagram editing surface: the frame's lanes as a list (select,
 * restack, add), then quick-adds for the steps inside one. Every add parents the
 * node correctly at creation and places it at a deterministic cascade spot
 * inside its scope, so the model never passes through a state validation would
 * refuse — no drag-into-container needed.
 */
export function ActivityPanel({ model, plane, selection, onCommand, onSelect }: ActivityPanelProps) {
  const [laneName, setLaneName] = useState('');
  const [laneColor, setLaneColor] = useState('');
  const [elementName, setElementName] = useState('');

  const planeId = resolveContainmentPlane(model, plane);
  const context = activityContext(model, selection, planeId);
  if (context === undefined) return null;
  const { frame, target } = context;
  const withPlane = planeId !== undefined ? { plane: planeId } : {};

  const inPlane = model.containment.filter((e) => (e.plane ?? resolveContainmentPlane(model, undefined)) === planeId);
  const L = ACTIVITY_LAYOUT;
  const cascadeIn = (parentId: string) => {
    const childCount = inPlane.filter((e) => e.parent === parentId).length;
    return { x: L.LANE_STRIP_W + L.PAD + 24 * childCount, y: L.PAD + 16 * childCount };
  };

  // Bands stack in containment order (the frame's children, top to bottom),
  // so restacking a lane is a move-child on that order — the layout follows.
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const lanes = inPlane
    .filter((e) => e.parent === frame.id)
    .map((e) => byId.get(e.child))
    .filter((n): n is DiagramNode => n?.type === 'activity-lane');
  const selectedId = selection?.kind === 'node' ? selection.id : undefined;
  const moveLane = (laneId: string, offset: -1 | 1) => {
    onCommand({ type: 'move-child', parent: frame.id, child: laneId, offset, ...withPlane });
  };

  // The order whose links cross the fewest lanes (bestLaneOrder) — offered,
  // never applied unasked: lane order says who comes first.
  const tidy = reorderLanesCommand(frame.id, lanes.map((l) => l.id), bestLaneOrder(model, frame.id, plane), planeId);

  const addChild = (node: DiagramNode, parentId: string) => {
    const cascade = cascadeIn(parentId);
    onCommand({
      type: 'batch',
      commands: [
        { type: 'add-node', node, parent: { id: parentId, ...withPlane } },
        { type: 'set-position', nodeId: node.id, x: cascade.x, y: cascade.y, ...withPlane },
      ],
    });
    onSelect(node.id);
  };

  const addLane = () => {
    const name = laneName.trim();
    if (name === '') return;
    addChild(
      {
        id: uniqueNodeId(model, name),
        name,
        type: 'activity-lane',
        ...(laneColor !== '' ? { color: laneColor } : {}),
      },
      frame.id,
    );
    setLaneName('');
  };

  const addElement = (type: string, defaultName: string) => {
    if (target === undefined) return;
    const name = elementName.trim() !== '' ? elementName.trim() : defaultName;
    const idBase = name !== '' ? name : type.replace('activity-', '');
    addChild({ id: uniqueNodeId(model, idBase), name, type }, target.id);
    setElementName('');
  };

  const label = (n: DiagramNode) => (n.name !== '' ? n.name : n.id);

  return (
    <DockSection id="activity" title="Activity" label="Activity diagram" className="sidebar git-panel">
      <section className="panel-section">
        <h3>Lanes in {label(frame)}</h3>
        {lanes.length === 0 ? (
          <p className="lp-caption">No lanes yet. Add the first one below.</p>
        ) : (
          <ul className="activity-lanes" aria-label="Lanes">
            {lanes.map((lane, i) => (
              <li key={lane.id} aria-current={lane.id === selectedId || lane.id === target?.id ? 'true' : undefined}>
                <span className="lane-dot" style={lane.color !== undefined ? { background: lane.color } : undefined} aria-hidden="true" />
                <button type="button" className="lane-name" title="Select this lane" onClick={() => onSelect(lane.id)}>
                  {label(lane)}
                </button>
                <button type="button" className="picker-btn" aria-label={`Move ${label(lane)} up`} title="Move up" disabled={i === 0} onClick={() => moveLane(lane.id, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  className="picker-btn"
                  aria-label={`Move ${label(lane)} down`}
                  title="Move down"
                  disabled={i === lanes.length - 1}
                  onClick={() => moveLane(lane.id, 1)}
                >
                  ↓
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="field-row"
          onSubmit={(e) => {
            e.preventDefault();
            addLane();
          }}
        >
          <input aria-label="New lane name" value={laneName} onChange={(e) => setLaneName(e.target.value)} placeholder="New lane name" />
          <button type="submit" className="chip" disabled={laneName.trim() === ''}>
            Add lane
          </button>
        </form>
        <ColorRow label="Lane color" value={laneColor} onChange={setLaneColor} />
        {lanes.length > 2 && (
          <button
            type="button"
            className="chip"
            onClick={() => tidy !== null && onCommand(tidy)}
            disabled={tidy === null}
            title="Restack the lanes so links cross as few other lanes as possible"
          >
            Tidy lane order
          </button>
        )}
      </section>
      <section className="panel-section">
        <h3>Elements</h3>
        {target === undefined ? (
          <p className="lp-caption">{lanes.length === 0 ? 'Add a lane, then its steps.' : 'Select a lane to add steps to it.'}</p>
        ) : (
          <>
            <p className="lp-caption">Adding to {label(target)}</p>
            <input aria-label="Element name" value={elementName} onChange={(e) => setElementName(e.target.value)} placeholder="Name (optional)" />
            {ELEMENTS.map((el) => (
              <button key={el.type} type="button" className="chip" onClick={() => addElement(el.type, el.defaultName)}>
                {el.label}
              </button>
            ))}
            {target.type === 'activity-lane' && (
              <button type="button" className="chip" onClick={() => addElement('activity-region', 'Region')}>
                Add region
              </button>
            )}
          </>
        )}
      </section>
    </DockSection>
  );
}
