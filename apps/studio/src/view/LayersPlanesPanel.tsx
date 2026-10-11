import { useEffect, useState } from 'react';
import { BUILTIN_NOTATIONS, type DiagramModel, type EditorCommand } from '@diagc/core/internal';
import { PlaneSwitcher } from './PlaneSwitcher';
import { LayersSection, seedLayers, type LayerRow } from './LayersSection';
import { PlanesSection, seedPlanes, type PlaneRow } from './PlanesSection';
import { DockSection } from '../dock/DockSection';
import { notationLabel } from '../notations';

interface LayersPlanesPanelProps {
  model: DiagramModel;
  onCommand: (command: EditorCommand) => void;
  /** 'view' shows read-only switching/visibility; 'edit' shows the full editor. */
  mode?: 'view' | 'edit';
  /** the sheet new nodes/edges land on (the "pen"); null = base sheet (edit) */
  activeLayer?: string | null;
  /** pick the pen (null = base); activating a sheet also turns it on (edit) */
  onActivateLayer?: (id: string | null) => void;
  /** the active plane (the switcher's current selection); undefined = default view */
  activePlane?: string | undefined;
  /** switch the active plane (undefined = default view) */
  onSelectPlane?: (id: string | undefined) => void;
  /** layers currently visible (view mode toggle state) */
  activeLayers?: string[];
  /** toggle a layer's visibility (view mode) */
  onToggleLayer?: (id: string) => void;
  /** fold `sources` into `target` (a layer id), or into the base sheet when
   *  `target` is undefined; sources are removed either way (edit mode) */
  onMergeLayers?: (sources: string[], target: string | undefined) => void;
}

/** The diagram's own notation and its legend (edit mode). */
function NotationSelect({ model, onCommand }: { model: DiagramModel; onCommand: (command: EditorCommand) => void }) {
  return (
    <div className="panel-section">
      <label className="field">
        <span>Notation</span>
        <select
          aria-label="Notation"
          value={model.notation ?? ''}
          onChange={(e) =>
            onCommand({ type: 'set-diagram-notation', notation: e.target.value === '' ? null : e.target.value })
          }
        >
          <option value="">default look</option>
          {BUILTIN_NOTATIONS.map((n) => (
            <option key={n} value={n}>
              {notationLabel(n)}
            </option>
          ))}
        </select>
      </label>
      <label className="lp-check">
        <input
          type="checkbox"
          checked={model.legend !== undefined}
          onChange={(e) => onCommand({ type: 'set-diagram-legend', legend: e.target.checked ? {} : null })}
        />
        Legend
      </label>
    </div>
  );
}

export function LayersPlanesPanel({
  model,
  onCommand,
  mode = 'edit',
  activeLayer = null,
  onActivateLayer,
  activePlane,
  onSelectPlane,
  activeLayers = [],
  onToggleLayer,
  onMergeLayers,
}: LayersPlanesPanelProps) {
  // The drafts are held here, not in their sections: a folded dock section
  // unmounts its body, and a draft outlives that.
  const [layerRows, setLayerRows] = useState<LayerRow[]>(() => seedLayers(model.layers));
  const [planeRows, setPlaneRows] = useState<PlaneRow[]>(() => seedPlanes(model.planes));
  const newLayerName = useState('');
  const newPlaneName = useState('');
  const selected = useState<string[]>([]);
  const mergeOpen = useState(false);

  // Single-user editor: an external model change (e.g. Undo) wins over in-progress
  // typing. Structural sharing keeps the array identity stable across unrelated
  // edits, so each effect reseeds only when its own collection actually changes.
  useEffect(() => {
    setLayerRows(seedLayers(model.layers));
  }, [model.layers]);
  useEffect(() => {
    setPlaneRows(seedPlanes(model.planes));
  }, [model.planes]);

  return (
    <DockSection id="layers-planes" title="Layers & planes" className="sidebar lp-panel">
      {onSelectPlane !== undefined && (
        <PlaneSwitcher planes={model.planes} activePlane={activePlane} onSelect={onSelectPlane} />
      )}

      {mode === 'edit' && <NotationSelect model={model} onCommand={onCommand} />}

      <LayersSection
        model={model}
        mode={mode}
        handlers={{ activeLayer, onActivateLayer, activeLayers, onToggleLayer, onMergeLayers }}
        drafts={{ rows: [layerRows, setLayerRows], newName: newLayerName, selected, mergeOpen }}
        onCommand={onCommand}
      />

      {mode === 'edit' && (
        <PlanesSection model={model} rows={[planeRows, setPlaneRows]} newName={newPlaneName} onCommand={onCommand} />
      )}
    </DockSection>
  );
}
