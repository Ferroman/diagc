import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { groupDiagrams, groupLabel, groupOf, leafOf } from './diagramGroups';
import { usePersistedState } from './hooks/usePersistedState';

const COLLAPSED_KEY = 'diagramming.pickerCollapsed';

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
}: {
  names: readonly string[];
  selected: string;
  onSelect: (name: string) => void;
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

  // Render-phase ref so the window listener below subscribes once yet always
  // toggles against the current `open`/`selected`.
  const toggleRef = useRef(() => {});
  toggleRef.current = () => (open ? close(true) : openPicker());

  // Ctrl/Cmd+K — form fields included, since the chord carries a modifier and
  // the search box itself is where focus sits while open.
  //
  // Scoped by where the chord comes FROM, not just that it happened: the
  // Obsidian host mounts the studio inside Obsidian's own window, where Cmd+K
  // in a note is "insert link". So it only counts from inside the studio shell,
  // or from <body> — nothing focused, the usual state after a canvas click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'k') return;
      const shell = rootRef.current?.closest('.app') ?? rootRef.current;
      const fromStudio = e.target instanceof Node && shell?.contains(e.target) === true;
      if (e.target !== document.body && !fromStudio) return;
      e.preventDefault();
      toggleRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
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

  const selectedGroup = groupOf(selected);
  return (
    <div className="diagram-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="diagram-picker-trigger"
        // '' is real: an empty workspace, and the tick before boot promotes the
        // selection out of it. A blank button would read as broken.
        aria-label={`Diagram: ${selected === '' ? 'none' : selected}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch diagram (Ctrl/Cmd+K)"
        onClick={() => (open ? close(false) : openPicker())}
      >
        {selectedGroup !== '' && <span className="diagram-picker-folder">{groupLabel(selectedGroup)} / </span>}
        {selected === '' ? <span className="diagram-picker-folder">No diagram</span> : leafOf(selected)}
        <span className="diagram-picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>
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
            {...(active !== undefined ? { 'aria-activedescendant': optionId(active) } : {})}
            placeholder="Search diagrams…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(null);
            }}
            onKeyDown={onKeyDown}
          />
          <div className="diagram-picker-list" role="listbox" id={`${uid}-list`} aria-label="Diagrams" ref={listRef}>
            {groups.length === 0 && <div className="diagram-picker-empty">No diagrams match</div>}
            {groups.map((g) => {
              const headerId = `${uid}-grp-${g.group}`;
              const hidden = isCollapsed(g.group);
              return (
                <div
                  key={g.group}
                  role="group"
                  {...(g.group === '' ? { 'aria-label': 'Ungrouped' } : { 'aria-labelledby': headerId })}
                >
                  {g.group !== '' && (
                    <button
                      type="button"
                      id={headerId}
                      className="diagram-picker-group"
                      aria-expanded={!hidden}
                      // Keep focus in the search box so the arrows keep working
                      // after a header click.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggleGroup(g.group)}
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
                        onMouseMove={() => setCursor(name)}
                        onClick={() => pick(name)}
                      >
                        {leafOf(name)}
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
