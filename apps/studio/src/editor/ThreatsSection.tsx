import { useEffect, useState, type KeyboardEvent } from 'react';
import {
  nextThreatId,
  STRIDE,
  STRIDE_NAMES,
  THREAT_SEVERITIES,
  THREAT_STATUSES,
  threatSummary,
  type EditorCommand,
  type StrideCategory,
  type Threat,
  type ThreatPatch,
  type ThreatSeverity,
  type ThreatStatus,
  type ThreatTarget,
} from '@diagramming/core';

interface ThreatsSectionProps {
  target: ThreatTarget;
  threats: readonly Threat[];
  /** STRIDE categories that apply to this element (strideFor) — listed first */
  applicable: readonly StrideCategory[];
  /** for a flow: the boundaries it crosses, by name; undefined = outside any */
  crossing?: { fromName?: string; toName?: string };
  onCommand: (command: EditorCommand) => void;
}

const categoryLabel = (c: StrideCategory) => `${c} · ${STRIDE_NAMES[c]}`;

const commitOnEnter = (e: KeyboardEvent, run: () => void) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    run();
  }
};

/** Every STRIDE category, the ones the element's own type invites first (the
 * STRIDE-per-element table) and the rest behind a disabled separator: the
 * table is guidance, not a rule, so nothing is withheld — just ordered. */
function CategoryOptions({ applicable }: { applicable: readonly StrideCategory[] }) {
  const rest = STRIDE.filter((c) => !applicable.includes(c));
  return (
    <>
      {applicable.map((c) => (
        <option key={c} value={c}>
          {categoryLabel(c)}
        </option>
      ))}
      {rest.length > 0 && <option disabled>──</option>}
      {rest.map((c) => (
        <option key={c} value={c}>
          {categoryLabel(c)}
        </option>
      ))}
    </>
  );
}

function ThreatRow({
  target,
  threat,
  applicable,
  onCommand,
}: {
  target: ThreatTarget;
  threat: Threat;
  applicable: readonly StrideCategory[];
  onCommand: (command: EditorCommand) => void;
}) {
  // The prose fields are long and mostly empty; they stay behind a disclosure
  // so a register of ten threats is still one screen. Viewer state only.
  const [details, setDetails] = useState(false);
  const written = (threat.description ?? '') !== '' || (threat.mitigation ?? '') !== '';
  const patch = (p: ThreatPatch) => onCommand({ type: 'update-threat', target, id: threat.id, patch: p });

  // Text fields are controlled with resync, exactly as EdgePanel's LabelRow:
  // local state carries the keystrokes (so typing never fights the round-trip
  // through the model), and an effect pushes any change made *underneath* the
  // panel — an Undo above all — back into the box instead of leaving stale text
  // on screen. The blur that follows such a refresh then diffs the model's value
  // against the model's value and dispatches nothing, so an Undo is not
  // immediately undone by the box it just refreshed. A commit that changes
  // nothing must never land an undo step of its own, hence every one diffs first.
  const [title, setTitle] = useState(threat.title);
  useEffect(() => setTitle(threat.title), [threat.title]);
  const [description, setDescription] = useState(threat.description ?? '');
  useEffect(() => setDescription(threat.description ?? ''), [threat.description]);
  const [mitigation, setMitigation] = useState(threat.mitigation ?? '');
  useEffect(() => setMitigation(threat.mitigation ?? ''), [threat.mitigation]);

  const commitTitle = () => {
    const text = title.trim();
    // A threat without a title is not a threat (validation rejects it), so a
    // blanked box snaps back to the stored title instead of committing.
    if (text === '') {
      setTitle(threat.title);
      return;
    }
    if (text !== threat.title) patch({ title: text });
  };
  const commitProse = (text: string, field: 'description' | 'mitigation') => {
    const trimmed = text.trim();
    if (trimmed === (threat[field] ?? '')) return;
    const value = trimmed === '' ? null : trimmed;
    patch(field === 'description' ? { description: value } : { mitigation: value });
  };

  return (
    <div className="threat">
      <div className="threat-row">
        <select
          aria-label={`Threat ${threat.id} category`}
          value={threat.category}
          onChange={(e) => patch({ category: e.target.value as StrideCategory })}
        >
          <CategoryOptions applicable={applicable} />
        </select>
        <input
          aria-label={`Threat ${threat.id} title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => commitOnEnter(e, commitTitle)}
        />
        <select
          aria-label={`Threat ${threat.id} severity`}
          value={threat.severity ?? ''}
          onChange={(e) => patch({ severity: e.target.value === '' ? null : (e.target.value as ThreatSeverity) })}
        >
          <option value="">—</option>
          {THREAT_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label={`Threat ${threat.id} status`}
          // an unset status IS open (see isOpen) — the select shows that, and
          // picking 'open' back writes the explicit value, which is harmless
          value={threat.status ?? 'open'}
          onChange={(e) => patch({ status: e.target.value as ThreatStatus })}
        >
          {THREAT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="chip"
          aria-label={`Threat ${threat.id} details`}
          aria-expanded={details}
          onClick={() => setDetails(!details)}
        >
          {/* a dot while folded, or prose written earlier would be invisible */}
          {details ? '▾ details' : written ? '▸ details •' : '▸ details'}
        </button>
        <button
          type="button"
          className="chip icon-btn"
          aria-label={`Remove threat ${threat.id}`}
          title="Remove threat"
          onClick={() => onCommand({ type: 'remove-threat', target, id: threat.id })}
        >
          Remove
        </button>
      </div>
      {details && (
        <div className="threat-details">
          <textarea
            aria-label={`Threat ${threat.id} description`}
            rows={2}
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => commitProse(description, 'description')}
          />
          <textarea
            aria-label={`Threat ${threat.id} mitigation`}
            rows={2}
            placeholder="Mitigation"
            value={mitigation}
            onChange={(e) => setMitigation(e.target.value)}
            onBlur={() => commitProse(mitigation, 'mitigation')}
          />
        </div>
      )}
    </div>
  );
}

/** The threat register of one element, in the panel that already edits it —
 * threats live ON the node or relation, so this is the same section for both
 * and it only ever dispatches the three threat commands. */
export function ThreatsSection({ target, threats, applicable, crossing, onCommand }: ThreatsSectionProps) {
  const { open, total } = threatSummary(threats);
  const [category, setCategory] = useState<StrideCategory>(applicable[0] ?? STRIDE[0]);
  const [title, setTitle] = useState('');

  const add = () => {
    const text = title.trim();
    if (text === '') return;
    onCommand({ type: 'add-threat', target, threat: { id: nextThreatId(threats), category, title: text } });
    setTitle('');
  };

  return (
    <section className="panel-section threats" aria-label="Threats">
      <h3>
        Threats <span className="so-hint">{open} / {total}</span>
      </h3>
      {crossing !== undefined && (
        // Derived from containment, never authored: an end in no boundary reads
        // 'outside' rather than going unmentioned.
        <p className="so-hint">
          Crosses: {crossing.fromName ?? 'outside'} → {crossing.toName ?? 'outside'}
        </p>
      )}
      {threats.map((t) => (
        <ThreatRow key={t.id} target={target} threat={t} applicable={applicable} onCommand={onCommand} />
      ))}
      <div className="threat-add">
        <select
          aria-label="New threat category"
          value={category}
          onChange={(e) => setCategory(e.target.value as StrideCategory)}
        >
          <CategoryOptions applicable={applicable} />
        </select>
        <input
          aria-label="New threat"
          placeholder="Threat"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => commitOnEnter(e, add)}
        />
        {/* the visible word is `Add` (the row it sits in says what is being
            added), but the accessible name has to stand on its own — NodePanel
            and the library both spell a button `Add` too */}
        <button type="button" className="chip" aria-label="Add threat" onClick={add} disabled={title.trim() === ''}>
          Add
        </button>
      </div>
    </section>
  );
}
