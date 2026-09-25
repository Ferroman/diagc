import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { DiagramModel, EditorCommand, FontScale, NotationId, TextAlign } from '@diagc/core';
import { CASCADE_DELETE_TYPES, IMAGE_REF, LIBRARY_IMAGE_REF, PLAN_NOTATION, PLAN_TYPES, TM_NOTATION, strideFor } from '@diagc/core';
import { BUILTIN_ICON_IDS } from '@diagc/icons';
import { DEFAULT_TYPE_STYLES } from '@diagc/renderer';
import { CommentsSection } from './CommentsSection';
import { LinksSection } from './LinksSection';
import { ColorRow, OptionRow } from './pickers';
import { seedOnRetype } from './planActions';
import { PlanSection } from './PlanSection';
import { ThreatsSection } from './ThreatsSection';
import { BUNDLED_LIBRARY } from '../library/packs';

// Registry defaults surfaced as datalist hints; free text is still accepted.
// Read from the registries themselves so a new type or icon shows up here
// without a second, hand-maintained copy drifting out of sync.
const TYPE_SUGGESTIONS = Object.keys(DEFAULT_TYPE_STYLES);
const ICON_SUGGESTIONS = [...BUILTIN_ICON_IDS];
// Silhouette refs bundled with the studio's library packs (deduped). Free text
// is still accepted — any content-hash asset or /library/… ref is valid.
const SHAPE_SUGGESTIONS = [
  ...new Set(BUNDLED_LIBRARY.entries.map((e) => e.template.shape).filter((s): s is string => s !== undefined)),
];

const ALIGN_OPTIONS: { value: TextAlign | ''; title: string; glyph: string }[] = [
  { value: '', title: 'Left (default)', glyph: '⇤' },
  { value: 'center', title: 'Center', glyph: '≡' },
  { value: 'right', title: 'Right', glyph: '⇥' },
];
const SIZE_OPTIONS: { value: FontScale | ''; title: string; glyph: string }[] = [
  { value: 'sm', title: 'Small', glyph: 'S' },
  { value: '', title: 'Normal (default)', glyph: 'M' },
  { value: 'lg', title: 'Large', glyph: 'L' },
];

interface NodePanelProps {
  model: DiagramModel;
  nodeId: string;
  activePlane: string | undefined;
  /** node has a pinned position in the active plane's layout bucket */
  hasPin?: boolean;
  /** the node's pinned position in the active plane (parent-relative flow px) */
  pinned?: { x: number; y: number };
  /** where the node sits on screen when it is NOT pinned — the inputs'
   * placeholder, so typing a coordinate starts from something real */
  live?: { x: number; y: number };
  /** focus + select the name input on mount (a node was just added) */
  autoFocusName?: boolean;
  /** active plane's notation; gates the Threats section (threat-model) */
  notation?: NotationId;
  /** the host's date, YYYY-MM-DD: seeds a Type-field retype into plan-zone/
   * plan-event with dates the way a canvas drop would (seedOnRetype); omitted
   * (e.g. a test harness with nothing plan-shaped to seed) just skips seeding.
   * Optional only so the panel's own tests can render without it — App.tsx
   * always passes it, and a caller that forgets it loses seeding silently,
   * with no error, since commitType's `today !== undefined` check just skips. */
  today?: string;
  onCommand: (command: EditorCommand) => void;
  onClose: () => void;
  onDeleted: () => void;
}

// `originalKey` is the model key a seeded row was hydrated from (undefined for
// rows added in-session). It lets a row that has its key transiently blanked
// mid-rename still contribute its original entry, so an unrelated commit (e.g.
// ✕-deleting a sibling row) never silently drops the row being renamed.
type MetaRow = { id: number; key: string; value: string; originalKey?: string };

const commitOnEnter = (e: KeyboardEvent, run: () => void) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    run();
  }
};

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

export function NodePanel({
  model,
  nodeId,
  activePlane,
  hasPin = false,
  pinned,
  live,
  autoFocusName = false,
  notation,
  today,
  onCommand,
  onClose,
  onDeleted,
}: NodePanelProps) {
  const node = model.nodes.find((n) => n.id === nodeId);
  const nodeName = (id: string) => model.nodes.find((n) => n.id === id)?.name ?? id;
  const planeName = (id: string | undefined) =>
    id === undefined ? 'default' : (model.planes.find((p) => p.id === id)?.name ?? id);

  // Local in-progress values. The panel is remounted (key={nodeId}) on selection
  // change, so these initializers reseed from the freshly-selected node; the
  // effects below additionally resync a field whenever the model's value for it
  // changes underneath us (Undo/Redo being the everyday case), so a later blur
  // never diff-commits a stale local value over the external change.
  const [name, setName] = useState(node?.name ?? '');
  const [type, setType] = useState(node?.type ?? '');
  const [icon, setIcon] = useState(node?.icon ?? '');
  const [shape, setShape] = useState(node?.shape ?? '');
  const [technology, setTechnology] = useState(node?.technology ?? '');
  const [link, setLink] = useState(node?.link ?? '');
  const [description, setDescription] = useState(node?.description ?? '');
  // Stable per-row ids so React keys survive reordering/mid-row removal; the
  // counter is a ref so it is not reset by re-renders. Lazy initializers keep it
  // from advancing on every render.
  const rowId = useRef(0);
  const seedRows = (metadata: Record<string, unknown> | undefined): MetaRow[] =>
    Object.entries(metadata ?? {}).map(([key, value]) => ({
      id: rowId.current++,
      key,
      value: String(value),
      originalKey: key,
    }));
  const [rows, setRows] = useState<MetaRow[]>(() => seedRows(node?.metadata));
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [addParent, setAddParent] = useState('');
  const [addPlane, setAddPlane] = useState('');

  // Position inputs mirror the pin; a re-pin from a drag re-seeds them.
  const [posX, setPosX] = useState(pinned !== undefined ? String(pinned.x) : '');
  const [posY, setPosY] = useState(pinned !== undefined ? String(pinned.y) : '');
  useEffect(() => {
    setPosX(pinned !== undefined ? String(pinned.x) : '');
    setPosY(pinned !== undefined ? String(pinned.y) : '');
  }, [pinned?.x, pinned?.y]); // eslint-disable-line react-hooks/exhaustive-deps -- the two coordinates are the whole identity

  // Just-added node: put the caret straight into the name, text selected, so
  // typing replaces the placeholder. The panel remounts per node (key=nodeId),
  // so running on mount only is exactly once per add.
  const nameInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocusName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single-user editor: an external model change (e.g. Undo) wins over any
  // in-progress typing. The metadata effect keys on the node's metadata object
  // identity, which structural sharing preserves across unrelated edits, so it
  // only reseeds the rows when the metadata actually changes.
  const modelName = node?.name;
  const modelType = node?.type;
  const modelIcon = node?.icon;
  const modelShape = node?.shape;
  const modelTechnology = node?.technology;
  const modelLink = node?.link;
  const modelDescription = node?.description;
  const modelMetadata = node?.metadata;
  useEffect(() => {
    if (modelName !== undefined) setName(modelName);
  }, [modelName]);
  useEffect(() => {
    setType(modelType ?? '');
  }, [modelType]);
  useEffect(() => {
    setIcon(modelIcon ?? '');
  }, [modelIcon]);
  useEffect(() => {
    setShape(modelShape ?? '');
  }, [modelShape]);
  useEffect(() => {
    setTechnology(modelTechnology ?? '');
  }, [modelTechnology]);
  useEffect(() => {
    setLink(modelLink ?? '');
  }, [modelLink]);
  useEffect(() => {
    setDescription(modelDescription ?? '');
  }, [modelDescription]);
  useEffect(() => {
    setRows(seedRows(modelMetadata));
    // seedRows is a stable render-local closure over the ref; effect keys on the
    // metadata object identity (structural sharing preserves it across unrelated edits).
  }, [modelMetadata]);

  if (node === undefined) {
    return <aside className="sidebar muted">Node not found.</aside>;
  }

  const memberships = model.containment.filter((e) => e.child === nodeId);
  const parentOptions = model.nodes.filter((n) => n.id !== nodeId);
  const isGroup = model.containment.some((c) => c.parent === nodeId);

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setName(node.name);
      return;
    }
    if (trimmed !== node.name) onCommand({ type: 'rename-node', id: nodeId, name: trimmed });
  };
  const commitType = () => {
    const trimmed = type.trim();
    if (trimmed === (node.type ?? '')) return;
    const typeCmd: EditorCommand = { type: 'set-node-details', id: nodeId, details: { type: trimmed === '' ? null : trimmed } };
    // Retyping into plan-zone/plan-event with no dates would otherwise fail
    // save with plan-missing — seed them the way a canvas drop does, batched
    // with the retype so undo reverts both together.
    const dateCmd = today !== undefined ? seedOnRetype(model, activePlane, nodeId, trimmed, today) : undefined;
    onCommand(dateCmd === undefined ? typeCmd : { type: 'batch', commands: [typeCmd, dateCmd] });
  };
  const commitIcon = () => {
    if (icon !== (node.icon ?? ''))
      onCommand({ type: 'set-node-details', id: nodeId, details: { icon: icon === '' ? null : icon } });
  };
  const commitShape = () => {
    const trimmed = shape.trim();
    if (trimmed === (node.shape ?? '')) return;
    if (trimmed !== '' && !IMAGE_REF.test(trimmed) && !LIBRARY_IMAGE_REF.test(trimmed)) {
      // Invalid ref: revert rather than let it wedge the validate-before-save gate.
      setShape(node.shape ?? '');
      return;
    }
    onCommand({ type: 'set-node-details', id: nodeId, details: { shape: trimmed === '' ? null : trimmed } });
  };
  const commitTechnology = () => {
    if (technology !== (node.technology ?? ''))
      onCommand({
        type: 'set-node-details',
        id: nodeId,
        details: { technology: technology === '' ? null : technology },
      });
  };
  const commitLink = () => {
    if (link !== (node.link ?? ''))
      onCommand({
        type: 'set-node-details',
        id: nodeId,
        details: { link: link.trim() === '' ? null : link.trim() },
      });
  };
  const commitDescription = () => {
    if (description !== (node.description ?? ''))
      onCommand({
        type: 'set-node-details',
        id: nodeId,
        details: { description: description === '' ? null : description },
      });
  };

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
      id: nodeId,
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
    const next = [...rows, { id: rowId.current++, key: newKey.trim(), value: newValue }];
    setRows(next);
    setNewKey('');
    setNewValue('');
    commitMetadata(next);
  };

  const removeMembership = (parent: string, plane: string | undefined) =>
    onCommand({
      type: 'remove-containment',
      parent,
      child: nodeId,
      ...(plane !== undefined ? { plane } : {}),
    });

  const addMembership = () => {
    if (addParent === '') return;
    onCommand({
      type: 'add-containment',
      parent: addParent,
      child: nodeId,
      ...(addPlane !== '' ? { plane: addPlane } : {}),
    });
    setAddParent('');
    setAddPlane('');
  };

  const deleteNode = () => {
    // Frames and branches take their un-re-homeable children with them;
    // every other container severs only (and Ungroup always severs).
    const cascade = (CASCADE_DELETE_TYPES as readonly string[]).includes(node.type ?? '');
    onCommand({ type: 'delete-node', id: nodeId, ...(cascade ? { cascade: true } : {}) });
    onDeleted();
  };

  const ungroup = () => {
    onCommand({ type: 'delete-node', id: nodeId });
    onDeleted();
  };

  const clearPin = () =>
    onCommand({ type: 'clear-position', nodeId, ...(activePlane !== undefined ? { plane: activePlane } : {}) });

  const commitPosition = () => {
    if (posX.trim() === '' || posY.trim() === '') return; // half a coordinate pins nothing
    const x = Number(posX);
    const y = Number(posY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (pinned !== undefined && pinned.x === x && pinned.y === y) return;
    onCommand({ type: 'set-position', nodeId, x, y, ...(activePlane !== undefined ? { plane: activePlane } : {}) });
  };

  return (
    <aside className="sidebar node-panel">
      <div className="panel-head">
        <h2>Edit node</h2>
        <button className="chip icon-btn" aria-label="Close panel" title="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="muted">
        <code>{node.id}</code> · plane <code>{planeName(activePlane)}</code>
      </p>
      <label className="field">
        <span>Name</span>
        {/* multiline: Enter inserts a line break (default), blur commits */}
        <textarea
          ref={nameInputRef}
          className="name-input"
          aria-label="Name"
          rows={Math.max(1, name.split('\n').length)}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
        />
      </label>

      <label className="field">
        <span>Type</span>
        <input
          aria-label="Type"
          list="node-type-suggestions"
          value={type}
          onChange={(e) => setType(e.target.value)}
          onBlur={commitType}
          onKeyDown={(e) => commitOnEnter(e, commitType)}
        />
        <datalist id="node-type-suggestions">
          {TYPE_SUGGESTIONS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </label>

      {model.layers.length > 0 && (
        <label className="field">
          <span>Layer</span>
          <select
            aria-label="Layer"
            value={node.layer ?? ''}
            onChange={(e) =>
              onCommand({
                type: 'set-node-details',
                id: nodeId,
                details: { layer: e.target.value === '' ? null : e.target.value },
              })
            }
          >
            <option value="">base sheet</option>
            {model.layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {activePlane !== undefined && model.planes.find((p) => p.id === activePlane)?.containmentOf === undefined && (
        <>
          <label className="field">
            <span>Scope</span>
            <select
              aria-label="Scope"
              value={node.plane === activePlane ? 'local' : 'shared'}
              onChange={(e) =>
                onCommand({
                  type: 'set-node-details',
                  id: nodeId,
                  details: { plane: e.target.value === 'local' ? activePlane : null },
                })
              }
            >
              <option value="shared">Shared (all planes)</option>
              <option value="local">This plane only</option>
            </select>
          </label>
          {node.plane === undefined && (
            <label className="field">
              <span>Hidden here</span>
              <input
                type="checkbox"
                aria-label="Hidden here"
                checked={(model.planes.find((p) => p.id === activePlane)?.hides ?? []).includes(nodeId)}
                onChange={(e) =>
                  onCommand({
                    type: 'set-node-plane-hidden',
                    nodeId,
                    plane: activePlane,
                    hidden: e.target.checked,
                  })
                }
              />
            </label>
          )}
        </>
      )}

      <ColorRow
        value={node.color ?? ''}
        onChange={(v) =>
          onCommand({ type: 'set-node-details', id: nodeId, details: { color: v === '' ? null : v } })
        }
      />

      <ColorRow
        label="Text color"
        value={node.textColor ?? ''}
        onChange={(v) =>
          onCommand({ type: 'set-node-details', id: nodeId, details: { textColor: v === '' ? null : v } })
        }
      />

      <OptionRow
        label="Align"
        value={node.textAlign ?? ''}
        options={ALIGN_OPTIONS}
        onChange={(v) => onCommand({ type: 'set-node-details', id: nodeId, details: { textAlign: v === '' ? null : v } })}
      />
      <OptionRow
        label="Size"
        value={node.fontScale ?? ''}
        options={SIZE_OPTIONS}
        onChange={(v) => onCommand({ type: 'set-node-details', id: nodeId, details: { fontScale: v === '' ? null : v } })}
      />

      <label className="field">
        <span>Icon</span>
        <input
          aria-label="Icon"
          list="node-icon-suggestions"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          onBlur={commitIcon}
          onKeyDown={(e) => commitOnEnter(e, commitIcon)}
        />
        <datalist id="node-icon-suggestions">
          {ICON_SUGGESTIONS.map((i) => (
            <option key={i} value={i} />
          ))}
        </datalist>
      </label>

      <label className="field">
        <span>Shape</span>
        <input
          aria-label="Shape"
          list="node-shape-suggestions"
          value={shape}
          onChange={(e) => setShape(e.target.value)}
          onBlur={commitShape}
          onKeyDown={(e) => commitOnEnter(e, commitShape)}
        />
        <datalist id="node-shape-suggestions">
          {SHAPE_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>

      <label className="field">
        <span>Technology</span>
        <input
          aria-label="Technology"
          value={technology}
          onChange={(e) => setTechnology(e.target.value)}
          onBlur={commitTechnology}
          onKeyDown={(e) => commitOnEnter(e, commitTechnology)}
        />
      </label>

      <label className="field">
        <span>Link</span>
        <input
          aria-label="Link"
          placeholder="https://… or [[Note]]"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onBlur={commitLink}
          onKeyDown={(e) => commitOnEnter(e, commitLink)}
        />
      </label>

      <label className="field">
        <span>Description</span>
        <textarea
          aria-label="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
        />
      </label>

      <LinksSection nodeId={node.id} links={node.links ?? []} onCommand={onCommand} />

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
          {hasPin && (
            <button className="chip" onClick={clearPin}>
              Clear pinned position
            </button>
          )}
        </div>
        <p className="muted">Parent-relative px. Empty = placed by the layout algorithm.</p>
      </section>

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
            <button
              className="chip icon-btn"
              aria-label={`Remove metadata ${row.key}`}
              onClick={() => removeRow(row.id)}
            >
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

      {/* Threats are a generic field, so the section is offered on the notation
       * — but a node that already carries threats keeps it whatever the plane
       * is drawn as, or turning the notation off would strand them. */}
      {(notation === TM_NOTATION || (node.threats?.length ?? 0) > 0) && (
        <ThreatsSection
          target={{ node: node.id }}
          threats={node.threats ?? []}
          applicable={strideFor(node.type)}
          onCommand={onCommand}
        />
      )}

      <CommentsSection target={{ node: node.id }} comments={node.comments ?? []} onCommand={onCommand} />

      {/* Same rule as threats: offered on the notation, kept on a node that
       * already carries dates so switching the plane's look strands nothing.
       * Every date key counts, `end` included — half a span is reachable (clear
       * Start here, or hand-edit the source) and is exactly the state the
       * section exists to finish. */}
      {(notation === PLAN_NOTATION ||
        node.metadata?.start !== undefined ||
        node.metadata?.end !== undefined ||
        node.metadata?.at !== undefined) &&
        PLAN_TYPES.has(node.type ?? '') && (
          <PlanSection model={model} node={node} onCommand={onCommand} />
        )}

      <section className="panel-section">
        <h3>Memberships</h3>
        {memberships.length === 0 && <p className="muted">No containers.</p>}
        {memberships.map((e) => (
          <div key={`${e.parent}:${e.plane ?? ''}`} className="member-row">
            <span>
              {nodeName(e.parent)} <span className="muted">({planeName(e.plane)})</span>
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
    </aside>
  );
}
