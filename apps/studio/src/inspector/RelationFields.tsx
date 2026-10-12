import type { Dispatch, SetStateAction } from 'react';
import {
  relationLabels,
  type DiagramLayer,
  type DiagramRelation,
  type EdgeLabel,
  type EdgeLabelSide,
  type EditorCommand,
  type Polarity,
  type RelationStyle,
} from '@diagc/core/internal';
import { commitOnEnter } from './commitOnEnter';
import { ColorRow, OptionRow } from './pickers';
import { useDraftField, type DraftField } from './useDraftField';

type Dispatcher = (command: EditorCommand) => void;
type RelationPatch = Extract<EditorCommand, { type: 'update-relation' }>['patch'];

/** A relation's fields as one command: what the form's controls write. */
const update = (relation: DiagramRelation, patch: RelationPatch) =>
  ({ type: 'update-relation', id: relation.id, patch }) as const;

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

/** The relation's kind; an emptied box snaps back, as a relation needs one. */
export function KindField({
  relation,
  kind: [kind, setKind],
  onCommand,
}: {
  relation: DiagramRelation;
  kind: DraftField;
  onCommand: Dispatcher;
}) {
  const commitKind = () => {
    const trimmed = kind.trim();
    if (trimmed === '') {
      setKind(relation.kind);
      return;
    }
    if (trimmed !== relation.kind) onCommand(update(relation, { kind: trimmed }));
  };
  return (
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
  );
}

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
  onCommand: Dispatcher;
}) {
  const [text, setText] = useDraftField(label.text);

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

/** The relation's labels, one row each, and a row to add one more. `draft` is
 * the new label's text, null while that row is closed; it is the form's, so it
 * lives as long as the form. */
export function LabelsSection({
  relation,
  draft: [draft, setDraft],
  onCommand,
}: {
  relation: DiagramRelation;
  draft: [string | null, Dispatch<SetStateAction<string | null>>];
  onCommand: Dispatcher;
}) {
  // Effective labels (bridges a legacy `label` string into one centered label).
  const labels = relationLabels(relation);
  const commitDraft = () => {
    const text = (draft ?? '').trim();
    if (text !== '') {
      onCommand(update(relation, { labels: [...labels, { id: nextLabelId(labels), text, t: 0.5, side: 'center' }] }));
    }
    setDraft(null);
  };
  return (
    <section className="panel-section edge-labels">
      <h3>Labels</h3>
      {labels.map((label, i) => (
        <LabelRow
          key={label.id}
          relationId={relation.id}
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
  );
}

/** The layer the relation is drawn on; a pick commits at once. */
export function LayerField({
  relation,
  layers,
  layer: [layer, setLayer],
  onCommand,
}: {
  relation: DiagramRelation;
  layers: readonly DiagramLayer[];
  layer: DraftField;
  onCommand: Dispatcher;
}) {
  const commitLayer = (value: string) => {
    setLayer(value);
    if (value !== (relation.layer ?? '')) onCommand(update(relation, { layer: value === '' ? null : value }));
  };
  return (
    <label className="field">
      <span>Layer</span>
      <select aria-label="Layer" value={layer} onChange={(e) => commitLayer(e.target.value)}>
        <option value="">none</option>
        {layers.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Polarity and delay: the marks a causal loop draws on a relation. */
export function MarkFields({ relation, onCommand }: { relation: DiagramRelation; onCommand: Dispatcher }) {
  const commitPolarity = (v: Polarity | '') => onCommand(update(relation, { polarity: v === '' ? null : v }));
  const commitDelay = (v: 'on' | '') => onCommand(update(relation, { delay: v === '' ? null : true }));
  return (
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
  );
}

type StylePatch = { [K in keyof RelationStyle]: RelationStyle[K] | undefined };

/** How the line is drawn. Each control commits at once (excalidraw-style). */
export function StyleSection({
  relation,
  bowed,
  onCommand,
}: {
  relation: DiagramRelation;
  /** the notation bows the line, so curvature and the flip apply */
  bowed: boolean;
  onCommand: Dispatcher;
}) {
  // Merge the change into the relation's style; when everything is back at
  // defaults, drop the object.
  const style = relation.style ?? {};
  const commitStyle = (patch: StylePatch) => {
    const next: RelationStyle = { ...style };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k as keyof RelationStyle];
      else (next as Record<string, unknown>)[k] = v;
    }
    onCommand(update(relation, { style: Object.keys(next).length > 0 ? next : null }));
  };
  return (
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
      {bowed && (
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
      <ColorRow value={style.color ?? ''} onChange={(v) => commitStyle({ color: v === '' ? undefined : v })} />
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
  );
}

/** What the relation is for, committed on blur. */
export function DescriptionField({
  relation,
  description: [description, setDescription],
  onCommand,
}: {
  relation: DiagramRelation;
  description: DraftField;
  onCommand: Dispatcher;
}) {
  const commitDescription = () => {
    if (description !== (relation.description ?? ''))
      onCommand(update(relation, { description: description === '' ? null : description }));
  };
  return (
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
  );
}
