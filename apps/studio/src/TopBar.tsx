import type { MutableRefObject } from 'react';
import { SOURCE_URL } from '@diagc/core/internal';
import type { NotesToggle } from './canvas-editing/canvasEditHandlers';
import { DiagramPicker } from './diagrams/DiagramPicker';
import { diagramMenuItems } from './diagrams/diagramMenuItems';
import { downloadPng } from './diagrams/downloadPng';
import type { DeepLink } from './diagrams/useDeepLink';
import type { DiagramActions } from './diagrams/useDiagramActions';
import type { DiagramBoot } from './diagrams/useDiagramBoot';
import type { DiagramOnScreen } from './diagrams/useDiagramView';
import { useKeyHint } from './hotkeys/HotkeysContext';
import type { HotkeyPrefs } from './hotkeys/useHotkeyPrefs';
import type { ViewArrangement } from './layout/useViewArrangement';
import { MenuButton } from './MenuButton';
import type { EditSession } from './session/useEditSession';
import { SNAP_GRID, type ViewerPrefs } from './useViewerPrefs';
import type { ViewNavigation } from './view/useViewNavigation';

export interface TopBarProps {
  boot: Pick<DiagramBoot, 'names' | 'ownedNames' | 'canDesign'>;
  deepLink: Pick<DeepLink, 'selected' | 'selectDiagram'>;
  session: Pick<EditSession, 'editing' | 'leaveEdit' | 'layoutApiRef'>;
  view: Pick<DiagramOnScreen, 'model' | 'enterEditFromSource'>;
  /** opening another diagram resets the view, as the picker does */
  nav: Pick<ViewNavigation, 'resetView'>;
  actions: DiagramActions;
  arrangement: Pick<ViewArrangement, 'unsavedView' | 'savingPositions' | 'savePositions'>;
  notes: NotesToggle;
  prefs: Pick<ViewerPrefs, 'theme' | 'toggleTheme' | 'snap' | 'toggleSnap'>;
  hotkeyPrefs: Pick<HotkeyPrefs, 'gearRef' | 'openDialog'>;
  /** the picker's open/close, for its hotkey */
  pickerToggleRef: MutableRefObject<(() => void) | null>;
}

/** The studio's one row of chrome: the diagram and what to do with it, what must
 * be seen, and the viewer's own toggles. */
export function TopBar({
  boot,
  deepLink,
  session,
  view,
  nav,
  actions,
  arrangement,
  notes,
  prefs,
  hotkeyPrefs,
  pickerToggleRef,
}: TopBarProps) {
  const hint = useKeyHint();
  const { canDesign } = boot;
  const { selected } = deepLink;
  const { editing, leaveEdit, layoutApiRef } = session;
  const { savingPositions } = arrangement;
  const hasModel = view.model !== undefined;
  const owned = boot.ownedNames.has(selected);
  const diagramMenu = diagramMenuItems({
    owned,
    hasModel,
    hint,
    actions,
    exportPng: () => void downloadPng(layoutApiRef.current, selected ?? ''),
  });
  return (
    <header className="topbar">
      {/* One row that has to fit a narrow Obsidian pane as well as a wide
        window: what names the diagram on the left, what must be SEEN (an
        unsaved arrangement) and the viewer's toggles on the right. Layout
        and style live in the right dock's Layout & style section; the brand
        is the first thing to give way (app.css). */}
      <strong className="brand">diagc studio</strong>
      <DiagramPicker
        names={boot.names}
        selected={selected}
        onSelect={(name) => {
          if (!leaveEdit()) return;
          deepLink.selectDiagram(name);
          nav.resetView();
        }}
        toggleRef={pickerToggleRef}
      />
      {canDesign && (
        <button
          type="button"
          className="chip icon"
          aria-label="New diagram"
          title={`New diagram${hint('diagram.new')}`}
          onClick={() => void actions.newDiagram()}
        >
          ＋
        </button>
      )}
      {canDesign && !editing && (
        <MenuButton label="Diagram actions" items={diagramMenu}>
          ⋯
        </MenuButton>
      )}
      {hasModel &&
        (owned ? (
          !editing && (
            <button
              className="chip"
              onClick={() => void view.enterEditFromSource()}
              title={`Edit this diagram${hint('diagram.toggle-edit')}`}
            >
              Edit
            </button>
          )
        ) : (
          <span className="chip read-only" title="Compiled from TypeScript — edit the source">
            read-only
          </span>
        ))}
      <span className="spacer" />
      {/* Stays up here, unlike the other layout chips: it appears only when
        there is something to lose, and a folded dock must not hide that. */}
      {!editing && hasModel && arrangement.unsavedView && (
        <button
          className="chip primary"
          disabled={savingPositions}
          title={`Write the boxes and edge labels you moved, and which groups are open, to this diagram's layout file. Safe on a generated diagram: re-compiling rewrites the model, never the layout.${hint('view.save-positions')}`}
          onClick={() => void arrangement.savePositions()}
        >
          {savingPositions ? 'Saving…' : 'Save positions'}
        </button>
      )}
      {/* Edit-mode only: opening every note is a command on the undo stack,
        saved in the layout file so the published page and the PNG agree —
        in view mode there is no session to dispatch into (there the badge
        toggles for the session). */}
      {editing && notes.offered && (
        <button
          type="button"
          className={`chip${notes.allOpen ? ' active' : ''}`}
          aria-pressed={notes.allOpen}
          // an empty register has nothing to open: the command would push an
          // undo step and an autosave that change nothing
          disabled={!notes.anyThreats}
          title={`${notes.allOpen ? 'Close all threat notes' : 'Open all threat notes'}${hint('edit.toggle-notes')}`}
          onClick={notes.toggleAll}
        >
          Notes
        </button>
      )}
      <span className="sep" />
      <ViewerToggles prefs={prefs} hotkeyPrefs={hotkeyPrefs} />
    </header>
  );
}

/** The viewer's toggles at the right end of the row, and the source link. */
function ViewerToggles({
  prefs: { theme, toggleTheme, snap, toggleSnap },
  hotkeyPrefs,
}: Pick<TopBarProps, 'prefs' | 'hotkeyPrefs'>) {
  const hint = useKeyHint();
  return (
    <>
      <button
        type="button"
        className={`chip icon${snap ? ' active' : ''}`}
        aria-label="Snap to grid"
        aria-pressed={snap}
        title={`${
          snap
            ? `Snapping to a ${SNAP_GRID}px grid. Click to place boxes freely.`
            : `Snap dragged boxes to a ${SNAP_GRID}px grid; arrow keys step by it too.`
        }${hint('window.snap')}`}
        onClick={toggleSnap}
      >
        ⋮⋮
      </button>
      <button
        type="button"
        className="chip icon"
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={`${theme === 'dark' ? 'Light theme' : 'Dark theme'}${hint('window.theme')}`}
        onClick={toggleTheme}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>
      <button
        ref={hotkeyPrefs.gearRef}
        type="button"
        className="chip icon"
        aria-label="Keyboard shortcuts"
        title={`Keyboard shortcuts${hint('window.hotkeys')}`}
        onClick={hotkeyPrefs.openDialog}
      >
        ⚙
      </button>
      {/* AGPL section 13 offer. Near-dormant on localhost, but `diagc studio` accepts
        a `host` option, and the moment it is bound to a non-loopback address its
        users are interacting with the program over a network and are owed a way to
        get its source. Cheaper to always show than to detect the binding. */}
      <a
        className="chip source-link"
        href={SOURCE_URL}
        target="_blank"
        rel="noreferrer"
        title="diagc is free software under the AGPL-3.0 — get the source"
      >
        source
      </a>
    </>
  );
}
