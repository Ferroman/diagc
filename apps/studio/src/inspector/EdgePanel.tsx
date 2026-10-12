import { useMemo, useState } from 'react';
import { crossings, strideFor, type DiagramModel, type EditorCommand, type NotationId } from '@diagc/core/internal';
import { notationProfile } from '@diagc/renderer';
import { getHost } from '../host';
import { CommentsSection } from './CommentsSection';
import { DescriptionField, KindField, LabelsSection, LayerField, MarkFields, StyleSection } from './RelationFields';
import { ThreatsSection } from './ThreatsSection';
import { carriesThreats, threatsOffered } from './threatsOffered';
import { useDraftField } from './useDraftField';

interface EdgePanelProps {
  model: DiagramModel;
  /** every relation id an aggregated edge stands for (parallel relations collapse to one edge) */
  constituentIds: string[];
  onCommand: (command: EditorCommand) => void;
  onClose: () => void;
  /** active plane's notation; gates the polarity, delay, curvature and flip-curve controls */
  notation?: NotationId;
  /** the viewed plane — the containment a boundary crossing is derived from */
  activePlane?: string;
}

interface RelationFormProps {
  model: DiagramModel;
  relationId: string;
  onCommand: (command: EditorCommand) => void;
  /** back to the list (multi-constituent edges); absent for a single relation */
  onBack?: () => void;
  onClose: () => void;
  /** active plane's notation; gates the polarity, delay, curvature and flip-curve controls */
  notation?: NotationId;
  /** the viewed plane — the containment a boundary crossing is derived from */
  activePlane?: string;
}

function RelationForm({ model, relationId, onCommand, onBack, onClose, notation, activePlane }: RelationFormProps) {
  const relation = model.relations.find((r) => r.id === relationId);
  const nodeName = (id: string) => model.nodes.find((n) => n.id === id)?.name ?? id;
  // A control shows where the notation draws what it edits: polarity and
  // delay where the renderer draws a relation's marks, curvature and the flip
  // where it bows the line.
  const edgeLook = notationProfile(notation).edge;
  const marks = edgeLook?.marks === true;
  const bowed = edgeLook?.bowed === true;
  // Every crossing on the plane in one pass (the map is shared by all relations,
  // so it is cheaper than asking per relation) — before the early return below,
  // because hooks cannot sit behind one.
  const planeCrossings = useMemo(() => crossings(model, activePlane), [model, activePlane]);

  // Remounted (key={relationId}) when the edited relation changes, so each
  // draft seeds from the freshly selected relation, and follows the model's
  // value when it changes underneath (see useDraftField). The form holds the
  // drafts, so each lives as long as the form whatever its section does.
  const kind = useDraftField(relation?.kind, 'keep');
  const layer = useDraftField(relation?.layer);
  const description = useDraftField(relation?.description);
  // Text of a not-yet-added label; null = the Add-label row is closed.
  const labelDraft = useState<string | null>(null);

  if (relation === undefined) {
    return <p className="muted">Relation not found.</p>;
  }

  const deleteRelation = async () => {
    if (!(await getHost().confirmDialog(`Delete relation '${nodeName(relation.from)} → ${nodeName(relation.to)}'?`)))
      return;
    onCommand({ type: 'delete-relation', id: relationId });
    // After removal, return to the list (multi) or dismiss the panel (single).
    (onBack ?? onClose)();
  };

  // A crossing is derived from containment, never authored: undefined means
  // both ends sit in the same boundary (or in none), so there is nothing to say.
  const crossed = planeCrossings.get(relationId);
  const crossing =
    crossed === undefined
      ? undefined
      : {
          ...(crossed.from !== undefined ? { fromName: nodeName(crossed.from) } : {}),
          ...(crossed.to !== undefined ? { toName: nodeName(crossed.to) } : {}),
        };

  return (
    <>
      {onBack !== undefined && (
        <button className="link-btn" onClick={onBack}>
          ← All relations
        </button>
      )}
      <p className="muted">
        <code>{nodeName(relation.from)}</code> → <code>{nodeName(relation.to)}</code>
      </p>

      <KindField relation={relation} kind={kind} onCommand={onCommand} />

      <LabelsSection relation={relation} draft={labelDraft} onCommand={onCommand} />

      {/* Threats are a generic field, so the section is offered on the notation
       * — but a relation that already carries threats keeps it whatever the
       * plane is drawn as, or turning the notation off would strand them. */}
      {threatsOffered(notation, carriesThreats(relation)) && (
        <ThreatsSection
          target={{ relation: relationId }}
          threats={relation.threats ?? []}
          applicable={strideFor(relation.kind)}
          crossing={crossing}
          onCommand={onCommand}
        />
      )}

      <CommentsSection target={{ relation: relationId }} comments={relation.comments ?? []} onCommand={onCommand} />

      <LayerField relation={relation} layers={model.layers} layer={layer} onCommand={onCommand} />

      {marks && <MarkFields relation={relation} onCommand={onCommand} />}

      <StyleSection relation={relation} bowed={bowed} onCommand={onCommand} />

      <DescriptionField relation={relation} description={description} onCommand={onCommand} />

      <section className="panel-section">
        <button className="chip danger" onClick={() => void deleteRelation()}>
          Delete relation
        </button>
      </section>
    </>
  );
}

export function EdgePanel({ model, constituentIds, onCommand, onClose, notation, activePlane }: EdgePanelProps) {
  const nodeName = (id: string) => model.nodes.find((n) => n.id === id)?.name ?? id;
  // Filter live against the model so a deleted relation drops out of the list.
  const relations = model.relations.filter((r) => constituentIds.includes(r.id));
  const single = constituentIds.length === 1;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The relation shown in the form: the sole constituent, or the one clicked.
  const activeId = single ? (constituentIds[0] ?? null) : selectedId;

  return (
    <aside className="sidebar edge-panel">
      <div className="panel-head">
        <h2>Edit edge</h2>
        <button className="chip icon-btn" aria-label="Close panel" title="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      {activeId !== null ? (
        <RelationForm
          key={activeId}
          model={model}
          relationId={activeId}
          onCommand={onCommand}
          onClose={onClose}
          notation={notation}
          activePlane={activePlane}
          onBack={single ? undefined : () => setSelectedId(null)}
        />
      ) : relations.length === 0 ? (
        <p className="muted">No relations.</p>
      ) : (
        <div className="edge-list">
          {relations.map((r) => (
            <button
              key={r.id}
              className="edge-row"
              aria-label={`Edit relation ${r.id}`}
              onClick={() => setSelectedId(r.id)}
            >
              <b>{r.kind}</b>
              {r.label !== undefined ? ` — ${r.label}` : ''}
              <span className="muted">
                {' '}
                {nodeName(r.from)} → {nodeName(r.to)}
              </span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
