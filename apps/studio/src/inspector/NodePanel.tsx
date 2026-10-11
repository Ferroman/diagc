import { useEffect, useRef, useState } from 'react';
import {
  PLAN_TYPES,
  strideFor,
  type DiagramModel,
  type DiagramNode,
  type EditorCommand,
  type NotationId,
  type Point,
} from '@diagc/core/internal';
import { CommentsSection } from './CommentsSection';
import { LinksSection } from './LinksSection';
import { DetailFields, IdentityFields, LookFields, PlacementFields } from './NodeFields';
import {
  ActionsSection,
  MembershipsSection,
  MetadataSection,
  planeName,
  PositionSection,
  useMetadataDraft,
  usePositionDraft,
} from './NodeSections';
import { PlanSection } from '../notations/plan/PlanSection';
import { ThreatsSection } from './ThreatsSection';
import { studioNotation } from '../notations';
import { carriesThreats, threatsOffered } from './threatsOffered';
import { useDraftField } from './useDraftField';

interface NodePanelProps {
  model: DiagramModel;
  nodeId: string;
  activePlane: string | undefined;
  /** node has a saved position in the active plane's layout bucket */
  hasSavedPosition?: boolean;
  /** the node's saved position in the active plane (parent-relative flow px) */
  savedPosition?: Point;
  /** where the node sits on screen when it has NO saved position — the inputs'
   * placeholder, so typing a coordinate starts from something real */
  live?: Point;
  /** focus + select the name input on mount (a node was just added) */
  autoFocusName?: boolean;
  /** active plane's notation; gates the Threats and Plan sections (see threatsOffered, `planSection`) */
  notation?: NotationId;
  /** the host's date, YYYY-MM-DD: seeds a Type-field retype into plan-zone/
   * plan-event with dates the way a canvas drop would (seedOnRetype); omitted
   * (e.g. a test harness with nothing plan-shaped to seed) just skips seeding.
   * Optional only so the panel's own tests can render without it — the
   * inspector dock (InspectorDock) always passes it, and a caller that forgets
   * it loses seeding silently, with no error, since commitType's
   * `today !== undefined` check just skips. */
  today?: string;
  onCommand: (command: EditorCommand) => void;
  onClose: () => void;
  onDeleted: () => void;
}

/** The Plan section is offered on the notation, and kept on a node that already
 * carries dates so switching the plane's look strands nothing. Every date key
 * counts, `end` included — half a span is reachable (clear Start here, or
 * hand-edit the source) and is exactly the state the section exists to finish. */
const offersPlanDates = (notation: NotationId | undefined, node: DiagramNode): boolean =>
  (studioNotation(notation).planSection === true ||
    node.metadata?.start !== undefined ||
    node.metadata?.end !== undefined ||
    node.metadata?.at !== undefined) &&
  PLAN_TYPES.has(node.type ?? '');

export function NodePanel({
  model,
  nodeId,
  activePlane,
  hasSavedPosition = false,
  savedPosition,
  live,
  autoFocusName = false,
  notation,
  today,
  onCommand,
  onClose,
  onDeleted,
}: NodePanelProps) {
  const node = model.nodes.find((n) => n.id === nodeId);

  // The panel holds every draft, so each lives exactly as long as the panel
  // (remounted per node, key={nodeId}) whatever its section does. The effects
  // run in this order: the position inputs', the name's focus, each text box's
  // resync (see useDraftField), the metadata rows'.
  const position = usePositionDraft(savedPosition);

  // Just-added node: put the caret straight into the name, text selected, so
  // typing replaces the placeholder. The panel remounts per node (key=nodeId),
  // so running on mount only is exactly once per add.
  const nameInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocusName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = useDraftField(node?.name, 'keep');
  const type = useDraftField(node?.type);
  const icon = useDraftField(node?.icon);
  const shape = useDraftField(node?.shape);
  const technology = useDraftField(node?.technology);
  const link = useDraftField(node?.link);
  const description = useDraftField(node?.description);
  const metadata = useMetadataDraft(node?.metadata);
  const addParent = useState('');
  const addPlane = useState('');

  if (node === undefined) {
    return <aside className="sidebar muted">Node not found.</aside>;
  }

  return (
    <aside className="sidebar node-panel">
      <div className="panel-head">
        <h2>Edit node</h2>
        <button className="chip icon-btn" aria-label="Close panel" title="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="muted">
        <code>{node.id}</code> · plane <code>{planeName(model, activePlane)}</code>
      </p>
      <IdentityFields
        model={model}
        node={node}
        activePlane={activePlane}
        today={today}
        name={name}
        type={type}
        nameInputRef={nameInputRef}
        onCommand={onCommand}
      />
      <PlacementFields model={model} node={node} activePlane={activePlane} onCommand={onCommand} />
      <LookFields node={node} icon={icon} shape={shape} onCommand={onCommand} />
      <DetailFields node={node} technology={technology} link={link} description={description} onCommand={onCommand} />

      <LinksSection nodeId={node.id} links={node.links ?? []} onCommand={onCommand} />

      <PositionSection
        node={node}
        activePlane={activePlane}
        hasSavedPosition={hasSavedPosition}
        savedPosition={savedPosition}
        live={live}
        position={position}
        onCommand={onCommand}
      />

      <MetadataSection node={node} draft={metadata} onCommand={onCommand} />

      {/* Threats are a generic field, so the section is offered on the notation
       * — but a node that already carries threats keeps it whatever the plane
       * is drawn as, or turning the notation off would strand them. */}
      {threatsOffered(notation, carriesThreats(node)) && (
        <ThreatsSection
          target={{ node: node.id }}
          threats={node.threats ?? []}
          applicable={strideFor(node.type)}
          onCommand={onCommand}
        />
      )}

      <CommentsSection target={{ node: node.id }} comments={node.comments ?? []} onCommand={onCommand} />

      {offersPlanDates(notation, node) && <PlanSection model={model} node={node} onCommand={onCommand} />}

      <MembershipsSection model={model} node={node} parent={addParent} plane={addPlane} onCommand={onCommand} />

      <ActionsSection model={model} node={node} onCommand={onCommand} onDeleted={onDeleted} />
    </aside>
  );
}
