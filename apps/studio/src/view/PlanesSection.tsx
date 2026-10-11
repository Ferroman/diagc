import type { Dispatch, SetStateAction } from 'react';
import {
  BUILTIN_NOTATIONS,
  uniqueSlug,
  type DiagramLayer,
  type DiagramModel,
  type DiagramPlane,
  type EditorCommand,
} from '@diagc/core/internal';
import { getHost } from '../host';
import { commitOnEnter } from '../inspector/commitOnEnter';
import type { DraftField } from '../inspector/useDraftField';
import { notationLabel } from '../notations';

// A plane's editing row. Plane ids never change once created, so they double as
// stable React keys; containmentOf '' stands for "unset".
export type PlaneRow = {
  id: string;
  name: string;
  containmentOf: string;
  baseRelations: boolean;
  layers: string[];
  notation: string;
};

const sameStrs = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().join('\0') === [...b].sort().join('\0');

export const seedPlanes = (planes: DiagramPlane[]): PlaneRow[] =>
  planes.map((p) => ({
    id: p.id,
    name: p.name,
    containmentOf: p.containmentOf ?? '',
    // undefined defaults to showing base relations; only false hides them.
    baseRelations: p.baseRelations !== false,
    layers: p.layers ?? [],
    notation: p.notation ?? '',
  }));

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

/** What a plane row does: edit it, commit it, commit a pick at once, remove it, toggle a default layer. */
interface PlaneRowActions {
  editPlane: (id: string, patch: Partial<PlaneRow>) => void;
  commitPlane: (row: PlaneRow) => void;
  pick: (row: PlaneRow, patch: Partial<PlaneRow>) => void;
  removePlane: (id: string, name: string) => Promise<void>;
  toggleRowLayer: (row: PlaneRow, layerId: string, on: boolean) => void;
}

/** One plane: its name, the plane it borrows containment from, its notation,
 * whether base relations show, and the layers it opens with. */
function PlaneRowEditor({
  row,
  planeRows,
  layers,
  actions: { editPlane, commitPlane, pick, removePlane, toggleRowLayer },
}: {
  row: PlaneRow;
  /** every row, for the planes this one can borrow from */
  planeRows: PlaneRow[];
  layers: readonly DiagramLayer[];
  actions: PlaneRowActions;
}) {
  return (
    <div className="lp-plane">
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
          onChange={(e) => pick(row, { containmentOf: e.target.value })}
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
          onChange={(e) => pick(row, { notation: e.target.value })}
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
          onChange={(e) => pick(row, { baseRelations: e.target.checked })}
        />
        <span>Show base relations</span>
      </label>
      {layers.length > 0 && (
        <div className="lp-sub">
          <span className="lp-caption">Default layers</span>
          {layers.map((l) => (
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
  );
}

/**
 * The planes, one editable row each (name, borrowed containment, notation, base
 * relations, default layers), and a row to add one. The rows and the new
 * plane's name are the panel's drafts, so they outlive this section.
 */
export function PlanesSection({
  model,
  rows: [planeRows, setPlaneRows],
  newName: [newPlaneName, setNewPlaneName],
  onCommand,
}: {
  model: DiagramModel;
  rows: [PlaneRow[], Dispatch<SetStateAction<PlaneRow[]>>];
  newName: DraftField;
  onCommand: (command: EditorCommand) => void;
}) {
  const editPlane = (id: string, patch: Partial<PlaneRow>) =>
    setPlaneRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

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
  // A pick commits at once: the row takes it, and the plane is built from the row with it.
  const pick = (row: PlaneRow, patch: Partial<PlaneRow>) => {
    editPlane(row.id, patch);
    commitPlane({ ...row, ...patch });
  };

  const addPlane = () => {
    const name = newPlaneName.trim();
    if (name === '') return;
    const id = uniqueSlug(name, new Set(model.planes.map((p) => p.id)), 'plane');
    onCommand({ type: 'upsert-plane', plane: { id, name } });
    setNewPlaneName('');
  };
  const removePlane = async (id: string, name: string) => {
    if (!(await getHost().confirmDialog(`Delete plane '${name}'?`))) return;
    onCommand({ type: 'delete-plane', id });
  };
  const toggleRowLayer = (row: PlaneRow, layerId: string, on: boolean) =>
    pick(row, { layers: on ? [...row.layers, layerId] : row.layers.filter((l) => l !== layerId) });

  return (
    <section className="panel-section">
      <h3>Planes</h3>
      {planeRows.map((row) => (
        <PlaneRowEditor
          key={row.id}
          row={row}
          planeRows={planeRows}
          layers={model.layers}
          actions={{ editPlane, commitPlane, pick, removePlane, toggleRowLayer }}
        />
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
  );
}
