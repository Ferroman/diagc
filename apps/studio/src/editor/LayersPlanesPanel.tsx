import { useEffect, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import {
  BUILTIN_NOTATIONS,
  type DiagramLayer,
  type DiagramModel,
  type DiagramPlane,
  type EditorCommand,
} from '@diagramming/core';
import { getHost } from '../host';
import { PlaneSwitcher } from './PlaneSwitcher';

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

// Local editing rows. Layer/plane ids never change once created, so they double
// as stable React keys; tint '' and containmentOf '' stand for "unset".
type LayerRow = { id: string; name: string; tint: string };
type PlaneRow = {
  id: string;
  name: string;
  containmentOf: string;
  baseRelations: boolean;
  layers: string[];
  notation: string;
};

const NOTATION_LABELS: Record<string, string> = { 'second-order': 'Second-order thinking', fishbone: 'Fishbone (cause and effect)' };
// Derives a display label from a notation id ('causal-loop' -> 'Causal loop').
const notationLabel = (id: string): string =>
  NOTATION_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');

const commitOnEnter = (e: KeyboardEvent, run: () => void) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    run();
  }
};

const slugify = (s: string, fallback: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;

// Core's uniqueNodeId only scans nodes; layer/plane id-spaces need their own
// uniqueness against the relevant id set, so slug + suffix here.
const uniqueId = (name: string, taken: Set<string>, fallback: string): string => {
  const slug = slugify(name, fallback);
  if (!taken.has(slug)) return slug;
  for (let i = 2; ; i++) {
    if (!taken.has(`${slug}-${i}`)) return `${slug}-${i}`;
  }
};

const sameStrs = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().join('\0') === [...b].sort().join('\0');

const seedLayers = (layers: DiagramLayer[]): LayerRow[] =>
  layers.map((l) => ({ id: l.id, name: l.name, tint: l.tint ?? '' }));

const seedPlanes = (planes: DiagramPlane[]): PlaneRow[] =>
  planes.map((p) => ({
    id: p.id,
    name: p.name,
    containmentOf: p.containmentOf ?? '',
    // undefined defaults to showing base relations; only false hides them.
    baseRelations: p.baseRelations !== false,
    layers: p.layers ?? [],
    notation: p.notation ?? '',
  }));

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
  const [layerRows, setLayerRows] = useState<LayerRow[]>(() => seedLayers(model.layers));
  const [planeRows, setPlaneRows] = useState<PlaneRow[]>(() => seedPlanes(model.planes));
  const [newLayerName, setNewLayerName] = useState('');
  const [newPlaneName, setNewPlaneName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);

  // Prune against live layers so an external change (undo) can't leave a dangling
  // highlight or feed a stale id into a merge.
  const existingIds = new Set(model.layers.map((l) => l.id));
  const selectedIds = selected.filter((id) => existingIds.has(id));
  const selectedSet = new Set(selectedIds);
  const mergeTargets = model.layers.filter((l) => !selectedSet.has(l.id));
  const canMerge = selectedIds.length >= 1;

  const toggleRowSelected = (e: ReactMouseEvent, id: string) => {
    if (!(e.ctrlKey || e.metaKey)) return; // plain clicks keep editing name/tint
    e.preventDefault();
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const runMerge = async (target: DiagramLayer | undefined) => {
    const names = selectedIds
      .map((id) => `'${model.layers.find((l) => l.id === id)?.name ?? id}'`)
      .join(', ');
    const dest = target === undefined ? 'base sheet' : `'${target.name}'`;
    if (!(await getHost().confirmDialog(`Merge ${names} into ${dest}?`))) return;
    onMergeLayers?.(selectedIds, target?.id);
    setSelected([]);
    setMergeOpen(false);
  };

  // Single-user editor: an external model change (e.g. Undo) wins over in-progress
  // typing. Structural sharing keeps the array identity stable across unrelated
  // edits, so each effect reseeds only when its own collection actually changes.
  useEffect(() => {
    setLayerRows(seedLayers(model.layers));
  }, [model.layers]);
  useEffect(() => {
    setPlaneRows(seedPlanes(model.planes));
  }, [model.planes]);

  const editLayer = (id: string, patch: Partial<LayerRow>) =>
    setLayerRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const editPlane = (id: string, patch: Partial<PlaneRow>) =>
    setPlaneRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const commitLayer = (row: LayerRow) => {
    const layer = model.layers.find((l) => l.id === row.id);
    if (layer === undefined) return;
    const name = row.name.trim();
    if (name === '') {
      // Blank name is not a valid rename; restore the model value.
      editLayer(row.id, { name: layer.name });
      return;
    }
    const next: DiagramLayer = { id: row.id, name, ...(row.tint !== '' ? { tint: row.tint } : {}) };
    if (next.name === layer.name && next.tint === layer.tint) return;
    onCommand({ type: 'upsert-layer', layer: next });
  };

  const buildPlane = (row: PlaneRow): DiagramPlane => ({
    id: row.id,
    name: row.name.trim(),
    ...(row.containmentOf !== '' ? { containmentOf: row.containmentOf } : {}),
    ...(row.layers.length > 0 ? { layers: row.layers } : {}),
    ...(row.baseRelations ? {} : { baseRelations: false }),
    ...(row.notation !== '' ? { notation: row.notation } : {}),
  });

  const planeEquals = (a: DiagramPlane, b: DiagramPlane): boolean =>
    a.name === b.name &&
    (a.containmentOf ?? '') === (b.containmentOf ?? '') &&
    (a.baseRelations !== false) === (b.baseRelations !== false) &&
    sameStrs(a.layers ?? [], b.layers ?? []) &&
    (a.notation ?? '') === (b.notation ?? '');

  const commitPlane = (row: PlaneRow) => {
    const plane = model.planes.find((p) => p.id === row.id);
    if (plane === undefined) return;
    if (row.name.trim() === '') {
      editPlane(row.id, { name: plane.name });
      return;
    }
    const next = buildPlane(row);
    if (planeEquals(next, plane)) return;
    onCommand({ type: 'upsert-plane', plane: next });
  };

  const addLayer = () => {
    const name = newLayerName.trim();
    if (name === '') return;
    const id = uniqueId(name, new Set(model.layers.map((l) => l.id)), 'layer');
    onCommand({ type: 'upsert-layer', layer: { id, name } });
    setNewLayerName('');
  };
  const addPlane = () => {
    const name = newPlaneName.trim();
    if (name === '') return;
    const id = uniqueId(name, new Set(model.planes.map((p) => p.id)), 'plane');
    onCommand({ type: 'upsert-plane', plane: { id, name } });
    setNewPlaneName('');
  };

  const removeLayer = async (id: string, name: string) => {
    if (!(await getHost().confirmDialog(`Delete layer '${name}' and everything on it?`))) return;
    onCommand({ type: 'delete-layer', id });
  };
  const removePlane = async (id: string, name: string) => {
    if (!(await getHost().confirmDialog(`Delete plane '${name}'?`))) return;
    onCommand({ type: 'delete-plane', id });
  };

  const toggleRowLayer = (row: PlaneRow, layerId: string, on: boolean) => {
    const layers = on ? [...row.layers, layerId] : row.layers.filter((l) => l !== layerId);
    const next = { ...row, layers };
    editPlane(row.id, { layers });
    commitPlane(next);
  };

  return (
    <aside className="sidebar lp-panel">
      <div className="panel-head">
        <h2>Layers &amp; planes</h2>
      </div>

      {onSelectPlane !== undefined && (
        <PlaneSwitcher planes={model.planes} activePlane={activePlane} onSelect={onSelectPlane} />
      )}

      {mode === 'edit' && (
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
      )}

      <section className="panel-section">
        <h3>Layers</h3>
        {mode === 'view' ? (
          model.layers.length === 0 ? (
            <p className="lp-caption">No layers</p>
          ) : (
            <div className="lp-planes">
              {model.layers.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`chip${activeLayers.includes(l.id) ? ' active' : ''}`}
                  style={l.tint !== undefined ? { borderColor: l.tint } : undefined}
                  onClick={() => onToggleLayer?.(l.id)}
                  title="Toggle sheet visibility"
                >
                  {l.name}
                </button>
              ))}
            </div>
          )
        ) : (
          <>
            {onActivateLayer !== undefined && (
              <p className="lp-caption">Draw on — new nodes &amp; edges land on the active sheet</p>
            )}
            {onActivateLayer !== undefined && (
              <label className="lp-check lp-draw">
                <input
                  type="radio"
                  name="active-layer"
                  aria-label="Draw on base sheet"
                  checked={activeLayer === null}
                  onChange={() => onActivateLayer(null)}
                />
                <span>Base sheet</span>
              </label>
            )}
            {layerRows.map((row) => (
              <div
                key={row.id}
                className={`lp-row${selectedSet.has(row.id) ? ' selected' : ''}`}
                onClick={(e) => toggleRowSelected(e, row.id)}
              >
                {onActivateLayer !== undefined && (
                  <input
                    type="radio"
                    name="active-layer"
                    className="lp-pen"
                    aria-label={`Draw on ${row.name}`}
                    title="Draw on this sheet"
                    checked={activeLayer === row.id}
                    onChange={() => onActivateLayer(row.id)}
                  />
                )}
                {onToggleLayer !== undefined && (
                  <button
                    type="button"
                    className={`chip icon-btn lp-eye${activeLayers.includes(row.id) ? ' active' : ''}`}
                    aria-label={`Toggle visibility of ${row.name}`}
                    aria-pressed={activeLayers.includes(row.id)}
                    title="Show / hide this sheet"
                    onClick={() => onToggleLayer(row.id)}
                  >
                    👁
                  </button>
                )}
                <input
                  aria-label={`Layer name ${row.id}`}
                  className="lp-name"
                  value={row.name}
                  onChange={(e) => editLayer(row.id, { name: e.target.value })}
                  onBlur={() => commitLayer(row)}
                  onKeyDown={(e) => commitOnEnter(e, () => commitLayer(row))}
                />
                <input
                  type="color"
                  aria-label={`Layer tint ${row.id}`}
                  className="lp-tint"
                  value={row.tint !== '' ? row.tint : '#888888'}
                  onChange={(e) => {
                    const next = { ...row, tint: e.target.value };
                    editLayer(row.id, { tint: e.target.value });
                    commitLayer(next);
                  }}
                />
                <button
                  className="chip icon-btn"
                  aria-label={`Remove layer ${row.name}`}
                  onClick={() => void removeLayer(row.id, row.name)}
                >
                  ✕
                </button>
              </div>
            ))}
            {onMergeLayers !== undefined && model.layers.length > 0 && (
              <div className="lp-merge">
                <button
                  type="button"
                  className="chip"
                  disabled={!canMerge}
                  aria-label="Merge selected layers into another"
                  onClick={() => setMergeOpen((o) => !o)}
                >
                  Merge into ▾
                </button>
                {mergeOpen && canMerge && (
                  <div className="lp-merge-menu">
                    <button
                      type="button"
                      className="chip"
                      aria-label="Merge into base sheet"
                      onClick={() => void runMerge(undefined)}
                    >
                      Base sheet
                    </button>
                    {mergeTargets.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="chip"
                        aria-label={`Merge into ${t.name}`}
                        onClick={() => void runMerge(t)}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="lp-row">
              <input
                aria-label="New layer name"
                className="lp-name"
                placeholder="Layer name"
                value={newLayerName}
                onChange={(e) => setNewLayerName(e.target.value)}
                onKeyDown={(e) => commitOnEnter(e, addLayer)}
              />
              <button className="chip" onClick={addLayer}>
                Add layer
              </button>
            </div>
          </>
        )}
      </section>

      {mode === 'edit' && (
      <section className="panel-section">
        <h3>Planes</h3>
        {planeRows.map((row) => (
          <div key={row.id} className="lp-plane">
            <div className="lp-row">
              <input
                aria-label={`Plane name ${row.id}`}
                className="lp-name"
                value={row.name}
                onChange={(e) => editPlane(row.id, { name: e.target.value })}
                onBlur={() => commitPlane(row)}
                onKeyDown={(e) => commitOnEnter(e, () => commitPlane(row))}
              />
              <button
                className="chip icon-btn"
                aria-label={`Remove plane ${row.name}`}
                onClick={() => void removePlane(row.id, row.name)}
              >
                ✕
              </button>
            </div>
            <label className="field lp-sub">
              <span>Containment of</span>
              <select
                aria-label={`Containment of ${row.name}`}
                value={row.containmentOf}
                onChange={(e) => {
                  const next = { ...row, containmentOf: e.target.value };
                  editPlane(row.id, { containmentOf: e.target.value });
                  commitPlane(next);
                }}
              >
                <option value="">own containment</option>
                {planeRows
                  .filter((p) => p.id !== row.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field lp-sub">
              <span>Notation</span>
              <select
                aria-label={`Notation ${row.name}`}
                value={row.notation}
                onChange={(e) => {
                  const next = { ...row, notation: e.target.value };
                  editPlane(row.id, { notation: e.target.value });
                  commitPlane(next);
                }}
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
                aria-label={`Base relations in ${row.name}`}
                checked={row.baseRelations}
                onChange={(e) => {
                  const next = { ...row, baseRelations: e.target.checked };
                  editPlane(row.id, { baseRelations: e.target.checked });
                  commitPlane(next);
                }}
              />
              <span>Show base relations</span>
            </label>
            {model.layers.length > 0 && (
              <div className="lp-sub">
                <span className="lp-caption">Default layers</span>
                {model.layers.map((l) => (
                  <label key={l.id} className="lp-check">
                    <input
                      type="checkbox"
                      aria-label={`Layer ${l.name} in ${row.name}`}
                      checked={row.layers.includes(l.id)}
                      onChange={(e) => toggleRowLayer(row, l.id, e.target.checked)}
                    />
                    <span>{l.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="lp-row">
          <input
            aria-label="New plane name"
            className="lp-name"
            placeholder="Plane name"
            value={newPlaneName}
            onChange={(e) => setNewPlaneName(e.target.value)}
            onKeyDown={(e) => commitOnEnter(e, addPlane)}
          />
          <button className="chip" onClick={addPlane}>
            Add plane
          </button>
        </div>
      </section>
      )}
    </aside>
  );
}
