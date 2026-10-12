import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { groupDiagrams, groupLabel, groupOf, leafOf } from './diagramGroups';
import { usePersistedState } from '../usePersistedState';
import { useKeyHint } from '../hotkeys/HotkeysContext';

const COLLAPSED_KEY = 'diagc.pickerCollapsed';

// Anything that is not a string array (absent, corrupt, a stale format) reads
// as "nothing collapsed" — null hands usePersistedState its fallback.
function readCollapsed(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((g) => typeof g === 'string') ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

/**
 * The topbar's diagram switcher: a trigger naming the current diagram, and a
 * popover with a search box over the diagrams bucketed by folder.
 *
 * Presentational about *what* switching means — `onSelect` owns the unsaved-edit
 * guard and the view reset, exactly as the `<select>` it replaced did — but it
 * owns everything about *finding* a diagram: query, cursor, collapsed folders.
 */
export function DiagramPicker({
  names,
  selected,
  onSelect,
  toggleRef,
}: {
  names: readonly string[];
  selected: string;
  onSelect: (name: string) => void;
  /** The host's handle for its "open diagram picker" hotkey: opens, or closes and
   * hands focus back to the trigger. Assigned on every render, so it always acts
   * on the current `open`/`selected`. */
  toggleRef?: MutableRefObject<(() => void) | null>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // The cursor is a NAME, not an index: the visible rows change under it with
  // every keystroke and collapse, and an index would silently point elsewhere.
  const [cursor, setCursor] = useState<string | null>(null);
  const [collapsed, setCollapsed] = usePersistedState<string[]>(COLLAPSED_KEY, [], readCollapsed, JSON.stringify);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  const searching = query.trim() !== '';
  const groups = groupDiagrams(names, query);
  // Collapse is a browsing aid; while searching it would hide the very match
  // the query asked for, so a query sees through it.
  const isCollapsed = (group: string) => !searching && group !== '' && collapsed.includes(group);
  const rows = groups.flatMap((g) => (isCollapsed(g.group) ? [] : g.names));
  // A cursor the list no longer shows (filtered out, folder collapsed) falls
  // to the first row, which is also what "type, then Enter" wants.
  const active = cursor !== null && rows.includes(cursor) ? cursor : rows[0];
  const optionId = (name: string) => `${uid}-opt-${name}`;

  const openPicker = () => {
    setQuery('');
    setCursor(selected);
    // The cursor starts on the current diagram, so its folder has to be showing.
    const own = groupOf(selected);
    setCollapsed((c) => (c.includes(own) ? c.filter((g) => g !== own) : c));
    setOpen(true);
  };
  // `refocus` is false for an outside press: the user clicked something else,
  // and yanking focus back to the trigger would fight them.
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  const pick = (name: string) => {
    close(true);
    if (name !== selected) onSelect(name);
  };

  // The picker used to listen for Ctrl/Cmd+K itself. The chord is the hotkeys
  // dispatcher's now (rebindable; hotkeys/useHotkeys), which also took over this
  // listener's two rules: a key from outside the studio shell is not ours (the
  // Obsidian host: Cmd+K in a note is "insert link"), and this one action is let
  // through from a form field — the search box is where focus sits while open.
  if (toggleRef !== undefined) toggleRef.current = () => (open ? close(true) : openPicker());
  const hint = useKeyHint();

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    // Capture phase: React Flow's pane (d3-zoom) stops a mousedown where it
    // lands, so one on the canvas — most of the window — never bubbles up here.
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open]);

  // Keep the cursor row in view as the arrows walk past the fold. Optional
  // call: jsdom has no scrollIntoView.
  useEffect(() => {
    if (!open || active === undefined) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active !== undefined) pick(active);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (active === undefined) return;
      // Clamped, not wrapped: in a long list, wrapping turns one keypress too
      // many into a jump to the far end.
      const next = rows.indexOf(active) + (e.key === 'ArrowDown' ? 1 : -1);
      setCursor(rows[Math.min(rows.length - 1, Math.max(0, next))]!);
    }
  };

  const toggleGroup = (group: string) =>
    setCollapsed((c) => (c.includes(group) ? c.filter((g) => g !== group) : [...c, group]));

  return (
    <div className="diagram-picker" ref={rootRef}>
      <PickerTrigger
        triggerRef={triggerRef}
        selected={selected}
        open={open}
        hint={hint}
        onClick={() => (open ? close(false) : openPicker())}
      />
      {open && (
        <div className="diagram-picker-pop">
          <input
            ref={inputRef}
            className="diagram-picker-search"
            role="combobox"
            aria-label="Search diagrams"
            aria-expanded="true"
            aria-controls={`${uid}-list`}
            aria-autocomplete="list"
            aria-activedescendant={active !== undefined ? optionId(active) : undefined}
            placeholder="Search diagrams…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(null);
            }}
            onKeyDown={onKeyDown}
          />
          <PickerList
            listRef={listRef}
            uid={uid}
            groups={groups}
            hiddenOf={isCollapsed}
            selected={selected}
            active={active}
            optionId={optionId}
            onToggle={toggleGroup}
            onCursor={setCursor}
            onPick={pick}
          />
        </div>
      )}
    </div>
  );
}

/** The topbar button naming the current diagram, with its folder. */
function PickerTrigger({
  triggerRef,
  selected,
  open,
  hint,
  onClick,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  selected: string;
  open: boolean;
  hint: ReturnType<typeof useKeyHint>;
  onClick: () => void;
}) {
  const selectedGroup = groupOf(selected);
  return (
    <button
      ref={triggerRef}
      type="button"
      className="diagram-picker-trigger"
      // '' is real: an empty workspace, and the tick before boot promotes the
      // selection out of it. A blank button would read as broken.
      aria-label={`Diagram: ${selected === '' ? 'none' : selected}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      title={`Switch diagram${hint('diagram.picker')}`}
      onClick={onClick}
    >
      {selectedGroup !== '' && <span className="diagram-picker-folder">{groupLabel(selectedGroup)} / </span>}
      {/* a span, not a bare text node: a narrow topbar ellipsises the name, and
          text-overflow does nothing for a flex container's anonymous item */}
      {selected === '' ? (
        <span className="diagram-picker-folder">No diagram</span>
      ) : (
        <span className="diagram-picker-name">{leafOf(selected)}</span>
      )}
      <span className="diagram-picker-caret" aria-hidden="true">
        ▾
      </span>
    </button>
  );
}

/** One folder of the list: its header (which folds it) and its diagrams. */
function PickerGroup({
  group: g,
  uid,
  hidden,
  selected,
  active,
  optionId,
  onToggle,
  onCursor,
  onPick,
}: {
  group: ReturnType<typeof groupDiagrams>[number];
  uid: string;
  /** the folder is collapsed (and no search sees through it) */
  hidden: boolean;
  selected: string;
  /** the row under the keyboard cursor */
  active: string | undefined;
  optionId: (name: string) => string;
  onToggle: (group: string) => void;
  onCursor: (name: string) => void;
  onPick: (name: string) => void;
}) {
  const headerId = `${uid}-grp-${g.group}`;
  return (
    <div role="group" {...(g.group === '' ? { 'aria-label': 'Ungrouped' } : { 'aria-labelledby': headerId })}>
      {g.group !== '' && (
        <button
          type="button"
          id={headerId}
          className="diagram-picker-group"
          aria-expanded={!hidden}
          // Keep focus in the search box so the arrows keep working
          // after a header click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onToggle(g.group)}
        >
          <span className="diagram-picker-caret" aria-hidden="true">
            {hidden ? '▸' : '▾'}
          </span>
          {groupLabel(g.group)}
          <span className="diagram-picker-count" aria-hidden="true">
            {g.names.length}
          </span>
        </button>
      )}
      {!hidden &&
        g.names.map((name) => (
          <div
            key={name}
            id={optionId(name)}
            role="option"
            aria-selected={name === selected}
            data-name={name}
            data-active={name === active}
            className={`diagram-picker-row${g.group !== '' ? ' nested' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseMove={() => onCursor(name)}
            onClick={() => onPick(name)}
          >
            {leafOf(name)}
          </div>
        ))}
    </div>
  );
}

type GroupRowProps = Omit<Parameters<typeof PickerGroup>[0], 'group' | 'hidden'>;

/** The listbox: every folder the search leaves, or a line saying none matches. */
function PickerList({
  listRef,
  groups,
  hiddenOf,
  ...rows
}: GroupRowProps & {
  listRef: RefObject<HTMLDivElement | null>;
  groups: ReturnType<typeof groupDiagrams>;
  hiddenOf: (group: string) => boolean;
}) {
  return (
    <div className="diagram-picker-list" role="listbox" id={`${rows.uid}-list`} aria-label="Diagrams" ref={listRef}>
      {groups.length === 0 && <div className="diagram-picker-empty">No diagrams match</div>}
      {groups.map((g) => (
        <PickerGroup key={g.group} group={g} hidden={hiddenOf(g.group)} {...rows} />
      ))}
    </div>
  );
}
