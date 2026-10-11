import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { getHost } from '../host';
import { ACTIONS, FIXED_KEYS, GROUPS, actionOf, type ActionDef, type ActionId } from './actions';
import { chordOf, formatChord, isMac, type Chord } from './chord';
import { conflictsOf, reservedReason, resolveKeymap, withBinding, type Keymap, type Overrides } from './keymap';

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

/** An action the search box's text finds: by its name, its group, or one of its keys. */
const matches = (a: ActionDef, q: string, keymap: Keymap, fmt: (c: Chord) => string): boolean =>
  q === '' ||
  a.label.toLowerCase().includes(q) ||
  a.group.toLowerCase().includes(q) ||
  keymap[a.id].some((c) => fmt(c).toLowerCase().includes(q));

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

  const q = query.trim().toLowerCase();
  const shown = ACTIONS.filter((a) => matches(a, q, keymap, fmt));
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
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="hotkeys-dialog"
        tabIndex={-1}
        onKeyDownCapture={onKey}
      >
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
          <ClashNote
            pending={pending}
            overrides={overrides}
            fmt={fmt}
            onChange={onChange}
            onDone={() => setPending(null)}
          />
        )}
        {error !== null && (
          <div className="hotkeys-note" role="alert">
            {error}
          </div>
        )}
        <ShortcutList
          shown={shown}
          showFixed={q === ''}
          keymap={keymap}
          overrides={overrides}
          fmt={fmt}
          isRecording={isRecording}
          onRecord={startRecording}
          onChange={onChange}
        />
        <ResetAllFooter overrides={overrides} onChange={onChange} />
      </div>
    </div>
  );
}

/** A recorded key other actions already have: reassign it to this one, or cancel. */
function ClashNote({
  pending,
  overrides,
  fmt,
  onChange,
  onDone,
}: {
  pending: Pending;
  overrides: Overrides;
  fmt: (c: Chord) => string;
  onChange: (next: Overrides) => void;
  onDone: () => void;
}) {
  const reassign = () => {
    let next = overrides;
    for (const other of pending.conflicts) {
      next = withBinding(
        next,
        other,
        resolveKeymap(next)[other].filter((c) => c !== pending.chord),
      );
    }
    onChange(bind(next, pending, pending.chord));
    onDone();
  };
  return (
    <div className="hotkeys-note" role="alert">
      <span>
        {fmt(pending.chord)} is already {labels(pending.conflicts)}.
      </span>
      <button type="button" className="chip primary" onClick={reassign}>
        Reassign
      </button>
      <button type="button" className="chip" onClick={onDone}>
        Cancel
      </button>
    </div>
  );
}

interface BindingProps {
  keymap: Keymap;
  overrides: Overrides;
  fmt: (c: Chord) => string;
  isRecording: (id: ActionId, index: number) => boolean;
  /** start recording a key into this slot */
  onRecord: (slot: Slot) => void;
  onChange: (next: Overrides) => void;
}

/** One action: its keys (click one to change it, × to remove it), a slot for one more, and a reset once changed. */
function BindingRow({
  action: a,
  keymap,
  overrides,
  fmt,
  isRecording,
  onRecord,
  onChange,
}: BindingProps & { action: ActionDef }) {
  const chords = keymap[a.id];
  const resetRow = () => {
    const next = { ...overrides };
    delete next[a.id];
    onChange(next);
  };
  return (
    <div className="hotkeys-row">
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
                data-recording={isRecording(a.id, i) ? '' : undefined}
                onClick={() => onRecord({ id: a.id, index: i })}
              >
                {isRecording(a.id, i) ? 'Press a key…' : fmt(c)}
              </button>
              <button
                type="button"
                className="hotkey-x"
                aria-label={`Remove ${fmt(c)} from ${a.label}`}
                onClick={() =>
                  onChange(
                    withBinding(
                      overrides,
                      a.id,
                      chords.filter((_, j) => j !== i),
                    ),
                  )
                }
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
          data-recording={isRecording(a.id, chords.length) ? '' : undefined}
          onClick={() => onRecord({ id: a.id, index: chords.length })}
        >
          {isRecording(a.id, chords.length) ? 'Press a key…' : '+'}
        </button>
        {overrides[a.id] !== undefined && (
          <button
            type="button"
            className="hotkey-x"
            aria-label={`Reset ${a.label}`}
            title="Back to the default"
            onClick={resetRow}
          >
            ↺
          </button>
        )}
      </span>
    </div>
  );
}

/** The actions the search shows, by group, and the fixed keys while nothing is searched. */
function ShortcutList({
  shown,
  showFixed,
  ...binding
}: BindingProps & { shown: readonly ActionDef[]; showFixed: boolean }) {
  return (
    <div className="hotkeys-list">
      {GROUPS.map((group) => {
        const rows = shown.filter((a) => a.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} aria-label={group}>
            <h3 className="hotkeys-group">{group}</h3>
            {rows.map((a) => (
              <BindingRow key={a.id} action={a} {...binding} />
            ))}
          </section>
        );
      })}
      {showFixed && (
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
  );
}

/** Back to every default, after a confirm; off while nothing is changed. */
function ResetAllFooter({ overrides, onChange }: { overrides: Overrides; onChange: (next: Overrides) => void }) {
  const resetAll = async () => {
    if (await getHost().confirmDialog('Reset every keyboard shortcut to its default?')) onChange({});
  };
  return (
    <footer className="hotkeys-foot">
      <button
        type="button"
        className="chip"
        disabled={Object.keys(overrides).length === 0}
        onClick={() => void resetAll()}
      >
        Reset all to defaults
      </button>
      <span className="hotkeys-hint">Click a key to change it. Esc cancels.</span>
    </footer>
  );
}
