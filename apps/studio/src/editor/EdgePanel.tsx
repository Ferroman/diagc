import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import {
  crossings,
  relationLabels,
  strideFor,
  TM_NOTATION,
  type DiagramModel,
  type EdgeLabel,
  type EdgeLabelSide,
  type EditorCommand,
  type NotationId,
  type Polarity,
  type RelationStyle,
} from '@diagramming/core';
import { getHost } from '../host';
import { ColorRow, OptionRow } from './pickers';
import { ThreatsSection } from './ThreatsSection';

/** a fresh, relation-unique label id (l1, l2, … skipping ids already in use) */
const nextLabelId = (labels: EdgeLabel[]): string => {
  let n = 1;
  while (labels.some((l) => l.id === `l${n}`)) n++;
  return `l${n}`;
};

const SIDE_LABEL_OPTIONS: { value: EdgeLabelSide; title: string; glyph: string }[] = [
  { value: 'top', title: 'top', glyph: '↑' },
  { value: 'center', title: 'center', glyph: '⊙' },
  { value: 'bottom', title: 'bottom', glyph: '↓' },
];

// Registry defaults surfaced as datalist hints; free text is still accepted.
const KIND_SUGGESTIONS = ['sync', 'async', 'reads', 'writes', 'hosted-on', 'flow'];

type Side = NonNullable<RelationStyle['fromSide']>;
const SIDE_OPTIONS: { value: Side | ''; title: string; glyph: string }[] = [
  { value: '', title: 'auto (facing side)', glyph: '⊙' },
  { value: 'top', title: 'top', glyph: '↑' },
  { value: 'right', title: 'right', glyph: '→' },
  { value: 'bottom', title: 'bottom', glyph: '↓' },
  { value: 'left', title: 'left', glyph: '←' },
];

interface EdgePanelProps {
  model: DiagramModel;
  /** every relation id an aggregated edge stands for (parallel relations collapse to one edge) */
  constituentIds: string[];
  onCommand: (command: EditorCommand) => void;
  onClose: () => void;
  /** active plane's notation; gates CLD-specific controls (polarity/delay/curvature/flip curve) */
  notation?: NotationId;
  /** the viewed plane — the containment a boundary crossing is derived from */
  activePlane?: string;
}

const commitOnEnter = (e: KeyboardEvent, run: () => void) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    run();
  }
};

// One editable row of the labels list: text (commit on blur/Enter; empty text
// removes the label), a top/center/bottom side toggle, and a remove button. All
// three recompute the whole labels array off `labels` (relationLabels(relation),
// which bridges a legacy `label`) and dispatch update-relation { labels } — so a
// legacy-`label` relation upgrades to `labels` on its first edit here.
function LabelRow({
  relationId,
  labels,
  label,
  index,
  onCommand,
}: {
  relationId: string;
  labels: EdgeLabel[];
  label: EdgeLabel;
  index: number;
  onCommand: (command: EditorCommand) => void;
}) {
  const [text, setText] = useState(label.text);
  useEffect(() => setText(label.text), [label.text]);

  const dispatch = (next: EdgeLabel[]) =>
    onCommand({ type: 'update-relation', id: relationId, patch: { labels: next.length > 0 ? next : null } });
  const commitText = () => {
    if (text === label.text) return;
    dispatch(
      text.trim() === ''
        ? labels.filter((l) => l.id !== label.id)
        : labels.map((l) => (l.id === label.id ? { ...l, text } : l)),
    );
  };
  const setSide = (side: EdgeLabelSide) => dispatch(labels.map((l) => (l.id === label.id ? { ...l, side } : l)));
  const remove = () => dispatch(labels.filter((l) => l.id !== label.id));

  const n = index + 1;
  return (
    <div className="edge-label-row">
      <input
        aria-label={`Label ${n} text`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => commitOnEnter(e, commitText)}
      />
      <OptionRow
        label={`Label ${n} side`}
        value={label.side ?? 'center'}
        options={SIDE_LABEL_OPTIONS}
        onChange={(v) => {
          if (v !== '') setSide(v);
        }}
      />
      <button
        type="button"
        className="chip icon-btn"
        aria-label={`Remove label ${n}`}
        title="Remove label"
        onClick={remove}
      >
        ✕
      </button>
    </div>
  );
}

interface RelationFormProps {
  model: DiagramModel;
  relationId: string;
  onCommand: (command: EditorCommand) => void;
  /** back to the list (multi-constituent edges); absent for a single relation */
  onBack?: () => void;
  onClose: () => void;
  /** active plane's notation; gates CLD-specific controls (polarity/delay/curvature/flip curve) */
  notation?: NotationId;
  /** the viewed plane — the containment a boundary crossing is derived from */
  activePlane?: string;
}

function RelationForm({ model, relationId, onCommand, onBack, onClose, notation, activePlane }: RelationFormProps) {
  const relation = model.relations.find((r) => r.id === relationId);
  const nodeName = (id: string) => model.nodes.find((n) => n.id === id)?.name ?? id;
  const isCld = notation === 'causal-loop';
  // Every crossing on the plane in one pass (the map is shared by all relations,
  // so it is cheaper than asking per relation) — before the early return below,
  // because hooks cannot sit behind one.
  const planeCrossings = useMemo(() => crossings(model, activePlane), [model, activePlane]);

  // Remounted (key={relationId}) when the edited relation changes, so these
  // initializers reseed; the effects below additionally resync a field whenever
  // the model's value for it changes underneath us (Undo/Redo being the everyday
  // case) so a later blur never diff-commits a stale local value.
  const [kind, setKind] = useState(relation?.kind ?? '');
  const [layer, setLayer] = useState(relation?.layer ?? '');
  const [description, setDescription] = useState(relation?.description ?? '');
  // Text of a not-yet-added label; null = the Add-label row is closed.
  const [draft, setDraft] = useState<string | null>(null);

  const modelKind = relation?.kind;
  const modelLayer = relation?.layer;
  const modelDescription = relation?.description;
  useEffect(() => {
    if (modelKind !== undefined) setKind(modelKind);
  }, [modelKind]);
  useEffect(() => {
    setLayer(modelLayer ?? '');
  }, [modelLayer]);
  useEffect(() => {
    setDescription(modelDescription ?? '');
  }, [modelDescription]);

  if (relation === undefined) {
    return <p className="muted">Relation not found.</p>;
  }

  // Effective labels (bridges a legacy `label` string into one centered label).
  const labels = relationLabels(relation);
  const commitDraft = () => {
    const text = (draft ?? '').trim();
    if (text !== '') {
      onCommand({
        type: 'update-relation',
        id: relationId,
        patch: { labels: [...labels, { id: nextLabelId(labels), text, t: 0.5, side: 'center' }] },
      });
    }
    setDraft(null);
  };

  const commitKind = () => {
    const trimmed = kind.trim();
    if (trimmed === '') {
      setKind(relation.kind);
      return;
    }
    if (trimmed !== relation.kind) onCommand({ type: 'update-relation', id: relationId, patch: { kind: trimmed } });
  };
  const commitLayer = (value: string) => {
    setLayer(value);
    if (value !== (relation.layer ?? ''))
      onCommand({ type: 'update-relation', id: relationId, patch: { layer: value === '' ? null : value } });
  };
  const commitPolarity = (v: Polarity | '') =>
    onCommand({ type: 'update-relation', id: relationId, patch: { polarity: v === '' ? null : v } });
  const commitDelay = (v: 'on' | '') =>
    onCommand({ type: 'update-relation', id: relationId, patch: { delay: v === '' ? null : true } });
  const commitDescription = () => {
    if (description !== (relation.description ?? ''))
      onCommand({
        type: 'update-relation',
        id: relationId,
        patch: { description: description === '' ? null : description },
      });
  };
  const deleteRelation = async () => {
    if (!(await getHost().confirmDialog(`Delete relation '${nodeName(relation.from)} → ${nodeName(relation.to)}'?`))) return;
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

  // Style controls commit immediately (excalidraw-style): merge the change into
  // the relation's style; when everything is back at defaults, drop the object.
  const style = relation.style ?? {};
  const commitStyle = (patch: { [K in keyof RelationStyle]: RelationStyle[K] | undefined }) => {
    const next: RelationStyle = { ...style };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k as keyof RelationStyle];
      else (next as Record<string, unknown>)[k] = v;
    }
    onCommand({
      type: 'update-relation',
      id: relationId,
      patch: { style: Object.keys(next).length > 0 ? next : null },
    });
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

      <label className="field">
        <span>Kind</span>
        <input
          aria-label="Kind"
          list="relation-kind-suggestions"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          onBlur={commitKind}
          onKeyDown={(e) => commitOnEnter(e, commitKind)}
        />
        <datalist id="relation-kind-suggestions">
          {KIND_SUGGESTIONS.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      </label>

      <section className="panel-section edge-labels">
        <h3>Labels</h3>
        {labels.map((label, i) => (
          <LabelRow
            key={label.id}
            relationId={relationId}
            labels={labels}
            label={label}
            index={i}
            onCommand={onCommand}
          />
        ))}
        {draft !== null && (
          <div className="edge-label-row">
            <input
              aria-label="New label text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => commitOnEnter(e, commitDraft)}
            />
          </div>
        )}
        <button type="button" className="chip" onClick={() => setDraft('')}>
          Add label
        </button>
      </section>

      {/* Threats are a generic field, so the section is offered on the notation
       * — but a relation that already carries threats keeps it whatever the
       * plane is drawn as, or turning the notation off would strand them. */}
      {(notation === TM_NOTATION || (relation.threats?.length ?? 0) > 0) && (
        <ThreatsSection
          target={{ relation: relationId }}
          threats={relation.threats ?? []}
          applicable={strideFor(relation.kind)}
          {...(crossing !== undefined ? { crossing } : {})}
          onCommand={onCommand}
        />
      )}

      <label className="field">
        <span>Layer</span>
        <select aria-label="Layer" value={layer} onChange={(e) => commitLayer(e.target.value)}>
          <option value="">none</option>
          {model.layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      {isCld && (
        <>
          <OptionRow
            label="Polarity"
            value={relation.polarity ?? ''}
            options={[
              { value: '', title: '∅', glyph: '∅' },
              { value: '+', title: '+', glyph: '+' },
              { value: '-', title: '−', glyph: '−' },
            ]}
            onChange={commitPolarity}
          />
          <OptionRow
            label="Delay"
            value={relation.delay === true ? 'on' : ''}
            options={[
              { value: '', title: '·', glyph: '·' },
              { value: 'on', title: '‖', glyph: '‖' },
            ]}
            onChange={commitDelay}
          />
        </>
      )}

      <section className="panel-section">
        <h3>Style</h3>
        <OptionRow
          label="Shape"
          value={style.shape ?? ''}
          options={[
            { value: '', title: 'curved (default)', glyph: '⌒' },
            { value: 'straight', title: 'straight', glyph: '╱' },
            { value: 'step', title: 'step', glyph: '𝖫' },
          ]}
          onChange={(v) => commitStyle({ shape: v === '' ? undefined : v })}
        />
        {isCld && (
          <>
            <OptionRow
              label="Curvature"
              value={style.curvature !== undefined ? (String(style.curvature) as '0.4' | '0.8') : ''}
              options={[
                { value: '', title: 'default', glyph: '⌒' },
                { value: '0.4', title: '0.4', glyph: '0.4' },
                { value: '0.8', title: '0.8', glyph: '0.8' },
              ]}
              onChange={(v) => commitStyle({ curvature: v === '' ? undefined : Number(v) })}
            />
            <div className="field">
              <span>Curve</span>
              <button
                type="button"
                className={`chip${style.bow === 'right' ? ' active' : ''}`}
                aria-pressed={style.bow === 'right'}
                title="Flip which side the arc bulges (arrow direction unchanged)"
                onClick={() => commitStyle({ bow: style.bow === 'right' ? undefined : 'right' })}
              >
                Flip curve
              </button>
            </div>
          </>
        )}
        <ColorRow
          value={style.color ?? ''}
          onChange={(v) => commitStyle({ color: v === '' ? undefined : v })}
        />
        <OptionRow
          label="Thickness"
          value={style.width !== undefined ? (String(style.width) as '1' | '2.5' | '4') : ''}
          options={[
            { value: '', title: 'default', glyph: <span className="w-line" style={{ height: 1.5 }} /> },
            { value: '1', title: 'thin', glyph: <span className="w-line" style={{ height: 1 }} /> },
            { value: '2.5', title: 'bold', glyph: <span className="w-line" style={{ height: 3 }} /> },
            { value: '4', title: 'heavy', glyph: <span className="w-line" style={{ height: 5 }} /> },
          ]}
          onChange={(v) => commitStyle({ width: v === '' ? undefined : Number(v) })}
        />
        <OptionRow
          label="Line"
          value={style.line ?? ''}
          options={[
            { value: '', title: 'default', glyph: '—' },
            { value: 'solid', title: 'solid', glyph: '━' },
            { value: 'dashed', title: 'dashed', glyph: '╌' },
            { value: 'dotted', title: 'dotted', glyph: '⋯' },
          ]}
          onChange={(v) => commitStyle({ line: v === '' ? undefined : v })}
        />
        <OptionRow
          label="Arrow end"
          value={style.end ?? ''}
          options={[
            { value: '', title: 'arrow (default)', glyph: '➤' },
            { value: 'dot', title: 'dot', glyph: '●' },
            { value: 'square', title: 'square', glyph: '■' },
            { value: 'diamond', title: 'diamond', glyph: '◆' },
            { value: 'none', title: 'none', glyph: '∅' },
          ]}
          onChange={(v) => commitStyle({ end: v === '' ? undefined : v })}
        />
        <OptionRow
          label="From side"
          value={style.fromSide ?? ''}
          options={SIDE_OPTIONS}
          onChange={(v) => commitStyle({ fromSide: v === '' ? undefined : v })}
        />
        <OptionRow
          label="To side"
          value={style.toSide ?? ''}
          options={SIDE_OPTIONS}
          onChange={(v) => commitStyle({ toSide: v === '' ? undefined : v })}
        />
        <OptionRow
          label="Animated"
          value={style.animated === undefined ? '' : style.animated ? 'on' : 'off'}
          options={[
            { value: '', title: 'default', glyph: '·' },
            { value: 'on', title: 'on', glyph: '▶' },
            { value: 'off', title: 'off', glyph: '■' },
          ]}
          onChange={(v) => commitStyle({ animated: v === '' ? undefined : v === 'on' })}
        />
      </section>

      <label className="field">
        <span>Description</span>
        <textarea
          aria-label="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
        />
      </label>

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
          {...(notation !== undefined ? { notation } : {})}
          {...(activePlane !== undefined ? { activePlane } : {})}
          {...(single ? {} : { onBack: () => setSelectedId(null) })}
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
