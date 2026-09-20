import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { getHost } from '../host';
import { ACTIONS, FIXED_KEYS, GROUPS, actionOf, type ActionId } from './actions';
import { chordOf, formatChord, isMac, type Chord } from './chord';
import { conflictsOf, reservedReason, resolveKeymap, withBinding, type Overrides } from './keymap';

/** one key of one action; `index === chords.length` is the slot a new alternate lands in */
interface Slot {
  id: ActionId;
  index: number;
}
/** a recorded key held back because other actions already have it */
interface Pending extends Slot {
  chord: Chord;
  conflicts: ActionId[];
}

const labels = (ids: readonly ActionId[]): string => ids.map((id) => actionOf(id).label).join(', ');

const bind = (base: Overrides, slot: Slot, chord: Chord): Overrides => {
  const chords = [...resolveKeymap(base)[slot.id]];
  chords[slot.index] = chord;
  return withBinding(base, slot.id, chords);
};

/**
 * The shortcuts settings and the cheat sheet in one: every action with its keys,
 * and the fixed keys read-only underneath. Controlled — the host owns the stored
 * overrides — and it must suspend its own dispatcher while this is open, or a key
 * being recorded would also run whatever it is bound to.
 */
export function HotkeysDialog({
  overrides,
  onChange,
  onClose,
  mac = isMac(),
}: {
  overrides: Overrides;
  onChange: (next: Overrides) => void;
  onClose: () => void;
  mac?: boolean;
}) {
  const keymap = useMemo(() => resolveKeymap(overrides), [overrides]);
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState<Slot | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const fmt = (c: Chord) => formatChord(c, mac);
  const startRecording = (slot: Slot) => {
    setError(null);
    setPending(null);
    setRecording(slot);
  };

  // Capture phase, on the dialog: while a slot is recording, EVERY key is the
  // answer — it must not also press the focused chip (Space/Enter), move focus
  // (Tab) or close the dialog (Escape closes only when nothing is recording).
  const onKey = (e: ReactKeyboardEvent) => {
    if (recording === null) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (pending !== null) setPending(null);
      else onClose();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setRecording(null);
      return;
    }
    const chord = chordOf(e.nativeEvent, mac);
    if (chord === null) return; // a bare modifier: the key is still to come
    setRecording(null);
    const reason = reservedReason(chord);
    if (reason !== null) {
      setError(`${fmt(chord)}: ${reason}`);
      return;
    }
    if (keymap[recording.id].includes(chord)) return; // already one of this action's keys
    const conflicts = conflictsOf(keymap, recording.id, chord);
    if (conflicts.length > 0) setPending({ ...recording, chord, conflicts });
    else onChange(bind(overrides, recording, chord));
  };

  const reassign = () => {
    if (pending === null) return;
    let next = overrides;
    for (const other of pending.conflicts) {
      next = withBinding(next, other, resolveKeymap(next)[other].filter((c) => c !== pending.chord));
    }
    onChange(bind(next, pending, pending.chord));
    setPending(null);
  };

  const resetRow = (id: ActionId) => {
    const next = { ...overrides };
    delete next[id];
    onChange(next);
  };
  const resetAll = async () => {
    if (await getHost().confirmDialog('Reset every keyboard shortcut to its default?')) onChange({});
  };

  const q = query.trim().toLowerCase();
  const shown = ACTIONS.filter(
    (a) =>
      q === '' ||
      a.label.toLowerCase().includes(q) ||
      a.group.toLowerCase().includes(q) ||
      keymap[a.id].some((c) => fmt(c).toLowerCase().includes(q)),
  );
  const isRecording = (id: ActionId, index: number) => recording?.id === id && recording.index === index;

  return (
    <div
      className="hotkeys-backdrop"
      data-testid="hotkeys-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* tabIndex: a click on the dialog's own padding must keep focus INSIDE it,
          or the key being recorded would be typed at the page and never seen here */}
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="hotkeys-dialog" tabIndex={-1} onKeyDownCapture={onKey}>
        <header className="hotkeys-head">
          <strong>Keyboard shortcuts</strong>
          <button type="button" className="chip" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <input
          ref={searchRef}
          className="hotkeys-search"
          aria-label="Search shortcuts"
          placeholder="search actions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {pending !== null && (
          <div className="hotkeys-note" role="alert">
            <span>
              {fmt(pending.chord)} is already {labels(pending.conflicts)}.
            </span>
            <button type="button" className="chip primary" onClick={reassign}>
              Reassign
            </button>
            <button type="button" className="chip" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        )}
        {error !== null && (
          <div className="hotkeys-note" role="alert">
            {error}
          </div>
        )}
        <div className="hotkeys-list">
          {GROUPS.map((group) => {
            const rows = shown.filter((a) => a.group === group);
            if (rows.length === 0) return null;
            return (
              <section key={group} aria-label={group}>
                <h3 className="hotkeys-group">{group}</h3>
                {rows.map((a) => {
                  const chords = keymap[a.id];
                  return (
                    <div key={a.id} className="hotkeys-row">
                      <span className="hotkeys-label">{a.label}</span>
                      <span className="hotkeys-keys">
                        {chords.length === 0 && !isRecording(a.id, 0) && <span className="hotkeys-unbound">—</span>}
                        {chords.map((c, i) => {
                          const clash = conflictsOf(keymap, a.id, c);
                          return (
                            <span key={c} className="hotkeys-key">
                              <button
                                type="button"
                                className="hotkey-chip"
                                aria-label={`Change ${fmt(c)} for ${a.label}`}
                                {...(clash.length > 0 ? { title: `Also bound to ${labels(clash)}`, 'data-conflict': '' } : {})}
                                {...(isRecording(a.id, i) ? { 'data-recording': '' } : {})}
                                onClick={() => startRecording({ id: a.id, index: i })}
                              >
                                {isRecording(a.id, i) ? 'Press a key…' : fmt(c)}
                              </button>
                              <button
                                type="button"
                                className="hotkey-x"
                                aria-label={`Remove ${fmt(c)} from ${a.label}`}
                                onClick={() => onChange(withBinding(overrides, a.id, chords.filter((_, j) => j !== i)))}
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                        <button
                          type="button"
                          className="hotkey-chip hotkey-add"
                          aria-label={`Add a key for ${a.label}`}
                          {...(isRecording(a.id, chords.length) ? { 'data-recording': '' } : {})}
                          onClick={() => startRecording({ id: a.id, index: chords.length })}
                        >
                          {isRecording(a.id, chords.length) ? 'Press a key…' : '+'}
                        </button>
                        {overrides[a.id] !== undefined && (
                          <button type="button" className="hotkey-x" aria-label={`Reset ${a.label}`} title="Back to the default" onClick={() => resetRow(a.id)}>
                            ↺
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </section>
            );
          })}
          {q === '' && (
            <section aria-label="Fixed">
              <h3 className="hotkeys-group">Fixed</h3>
              {FIXED_KEYS.map((f) => (
                <div key={f.label} className="hotkeys-row">
                  <span className="hotkeys-label">{f.label}</span>
                  <span className="hotkeys-keys hotkeys-fixed">{f.keys}</span>
                </div>
              ))}
            </section>
          )}
        </div>
        <footer className="hotkeys-foot">
          <button type="button" className="chip" disabled={Object.keys(overrides).length === 0} onClick={() => void resetAll()}>
            Reset all to defaults
          </button>
          <span className="hotkeys-hint">Click a key to change it. Esc cancels.</span>
        </footer>
      </div>
    </div>
  );
}
