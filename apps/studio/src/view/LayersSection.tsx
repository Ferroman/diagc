import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';
import { uniqueSlug, type DiagramLayer, type DiagramModel, type EditorCommand } from '@diagc/core/internal';
import { getHost } from '../host';
import { commitOnEnter } from '../inspector/commitOnEnter';
import type { DraftField } from '../inspector/useDraftField';

// A layer's editing row. Layer ids never change once created, so they double as
// stable React keys; tint '' stands for "unset".
export type LayerRow = { id: string; name: string; tint: string };

export const seedLayers = (layers: DiagramLayer[]): LayerRow[] =>
  layers.map((l) => ({ id: l.id, name: l.name, tint: l.tint ?? '' }));

type State<T> = [T, Dispatch<SetStateAction<T>>];

/** What the layer controls do beyond editing the model: the pen, visibility, a merge. */
export interface LayerHandlers {
  /** the sheet new nodes/edges land on (the "pen"); null = base sheet (edit) */
  activeLayer: string | null;
  /** pick the pen (null = base); activating a sheet also turns it on (edit) */
  onActivateLayer?: (id: string | null) => void;
  /** layers currently visible (view mode toggle state) */
  activeLayers: string[];
  /** toggle a layer's visibility */
  onToggleLayer?: (id: string) => void;
  /** fold `sources` into `target` (a layer id), or into the base sheet when
   *  `target` is undefined; sources are removed either way (edit mode) */
  onMergeLayers?: (sources: string[], target: string | undefined) => void;
}

/** The panel's drafts the layer editor works on; they outlive this section. */
export interface LayerDrafts {
  rows: State<LayerRow[]>;
  newName: DraftField;
  /** the rows ctrl/⌘-clicked for a merge */
  selected: State<string[]>;
  mergeOpen: State<boolean>;
}

/** View mode's layers: one visibility chip each. */
function LayerChips({ model, handlers }: { model: DiagramModel; handlers: LayerHandlers }) {
  const { activeLayers, onToggleLayer } = handlers;
  if (model.layers.length === 0) return <p className="lp-caption">No layers</p>;
  return (
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
  );
}

/** Merge the selected layers into another, or into the base sheet, after a confirm. */
function MergeMenu({
  model,
  selectedIds,
  drafts: {
    selected: [, setSelected],
    mergeOpen: [mergeOpen, setMergeOpen],
  },
  onMergeLayers,
}: {
  model: DiagramModel;
  /** the selection, pruned to the layers that still exist */
  selectedIds: string[];
  drafts: LayerDrafts;
  onMergeLayers: NonNullable<LayerHandlers['onMergeLayers']>;
}) {
  const selectedSet = new Set(selectedIds);
  const mergeTargets = model.layers.filter((l) => !selectedSet.has(l.id));
  const canMerge = selectedIds.length >= 1;
  const runMerge = async (target: DiagramLayer | undefined) => {
    const names = selectedIds.map((id) => `'${model.layers.find((l) => l.id === id)?.name ?? id}'`).join(', ');
    const dest = target === undefined ? 'base sheet' : `'${target.name}'`;
    if (!(await getHost().confirmDialog(`Merge ${names} into ${dest}?`))) return;
    onMergeLayers(selectedIds, target?.id);
    setSelected([]);
    setMergeOpen(false);
  };
  return (
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
  );
}

/** What a layer row does: select it for a merge, edit it, commit it, remove it. */
interface LayerRowActions {
  toggleRowSelected: (e: ReactMouseEvent, id: string) => void;
  editLayer: (id: string, patch: Partial<LayerRow>) => void;
  commitLayer: (row: LayerRow) => void;
  removeLayer: (id: string, name: string) => Promise<void>;
}

/** One sheet's row: pen, eye, name, tint, remove; ctrl/⌘-click selects it for a merge. */
function LayerRowEditor({
  row,
  selected,
  handlers: { activeLayer, onActivateLayer, activeLayers, onToggleLayer },
  actions: { toggleRowSelected, editLayer, commitLayer, removeLayer },
}: {
  row: LayerRow;
  selected: boolean;
  handlers: LayerHandlers;
  actions: LayerRowActions;
}) {
  return (
    <div key={row.id} className={`lp-row${selected ? ' selected' : ''}`} onClick={(e) => toggleRowSelected(e, row.id)}>
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
  );
}

/** Edit mode's layers: the pen, a row per sheet (pen, eye, name, tint, remove), a merge, a new sheet. */
function LayerEditor({
  model,
  handlers,
  drafts,
  onCommand,
}: {
  model: DiagramModel;
  handlers: LayerHandlers;
  drafts: LayerDrafts;
  onCommand: (command: EditorCommand) => void;
}) {
  const { activeLayer, onActivateLayer, onMergeLayers } = handlers;
  const [layerRows, setLayerRows] = drafts.rows;
  const [newLayerName, setNewLayerName] = drafts.newName;
  const [selected, setSelected] = drafts.selected;
  // Prune against live layers so an external change (undo) can't leave a dangling
  // highlight or feed a stale id into a merge.
  const existingIds = new Set(model.layers.map((l) => l.id));
  const selectedIds = selected.filter((id) => existingIds.has(id));
  const selectedSet = new Set(selectedIds);

  const toggleRowSelected = (e: ReactMouseEvent, id: string) => {
    if (!(e.ctrlKey || e.metaKey)) return; // plain clicks keep editing name/tint
    e.preventDefault();
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const editLayer = (id: string, patch: Partial<LayerRow>) =>
    setLayerRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
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
  const addLayer = () => {
    const name = newLayerName.trim();
    if (name === '') return;
    // layers and planes are id spaces of their own, apart from the nodes uniqueNodeId scans
    const id = uniqueSlug(name, new Set(model.layers.map((l) => l.id)), 'layer');
    onCommand({ type: 'upsert-layer', layer: { id, name } });
    setNewLayerName('');
  };
  const removeLayer = async (id: string, name: string) => {
    if (!(await getHost().confirmDialog(`Delete layer '${name}' and everything on it?`))) return;
    onCommand({ type: 'delete-layer', id });
  };

  return (
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
        <LayerRowEditor
          key={row.id}
          row={row}
          selected={selectedSet.has(row.id)}
          handlers={handlers}
          actions={{ toggleRowSelected, editLayer, commitLayer, removeLayer }}
        />
      ))}
      {onMergeLayers !== undefined && model.layers.length > 0 && (
        <MergeMenu model={model} selectedIds={selectedIds} drafts={drafts} onMergeLayers={onMergeLayers} />
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
  );
}

/** The layers: visibility chips in view mode, the editor in edit mode. */
export function LayersSection({
  model,
  mode,
  handlers,
  drafts,
  onCommand,
}: {
  model: DiagramModel;
  mode: 'view' | 'edit';
  handlers: LayerHandlers;
  drafts: LayerDrafts;
  onCommand: (command: EditorCommand) => void;
}) {
  return (
    <section className="panel-section">
      <h3>Layers</h3>
      {mode === 'view' ? (
        <LayerChips model={model} handlers={handlers} />
      ) : (
        <LayerEditor model={model} handlers={handlers} drafts={drafts} onCommand={onCommand} />
      )}
    </section>
  );
}
