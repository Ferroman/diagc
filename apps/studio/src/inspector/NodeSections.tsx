import { useEffect, useRef, useState, type Dispatch as SetState, type SetStateAction } from 'react';
import {
  allowedParentTypes,
  CASCADE_DELETE_TYPES,
  defined,
  type DiagramModel,
  type DiagramNode,
  type EditorCommand,
  type Point,
} from '@diagc/core/internal';
import { commitOnEnter } from './commitOnEnter';
import type { DraftField } from './useDraftField';

type Dispatch = (command: EditorCommand) => void;

/** A plane's name as the panel shows it; undefined is the default plane. */
export const planeName = (model: DiagramModel, id: string | undefined) =>
  id === undefined ? 'default' : (model.planes.find((p) => p.id === id)?.name ?? id);

/** The position inputs' drafts: they mirror the saved position, and a drag that
 * saves a new one re-seeds them. */
export function usePositionDraft(savedPosition: Point | undefined): { x: DraftField; y: DraftField } {
  const x = useState(savedPosition !== undefined ? String(savedPosition.x) : '');
  const y = useState(savedPosition !== undefined ? String(savedPosition.y) : '');
  const [, setX] = x;
  const [, setY] = y;
  useEffect(() => {
    setX(savedPosition !== undefined ? String(savedPosition.x) : '');
    setY(savedPosition !== undefined ? String(savedPosition.y) : '');
  }, [savedPosition?.x, savedPosition?.y]); // eslint-disable-line react-hooks/exhaustive-deps -- the two coordinates are the whole identity
  return { x, y };
}

/** The node's saved position on the plane, typed as two coordinates. */
export function PositionSection({
  node,
  activePlane,
  hasSavedPosition,
  savedPosition,
  live,
  position: {
    x: [posX, setPosX],
    y: [posY, setPosY],
  },
  onCommand,
}: {
  node: DiagramNode;
  activePlane: string | undefined;
  hasSavedPosition: boolean;
  savedPosition: Point | undefined;
  /** where the node sits on screen: the placeholder while it has no saved position */
  live: Point | undefined;
  position: { x: DraftField; y: DraftField };
  onCommand: Dispatch;
}) {
  const clearSavedPosition = () =>
    onCommand({ type: 'clear-position', nodeId: node.id, ...defined({ plane: activePlane }) });
  const commitPosition = () => {
    if (posX.trim() === '' || posY.trim() === '') return; // half a coordinate saves nothing
    const x = Number(posX);
    const y = Number(posY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (savedPosition !== undefined && savedPosition.x === x && savedPosition.y === y) return;
    onCommand({ type: 'set-position', nodeId: node.id, x, y, ...defined({ plane: activePlane }) });
  };
  return (
    <section className="panel-section">
      <h3>Position</h3>
      <div className="member-row">
        <label className="field">
          <span>X</span>
          <input
            type="number"
            aria-label="X"
            step="any"
            value={posX}
            placeholder={live !== undefined ? String(Math.round(live.x)) : 'auto'}
            onChange={(e) => setPosX(e.target.value)}
            onBlur={commitPosition}
            onKeyDown={(e) => commitOnEnter(e, commitPosition)}
          />
        </label>
        <label className="field">
          <span>Y</span>
          <input
            type="number"
            aria-label="Y"
            step="any"
            value={posY}
            placeholder={live !== undefined ? String(Math.round(live.y)) : 'auto'}
            onChange={(e) => setPosY(e.target.value)}
            onBlur={commitPosition}
            onKeyDown={(e) => commitOnEnter(e, commitPosition)}
          />
        </label>
        {hasSavedPosition && (
          <button className="chip" onClick={clearSavedPosition}>
            Clear pinned position
          </button>
        )}
      </div>
      <p className="muted">Parent-relative px. Empty = placed by the layout algorithm.</p>
    </section>
  );
}

/** Which containers hold the node, on which plane, and adding one more. The two
 * pickers' drafts are the panel's, so they live as long as it does. */
export function MembershipsSection({
  model,
  node,
  parent: [addParent, setAddParent],
  plane: [addPlane, setAddPlane],
  onCommand,
}: {
  model: DiagramModel;
  node: DiagramNode;
  parent: DraftField;
  plane: DraftField;
  onCommand: Dispatch;
}) {
  const nodeName = (id: string) => model.nodes.find((n) => n.id === id)?.name ?? id;
  const memberships = model.containment.filter((e) => e.child === node.id);
  // Activity elements only make sense in their notation's containers (a lane in
  // a frame, an action in a lane), so the picker offers those alone.
  const parentTypes = allowedParentTypes(node.type);
  const parentOptions = model.nodes.filter(
    (n) => n.id !== node.id && (parentTypes === undefined || parentTypes.has(n.type ?? '')),
  );

  const removeMembership = (parent: string, plane: string | undefined) =>
    onCommand({
      type: 'remove-containment',
      parent,
      child: node.id,
      ...defined({ plane }),
    });
  const addMembership = () => {
    if (addParent === '') return;
    onCommand({
      type: 'add-containment',
      parent: addParent,
      child: node.id,
      ...(addPlane !== '' ? { plane: addPlane } : {}),
    });
    setAddParent('');
    setAddPlane('');
  };

  return (
    <section className="panel-section">
      <h3>Memberships</h3>
      {memberships.length === 0 && <p className="muted">No containers.</p>}
      {memberships.map((e) => (
        <div key={`${e.parent}:${e.plane ?? ''}`} className="member-row">
          <span>
            {nodeName(e.parent)} <span className="muted">({planeName(model, e.plane)})</span>
          </span>
          <button
            className="chip icon-btn"
            aria-label={`Remove from ${nodeName(e.parent)}`}
            onClick={() => removeMembership(e.parent, e.plane)}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="member-row add-member">
        <select aria-label="Add parent" value={addParent} onChange={(e) => setAddParent(e.target.value)}>
          <option value="">Choose parent…</option>
          {parentOptions.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <select aria-label="Add plane" value={addPlane} onChange={(e) => setAddPlane(e.target.value)}>
          <option value="">default</option>
          {model.planes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="chip" onClick={addMembership} disabled={addParent === ''}>
          Add
        </button>
      </div>
    </section>
  );
}

/** Ungroup (for a container) and Delete. */
export function ActionsSection({
  model,
  node,
  onCommand,
  onDeleted,
}: {
  model: DiagramModel;
  node: DiagramNode;
  onCommand: Dispatch;
  onDeleted: () => void;
}) {
  const isGroup = model.containment.some((c) => c.parent === node.id);
  const deleteNode = () => {
    // Frames and branches take their un-re-homeable children with them;
    // every other container severs only (and Ungroup always severs).
    const cascade = (CASCADE_DELETE_TYPES as readonly string[]).includes(node.type ?? '');
    onCommand({ type: 'delete-node', id: node.id, ...(cascade ? { cascade: true } : {}) });
    onDeleted();
  };
  const ungroup = () => {
    onCommand({ type: 'delete-node', id: node.id });
    onDeleted();
  };
  return (
    <section className="panel-section">
      {isGroup && (
        <button className="chip" onClick={ungroup}>
          Ungroup
        </button>
      )}
      <button className="chip danger" onClick={deleteNode}>
        Delete node
      </button>
    </section>
  );
}

// `originalKey` is the model key a seeded row was hydrated from (undefined for
// rows added in-session). It lets a row that has its key transiently blanked
// mid-rename still contribute its original entry, so an unrelated commit (e.g.
// ✕-deleting a sibling row) never silently drops the row being renamed.
type MetaRow = { id: number; key: string; value: string; originalKey?: string };

const rowsToMetadata = (rows: MetaRow[]): Record<string, string> => {
  const obj: Record<string, string> = {};
  for (const row of rows) {
    const trimmed = row.key.trim();
    // A blank key means the user is mid-rename; fall back to the row's original
    // key so the entry survives commits triggered by other rows.
    const effectiveKey = trimmed !== '' ? trimmed : row.originalKey;
    if (effectiveKey === undefined || effectiveKey === '') continue;
    obj[effectiveKey] = row.value;
  }
  return obj;
};

// Rows are string-valued; the model's metadata may hold non-string values, so
// compare on their String() form — the same normalization used to seed rows.
const metadataEquals = (rowMeta: Record<string, string>, modelMeta: Record<string, unknown>): boolean => {
  const keys = Object.keys(rowMeta);
  if (keys.length !== Object.keys(modelMeta).length) return false;
  return keys.every((k) => k in modelMeta && String(modelMeta[k]) === rowMeta[k]);
};

/** The metadata rows being edited, and the new row's key and value. */
export interface MetadataDraft {
  rows: MetaRow[];
  setRows: SetState<SetStateAction<MetaRow[]>>;
  newKey: DraftField;
  newValue: DraftField;
  /** a fresh row id, never reused while the panel is mounted */
  nextRowId: () => number;
}

/**
 * The metadata section's drafts. Single-user editor: an external model change
 * (e.g. Undo) wins over any in-progress typing. The effect keys on the node's
 * metadata object identity, which structural sharing preserves across unrelated
 * edits, so it only reseeds the rows when the metadata actually changes.
 */
export function useMetadataDraft(metadata: Record<string, unknown> | undefined): MetadataDraft {
  // Stable per-row ids so React keys survive reordering/mid-row removal; the
  // counter is a ref so it is not reset by re-renders. Lazy initializers keep it
  // from advancing on every render.
  const rowId = useRef(0);
  const seedRows = (seed: Record<string, unknown> | undefined): MetaRow[] =>
    Object.entries(seed ?? {}).map(([key, value]) => ({
      id: rowId.current++,
      key,
      value: String(value),
      originalKey: key,
    }));
  const [rows, setRows] = useState<MetaRow[]>(() => seedRows(metadata));
  const newKey = useState('');
  const newValue = useState('');
  useEffect(() => {
    setRows(seedRows(metadata));
    // seedRows is a stable render-local closure over the ref; effect keys on the
    // metadata object identity (structural sharing preserves it across unrelated edits).
  }, [metadata]);
  return { rows, setRows, newKey, newValue, nextRowId: () => rowId.current++ };
}

/** The node's metadata as key/value rows, and a row to add one more. */
export function MetadataSection({
  node,
  draft: {
    rows,
    setRows,
    newKey: [newKey, setNewKey],
    newValue: [newValue, setNewValue],
    nextRowId,
  },
  onCommand,
}: {
  node: DiagramNode;
  draft: MetadataDraft;
  onCommand: Dispatch;
}) {
  const commitMetadata = (next: MetaRow[]) => {
    // A row whose key is blanked mid-rename contributes its original key+value via
    // rowsToMetadata, so the built object equals the model and the change guard
    // below skips the dispatch — nothing is dropped. A real edit (rename, ✕-delete,
    // value change) changes the object and commits. Deletion is only ever the row's ✕.
    const metadata = rowsToMetadata(next);
    // No-op guard: identical to the model's metadata → skip to avoid identity churn.
    if (metadataEquals(metadata, node.metadata ?? {})) return;
    onCommand({
      type: 'set-node-details',
      id: node.id,
      details: { metadata: Object.keys(metadata).length > 0 ? metadata : null },
    });
  };
  const editRow = (id: number, patch: Partial<MetaRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: number) => {
    const next = rows.filter((r) => r.id !== id);
    setRows(next);
    commitMetadata(next);
  };
  const addRow = () => {
    if (newKey.trim() === '') return;
    const next = [...rows, { id: nextRowId(), key: newKey.trim(), value: newValue }];
    setRows(next);
    setNewKey('');
    setNewValue('');
    commitMetadata(next);
  };

  return (
    <section className="panel-section">
      <h3>Metadata</h3>
      {rows.map((row, i) => (
        <div key={row.id} className="kv-row">
          <input
            aria-label={`Metadata key ${i + 1}`}
            className="kv-key"
            value={row.key}
            onChange={(e) => editRow(row.id, { key: e.target.value })}
            onBlur={() => commitMetadata(rows)}
            onKeyDown={(e) => commitOnEnter(e, () => commitMetadata(rows))}
          />
          <input
            aria-label={`Metadata value ${i + 1}`}
            className="kv-value"
            value={row.value}
            onChange={(e) => editRow(row.id, { value: e.target.value })}
            onBlur={() => commitMetadata(rows)}
            onKeyDown={(e) => commitOnEnter(e, () => commitMetadata(rows))}
          />
          <button className="chip icon-btn" aria-label={`Remove metadata ${row.key}`} onClick={() => removeRow(row.id)}>
            ✕
          </button>
        </div>
      ))}
      <div className="kv-row">
        <input
          aria-label="New metadata key"
          className="kv-key"
          placeholder="key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => commitOnEnter(e, addRow)}
        />
        <input
          aria-label="New metadata value"
          className="kv-value"
          placeholder="value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => commitOnEnter(e, addRow)}
        />
        <button className="chip" onClick={addRow}>
          Add metadata
        </button>
      </div>
    </section>
  );
}
