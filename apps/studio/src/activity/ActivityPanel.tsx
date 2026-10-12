import { useState } from 'react';
import {
  ACTIVITY_ACTION_TYPE,
  ACTIVITY_BAR_TYPE,
  ACTIVITY_DECISION_TYPE,
  ACTIVITY_END_TYPE,
  ACTIVITY_LANE_TYPE,
  ACTIVITY_NOTE_TYPE,
  ACTIVITY_OBJECT_TYPE,
  ACTIVITY_RECEIVE_TYPE,
  ACTIVITY_REGION_TYPE,
  ACTIVITY_SEND_TYPE,
  ACTIVITY_START_TYPE,
  bestLaneOrder,
  containmentOn,
  containmentPlaneOf,
  defined,
  uniqueNodeId,
  type DiagramNode,
  type EditorCommand,
} from '@diagc/core/internal';
import { ACTIVITY_LAYOUT } from '@diagc/renderer';
import { ColorRow } from '../inspector/pickers';
import { DockSection } from '../dock/DockSection';
import type { DraftField } from '../inspector/useDraftField';
import { activityContext, reorderLanesCommand } from './activityLanes';
import type { NotationPanelProps } from '../notations/types';

type ActivityPanelProps = Pick<NotationPanelProps, 'model' | 'viewPlane' | 'selection' | 'onCommand' | 'onSelect'>;

/** quick-add vocabulary: accessible label + created type + default name */
const ELEMENTS = [
  { type: ACTIVITY_ACTION_TYPE, label: 'Add action', defaultName: 'Action' },
  { type: ACTIVITY_DECISION_TYPE, label: 'Add decision', defaultName: '' },
  { type: ACTIVITY_BAR_TYPE, label: 'Add bar', defaultName: '' },
  { type: ACTIVITY_START_TYPE, label: 'Add start', defaultName: '' },
  { type: ACTIVITY_END_TYPE, label: 'Add end', defaultName: '' },
  { type: ACTIVITY_SEND_TYPE, label: 'Add send signal', defaultName: 'Signal' },
  { type: ACTIVITY_RECEIVE_TYPE, label: 'Add receive signal', defaultName: 'Signal' },
  { type: ACTIVITY_OBJECT_TYPE, label: 'Add object', defaultName: 'Object' },
  { type: ACTIVITY_NOTE_TYPE, label: 'Add note', defaultName: 'Note' },
] as const;

/**
 * The activity-diagram editing surface: the frame's lanes as a list (select,
 * restack, add), then quick-adds for the steps inside one. Every add parents the
 * node correctly at creation and places it at a deterministic cascade spot
 * inside its scope, so the model never passes through a state validation would
 * refuse — no drag-into-container needed.
 */
export function ActivityPanel({ model, viewPlane, selection, onCommand, onSelect }: ActivityPanelProps) {
  const [laneName, setLaneName] = useState('');
  const [laneColor, setLaneColor] = useState('');
  const [elementName, setElementName] = useState('');

  const planeId = containmentPlaneOf(model, viewPlane);
  const context = activityContext(model, selection, planeId);
  if (context === undefined) return null;
  const { frame, target } = context;
  const withPlane = defined({ plane: planeId });

  const inPlane = containmentOn(model, planeId);
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
    .filter((n): n is DiagramNode => n?.type === ACTIVITY_LANE_TYPE);
  const selectedId = selection?.kind === 'node' ? selection.id : undefined;
  const moveLane = (laneId: string, offset: -1 | 1) => {
    onCommand({ type: 'move-child', parent: frame.id, child: laneId, offset, ...withPlane });
  };

  // The order whose links cross the fewest lanes (bestLaneOrder) — offered,
  // never applied unasked: lane order says who comes first.
  const tidy = reorderLanesCommand(
    frame.id,
    lanes.map((l) => l.id),
    bestLaneOrder(model, frame.id, viewPlane),
    planeId,
  );

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
        type: ACTIVITY_LANE_TYPE,
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

  return (
    <DockSection id="activity" title="Activity" label="Activity diagram" className="sidebar git-panel">
      <LanesSection
        frame={frame}
        lanes={lanes}
        current={(lane) => lane.id === selectedId || lane.id === target?.id}
        name={[laneName, setLaneName]}
        color={[laneColor, setLaneColor]}
        tidy={tidy}
        onSelect={onSelect}
        onMove={moveLane}
        onAdd={addLane}
        onCommand={onCommand}
      />
      <ElementsSection
        target={target}
        hasLanes={lanes.length > 0}
        name={[elementName, setElementName]}
        onAdd={addElement}
      />
    </DockSection>
  );
}

const label = (n: DiagramNode) => (n.name !== '' ? n.name : n.id);

/** The frame's lanes as a list (select, restack), a row to add one, and the tidy restack. */
function LanesSection({
  frame,
  lanes,
  current,
  name: [laneName, setLaneName],
  color: [laneColor, setLaneColor],
  tidy,
  onSelect,
  onMove,
  onAdd,
  onCommand,
}: {
  frame: DiagramNode;
  lanes: DiagramNode[];
  /** the lane the selection is in, or is */
  current: (lane: DiagramNode) => boolean;
  name: DraftField;
  color: DraftField;
  /** the restack that crosses the fewest lanes, null when the order already is it */
  tidy: EditorCommand | null;
  onSelect: (id: string) => void;
  onMove: (laneId: string, offset: -1 | 1) => void;
  onAdd: () => void;
  onCommand: (command: EditorCommand) => void;
}) {
  return (
    <section className="panel-section">
      <h3>Lanes in {label(frame)}</h3>
      {lanes.length === 0 ? (
        <p className="lp-caption">No lanes yet. Add the first one below.</p>
      ) : (
        <ul className="activity-lanes" aria-label="Lanes">
          {lanes.map((lane, i) => (
            <li key={lane.id} aria-current={current(lane) ? 'true' : undefined}>
              <span
                className="lane-dot"
                style={lane.color !== undefined ? { background: lane.color } : undefined}
                aria-hidden="true"
              />
              <button type="button" className="lane-name" title="Select this lane" onClick={() => onSelect(lane.id)}>
                {label(lane)}
              </button>
              <button
                type="button"
                className="picker-btn"
                aria-label={`Move ${label(lane)} up`}
                title="Move up"
                disabled={i === 0}
                onClick={() => onMove(lane.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="picker-btn"
                aria-label={`Move ${label(lane)} down`}
                title="Move down"
                disabled={i === lanes.length - 1}
                onClick={() => onMove(lane.id, 1)}
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
          onAdd();
        }}
      >
        <input
          aria-label="New lane name"
          value={laneName}
          onChange={(e) => setLaneName(e.target.value)}
          placeholder="New lane name"
        />
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
  );
}

/** Quick-adds for the steps inside the target lane or region. */
function ElementsSection({
  target,
  hasLanes,
  name: [elementName, setElementName],
  onAdd,
}: {
  target: DiagramNode | undefined;
  hasLanes: boolean;
  name: DraftField;
  onAdd: (type: string, defaultName: string) => void;
}) {
  return (
    <section className="panel-section">
      <h3>Elements</h3>
      {target === undefined ? (
        <p className="lp-caption">{hasLanes ? 'Select a lane to add steps to it.' : 'Add a lane, then its steps.'}</p>
      ) : (
        <>
          <p className="lp-caption">Adding to {label(target)}</p>
          <input
            aria-label="Element name"
            value={elementName}
            onChange={(e) => setElementName(e.target.value)}
            placeholder="Name (optional)"
          />
          {ELEMENTS.map((el) => (
            <button key={el.type} type="button" className="chip" onClick={() => onAdd(el.type, el.defaultName)}>
              {el.label}
            </button>
          ))}
          {target.type === ACTIVITY_LANE_TYPE && (
            <button type="button" className="chip" onClick={() => onAdd(ACTIVITY_REGION_TYPE, 'Region')}>
              Add region
            </button>
          )}
        </>
      )}
    </section>
  );
}
