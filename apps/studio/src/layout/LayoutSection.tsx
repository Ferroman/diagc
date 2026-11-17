import type { MutableRefObject } from 'react';
import { defaultLayoutDirection, layoutPlaneKey, type DiagramModel, type LayoutOverlay } from '@diagc/core/internal';
import { isKnownStyle, notationProfile, STYLE_PRESETS, type LayoutApi } from '@diagc/renderer';
import type { CanvasEditing } from '../canvas-editing/useCanvasEditing';
import { useKeyHint } from '../hotkeys/HotkeysContext';
import type { EditorApi } from '../session/useEditor';
import { diagramStyleOf, type ViewerPrefs } from '../useViewerPrefs';
import type { ViewNavigation } from '../view/useViewNavigation';
import { EditLayoutActions } from './LayoutActions';
import { LayoutPanel } from './LayoutPanel';
import { hasSavedPositions } from './savedPositions';
import type { ViewArrangement } from './useViewArrangement';

export interface LayoutSectionProps {
  model: DiagramModel;
  /** the saved layout overlay: the plane's saved positions */
  layout: LayoutOverlay | undefined;
  editing: boolean;
  editor: EditorApi;
  nav: Pick<ViewNavigation, 'activePlane' | 'activePlaneManual' | 'notation'>;
  /** drilled into a node: the view holds only part of the plane */
  drilled: boolean;
  arrangement: Pick<
    ViewArrangement,
    | 'viewLayout'
    | 'previewLayoutSettings'
    | 'planePreviewed'
    | 'dropPlanePreview'
    | 'autoArrange'
    | 'toggleAutoArrange'
    | 'savingPositions'
    | 'toggleFreeze'
  >;
  canvasEditing: Pick<CanvasEditing, 'setLayoutSettings' | 'toggleAutoLayout'>;
  prefs: Pick<ViewerPrefs, 'style' | 'setStyle'>;
  layoutApiRef: MutableRefObject<LayoutApi | null>;
}

/**
 * The right dock's Layout & style section. The pickers go when the notation
 * arranges the plane itself (git graph, fishbone): elk never runs there, so
 * none of them would do anything, in either mode.
 */
export function LayoutSection(props: LayoutSectionProps) {
  const { model, layout, editing, editor, nav, drilled, arrangement, canvasEditing, prefs, layoutApiRef } = props;
  const { activePlane, notation } = nav;
  // The active plane's automatic-layout settings (algorithm/direction/spacing/
  // edge routing); empty ⇒ tuned defaults. Drives the layout picker in both modes.
  const settings = arrangement.viewLayout?.settings?.[layoutPlaneKey(model, activePlane)] ?? {};
  // elk partitions (second-order's order bands) are a layered-only feature, and
  // the renderer already forces layered for a partitioned profile — so the
  // algorithm picker would only ever offer a choice the run ignores.
  const algorithmLocked = notationProfile(notation).partitionOf !== undefined;
  return (
    <LayoutPanel
      controls={
        notationProfile(notation).layout !== undefined
          ? null
          : {
              settings,
              onChange: editing ? canvasEditing.setLayoutSettings : arrangement.previewLayoutSettings,
              defaultDirection: defaultLayoutDirection(model),
              algorithmLocked,
              defaultAlgorithm: notationProfile(notation).defaultAlgorithm,
            }
      }
      styleControl={<StyleSelect model={model} editing={editing} editor={editor} prefs={prefs} />}
    >
      {editing && (
        <EditLayoutActions
          editor={editor}
          activePlane={activePlane}
          autoLayout={!nav.activePlaneManual}
          onToggleAutoLayout={canvasEditing.toggleAutoLayout}
          getAutoPositions={() => layoutApiRef.current?.autoPositions() ?? {}}
        />
      )}
      {!editing && (
        <ViewLayoutChips model={model} layout={layout} nav={nav} drilled={drilled} arrangement={arrangement} />
      )}
    </LayoutPanel>
  );
}

/** The diagram's own style while editing (saved with it); the viewer's preference
 * in view mode, which a diagram's own style overrides. */
function StyleSelect({
  model,
  editing,
  editor,
  prefs,
}: Pick<LayoutSectionProps, 'model' | 'editing' | 'editor' | 'prefs'>) {
  const diagramStyle = diagramStyleOf(model);
  return editing ? (
    <select
      className="chip-select"
      aria-label="Diagram style"
      title="Diagram style (saved with the diagram)"
      value={diagramStyle ?? ''}
      onChange={(e) =>
        editor.dispatch({
          type: 'set-diagram-style',
          style: e.target.value === '' ? null : e.target.value,
        })
      }
    >
      <option value="">(app default)</option>
      {STYLE_PRESETS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  ) : (
    <select
      className="chip-select"
      aria-label="Style"
      title={diagramStyle !== undefined ? 'Set by diagram' : 'Visual style'}
      /* clamp: garbage in localStorage would otherwise render a blank select */
      value={diagramStyle ?? (isKnownStyle(prefs.style) ? prefs.style : 'clean')}
      disabled={diagramStyle !== undefined}
      onChange={(e) => prefs.setStyle(e.target.value)}
    >
      {STYLE_PRESETS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

/** View mode's layout chips: drop a preview, set saved positions aside, freeze the plane. */
function ViewLayoutChips({
  model,
  layout,
  nav,
  drilled,
  arrangement,
}: Pick<LayoutSectionProps, 'model' | 'layout' | 'nav' | 'drilled' | 'arrangement'>) {
  const hint = useKeyHint();
  const { autoArrange, savingPositions } = arrangement;
  const { activePlaneManual } = nav;
  return (
    <>
      {arrangement.planePreviewed && (
        <button
          className="chip"
          title="Drop the preview and go back to this diagram's own layout settings"
          onClick={arrangement.dropPlanePreview}
        >
          Reset layout
        </button>
      )}
      {hasSavedPositions(model, layout, nav.activePlane) && (
        <button
          type="button"
          className={`chip${autoArrange ? ' active' : ''}`}
          aria-pressed={autoArrange}
          title={`${
            autoArrange
              ? 'Ignoring this diagram’s saved positions, so the layout algorithm arranges every node. Click to put them back.'
              : 'This plane has saved positions, which override the layout algorithm. Click to arrange those nodes automatically instead (nothing is written).'
          }${hint('view.auto-arrange')}`}
          onClick={arrangement.toggleAutoArrange}
        >
          Auto-arrange
        </button>
      )}
      <button
        type="button"
        className={`chip${activePlaneManual ? ' active' : ''}`}
        aria-pressed={activePlaneManual}
        // A drilled snapshot (layoutApiRef.current?.snapshotPositions()) holds
        // only the visible subtree, not the whole plane — freezing from there
        // would set the plane-wide `manual` flag off the back of a partial
        // snapshot. Must be done from the top level instead.
        disabled={savingPositions || drilled}
        title={`${
          drilled
            ? 'Freezing pins the whole plane, but a drilled view only has positions for what it shows — leave the drilled view first.'
            : activePlaneManual
              ? 'Positions are pinned. Click to let the layout algorithm arrange this plane again (your positions are kept).'
              : 'Pin every box where it is so the layout algorithm stops moving them. Boxes added to the source later are still placed automatically until you move them.'
        }${hint('view.freeze')}`}
        onClick={() => void arrangement.toggleFreeze()}
      >
        Freeze layout
      </button>
    </>
  );
}
