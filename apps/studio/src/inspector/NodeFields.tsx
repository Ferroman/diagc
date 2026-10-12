import type { RefObject } from 'react';
import {
  borrowsContainment,
  IMAGE_REF,
  LIBRARY_IMAGE_REF,
  type DiagramModel,
  type DiagramNode,
  type EditorCommand,
  type FontScale,
  type TextAlign,
} from '@diagc/core/internal';
import { BUILTIN_ICON_IDS } from '@diagc/icons';
import { DEFAULT_TYPE_STYLES } from '@diagc/renderer';
import { BUNDLED_LIBRARY } from '../library/packs';
import { seedOnRetype } from '../notations/plan/planActions';
import { commitOnEnter } from './commitOnEnter';
import { ColorRow, OptionRow } from './pickers';
import type { DraftField } from './useDraftField';

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

type Dispatch = (command: EditorCommand) => void;

/** A node's details as one command: what the panel's fields write. */
const details = (node: DiagramNode, patch: Extract<EditorCommand, { type: 'set-node-details' }>['details']) =>
  ({ type: 'set-node-details', id: node.id, details: patch }) as const;

/** The node's name and its type: the two fields the panel opens on. */
export function IdentityFields({
  model,
  node,
  activePlane,
  today,
  name: [name, setName],
  type: [type, setType],
  nameInputRef,
  onCommand,
}: {
  model: DiagramModel;
  node: DiagramNode;
  activePlane: string | undefined;
  /** the host's date; absent, a retype into a plan zone or event seeds no dates */
  today: string | undefined;
  name: DraftField;
  type: DraftField;
  nameInputRef: RefObject<HTMLTextAreaElement | null>;
  onCommand: Dispatch;
}) {
  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setName(node.name);
      return;
    }
    if (trimmed !== node.name) onCommand({ type: 'rename-node', id: node.id, name: trimmed });
  };
  const commitType = () => {
    const trimmed = type.trim();
    if (trimmed === (node.type ?? '')) return;
    const typeCmd: EditorCommand = details(node, { type: trimmed === '' ? null : trimmed });
    // Retyping into plan-zone/plan-event with no dates would otherwise fail
    // save with plan-missing — seed them the way a canvas drop does, batched
    // with the retype so undo reverts both together.
    const dateCmd =
      today !== undefined ? seedOnRetype({ model, plane: activePlane, today }, node.id, trimmed) : undefined;
    onCommand(dateCmd === undefined ? typeCmd : { type: 'batch', commands: [typeCmd, dateCmd] });
  };
  return (
    <>
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
    </>
  );
}

/** Where the node is drawn: its layer, and on a plane of its own containment,
 * whether it is that plane's alone and whether that plane hides it. */
export function PlacementFields({
  model,
  node,
  activePlane,
  onCommand,
}: {
  model: DiagramModel;
  node: DiagramNode;
  activePlane: string | undefined;
  onCommand: Dispatch;
}) {
  return (
    <>
      {model.layers.length > 0 && (
        <label className="field">
          <span>Layer</span>
          <select
            aria-label="Layer"
            value={node.layer ?? ''}
            onChange={(e) => onCommand(details(node, { layer: e.target.value === '' ? null : e.target.value }))}
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

      {activePlane !== undefined && !borrowsContainment(model, activePlane) && (
        <>
          <label className="field">
            <span>Scope</span>
            <select
              aria-label="Scope"
              value={node.plane === activePlane ? 'local' : 'shared'}
              onChange={(e) => onCommand(details(node, { plane: e.target.value === 'local' ? activePlane : null }))}
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
                checked={(model.planes.find((p) => p.id === activePlane)?.hides ?? []).includes(node.id)}
                onChange={(e) =>
                  onCommand({
                    type: 'set-node-plane-hidden',
                    nodeId: node.id,
                    plane: activePlane,
                    hidden: e.target.checked,
                  })
                }
              />
            </label>
          )}
        </>
      )}
    </>
  );
}

/** How the node looks: its colours, text alignment and size, icon and shape. */
export function LookFields({
  node,
  icon: [icon, setIcon],
  shape: [shape, setShape],
  onCommand,
}: {
  node: DiagramNode;
  icon: DraftField;
  shape: DraftField;
  onCommand: Dispatch;
}) {
  const commitIcon = () => {
    if (icon !== (node.icon ?? '')) onCommand(details(node, { icon: icon === '' ? null : icon }));
  };
  const commitShape = () => {
    const trimmed = shape.trim();
    if (trimmed === (node.shape ?? '')) return;
    if (trimmed !== '' && !IMAGE_REF.test(trimmed) && !LIBRARY_IMAGE_REF.test(trimmed)) {
      // Invalid ref: revert rather than let it wedge the validate-before-save gate.
      setShape(node.shape ?? '');
      return;
    }
    onCommand(details(node, { shape: trimmed === '' ? null : trimmed }));
  };
  return (
    <>
      <ColorRow value={node.color ?? ''} onChange={(v) => onCommand(details(node, { color: v === '' ? null : v }))} />

      <ColorRow
        label="Text color"
        value={node.textColor ?? ''}
        onChange={(v) => onCommand(details(node, { textColor: v === '' ? null : v }))}
      />

      <OptionRow
        label="Align"
        value={node.textAlign ?? ''}
        options={ALIGN_OPTIONS}
        onChange={(v) => onCommand(details(node, { textAlign: v === '' ? null : v }))}
      />
      <OptionRow
        label="Size"
        value={node.fontScale ?? ''}
        options={SIZE_OPTIONS}
        onChange={(v) => onCommand(details(node, { fontScale: v === '' ? null : v }))}
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
    </>
  );
}

/** What the node is built with, where it links to, and what it is for. */
export function DetailFields({
  node,
  technology: [technology, setTechnology],
  link: [link, setLink],
  description: [description, setDescription],
  onCommand,
}: {
  node: DiagramNode;
  technology: DraftField;
  link: DraftField;
  description: DraftField;
  onCommand: Dispatch;
}) {
  const commitTechnology = () => {
    if (technology !== (node.technology ?? ''))
      onCommand(details(node, { technology: technology === '' ? null : technology }));
  };
  const commitLink = () => {
    if (link !== (node.link ?? '')) onCommand(details(node, { link: link.trim() === '' ? null : link.trim() }));
  };
  const commitDescription = () => {
    if (description !== (node.description ?? ''))
      onCommand(details(node, { description: description === '' ? null : description }));
  };
  return (
    <>
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
    </>
  );
}
