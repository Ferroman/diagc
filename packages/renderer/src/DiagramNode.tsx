import { useContext, useRef, type CSSProperties } from 'react';
import { Handle, NodeResizer, Position } from '@xyflow/react';
import { FB_CAUSE_TYPE, FB_EFFECT_TYPE, GIT_STAGE_TYPE, TM_NOTATION, threatTargetKey, type Column, type FontScale, type NotationId, type TextAlign, type TextRun, type ThreatTarget } from '@diagc/core';
import type { IconRegistry } from '@diagc/icons';
import type { Registry, TypeStyle } from './registry';
import { LoopHighlightContext } from './loop-highlight';
import { NoteStateContext } from './note-state';
import { notationProfile } from './notations';
import { RichLabelEditor } from './RichLabelEditor';
import { runsToDisplay } from './richtext';
import { SketchShape, type SketchFill } from './SketchShape';
import { TableNode } from './TableNode';
import type { StylePreset } from './stylePresets';
import type { SketchShapeKind } from './sketch';
import { threatBadgeProps } from './threat-badge';
import { typeSubtitle } from './type-subtitle';

export interface DiagramNodeData {
  // --- rendering: identity, look, label ----------------------------------
  label: string;
  typeId?: string;
  icon?: string;
  /** node accent color (border + background tint) */
  color?: string;
  /** label text color; defaults to `color` on C4/shape nodes, else inherited */
  textColor?: string;
  /** implementation technology, composed into the type subtitle */
  technology?: string;
  /** rich multiline label runs; when set, drawn instead of `label` on box nodes */
  rich?: TextRun[];
  /** whole-label horizontal alignment (box nodes) */
  textAlign?: TextAlign;
  /** whole-label relative font size (box nodes) */
  fontScale?: FontScale;
  state: 'leaf' | 'expanded' | 'collapsed';
  promoted: boolean;
  sharedMembers: string[];
  hiddenCount: number;
  /** metadata values surfaced on the node itself (e.g. framework/language/tool) */
  metaBadges?: string[];
  typeRegistry: Registry<TypeStyle>;
  icons: IconRegistry;
  /** asset ref — when set the node body is this image (leaf nodes) */
  image?: string;
  /** SVG silhouette ref → rendered as a tintable mask (takes precedence over image) */
  shape?: string;
  /** URL prefix asset refs resolve against (studio: '/api/assets/') */
  assetBase?: string;
  /** URL prefix substituted for a leading '/library/' on bundled-icon refs
   * (hosts with no static server, e.g. the Obsidian plugin); absent leaves
   * '/library/…' refs untouched (served verbatim by a static server) */
  libraryBase?: string;
  /** style preset with rough params — render hand-drawn chrome (absent = crisp) */
  stylePreset?: StylePreset;
  /** active visual language (e.g. 'causal-loop'); selects the notation profile (see notations.ts) that drives typeless-as-text rendering and other look overrides */
  notation?: NotationId;
  /** drill-view external stub: a ghost chip standing in for an off-frame node an
   * edge points to. Clicking it navigates there. */
  external?: boolean;
  /** ER-table rows (db-table nodes) */
  columns?: Column[];
  /** navigation target (URL or host-interpreted ref, e.g. an Obsidian
   * [[wikilink]]) — present only when the model's node carries one; drives
   * the corner link badge */
  link?: string;
  /** open/total STRIDE threats on the element; absent when it carries none */
  threats?: { open: number; total: number };
  // --- interactions & edit callbacks -------------------------------------
  /** commit rich edits (box leaf nodes); null = cancelled */
  onRichCommit?: (runs: TextRun[] | null) => void;
  /** enter this container — drill into it as its own diagram (nested zoom) */
  onEnterNode?: (id: string) => void;
  /** the node's name is being edited in place (double-click in edit mode) */
  labelEditing?: boolean;
  /** commit the in-place edit; null = cancelled */
  onLabelCommit?: (value: string | null) => void;
  /** edit: persist a resize (wired only for image nodes in edit mode) */
  onResize?: (id: string, w: number, h: number, pos: { x: number; y: number }) => void;
  /** edit mode (db-table): commit a replacement columns array */
  onColumnsChange?: (columns: Column[]) => void;
  /** the fold chip and the CLD group's disclosure toggle (both modes; the
   * viewer wires it too). `next` is the state the click asks for — the
   * opposite of the one on screen. */
  onToggleExpand?: (id: string, next: 'expanded' | 'collapsed') => void;
  /** the link badge was clicked; absent falls back to a best-effort
   * new-tab open for http(s) links (see the badge's onClick below) */
  onOpenLink?: (link: string) => void;
  /** edit: the `+` offer for this node (see EditingApi.quickAdd); absent in
   * view mode or when the host has no recipe */
  quickAdd?: { label: (id: string) => string | undefined; run: (id: string) => void };
  /** edit: open a new threat row on this element's note (see
   * EditingApi.onAddThreat). Absent in view mode; drives the empty badge. */
  onAddThreat?: (target: ThreatTarget) => void;
}

// One connect point per side, all type="source": with the canvas in loose
// connection mode a drag can start and end on any of them, so the gesture's
// start node is always the relation's `from` (direction follows the drag).
const sideHandles = (
  <>
    <Handle id="top" type="source" position={Position.Top} className="dg-handle" />
    <Handle id="right" type="source" position={Position.Right} className="dg-handle" />
    <Handle id="bottom" type="source" position={Position.Bottom} className="dg-handle" />
    <Handle id="left" type="source" position={Position.Left} className="dg-handle" />
  </>
);

/** accent-colored border + subtle same-color fill; undefined color = registry look */
function accentStyle(color: string | undefined): CSSProperties | undefined {
  if (color === undefined) return undefined;
  return {
    borderColor: color,
    background: `color-mix(in srgb, ${color} 14%, var(--dg-node-fill))`,
  };
}

const sketchKind = (shape: string): SketchShapeKind =>
  shape === 'circle' || shape === 'cylinder' || shape === 'hexagon' || shape === 'bubble' ||
  shape === 'person' || shape === 'diamond' || shape === 'bar' || shape === 'start-dot' || shape === 'end-bullseye' ||
  shape === 'send-signal' || shape === 'receive-signal' || shape === 'note' || shape === 'ellipse' || shape === 'store'
    ? (shape as SketchShapeKind)
    : 'box';

/** Resolve a node image ref to a URL. '/library/…' refs are bundled icons: served
 * verbatim where a static server exposes them, or re-prefixed with libraryBase in
 * hosts without one (the Obsidian plugin). Other absolute refs pass through; a
 * bare content-hash ref is served from assetBase (user-uploaded assets). */
const assetUrl = (assetBase: string | undefined, libraryBase: string | undefined, ref: string): string => {
  if (libraryBase !== undefined && ref.startsWith('/library/')) {
    return `${libraryBase}${ref.slice('/library/'.length)}`;
  }
  return ref.startsWith('/') || /^https?:/.test(ref) ? ref : `${assetBase ?? ''}${ref}`;
};

const sketchOf = (
  data: DiagramNodeData,
  shape: string,
  id: string,
  width?: number,
  height?: number,
  fill: SketchFill = 'preset',
): import('react').ReactElement | null =>
  data.stylePreset?.rough !== undefined && width !== undefined && height !== undefined && width > 0 && height > 0 ? (
    <SketchShape
      id={id}
      kind={sketchKind(shape)}
      width={width}
      height={height}
      preset={data.stylePreset}
      fill={fill}
      {...(data.color !== undefined ? { color: data.color } : {})}
    />
  ) : null;

/** The one inline-rename field. Exported because a threat note renames rows with
 * the same gesture and the same commit contract (`null` = cancelled) — a second
 * copy would be a second set of Enter/blur/Escape rules to keep in step. */
export function InlineName({
  label,
  onCommit,
  onTab,
  ariaLabel = 'Rename',
}: {
  label: string;
  onCommit?: (value: string | null) => void;
  /** Tab inside the box: the quick add to chain once the name is committed */
  onTab?: () => void;
  /** what the field renames, for screen readers and for the tests that find it */
  ariaLabel?: string;
}) {
  const done = useRef(false); // Enter commits then blurs — don't commit twice
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onCommit?.(value);
  };
  return (
    <input
      className="dg-label-input nodrag nopan"
      aria-label={ariaLabel}
      defaultValue={label}
      autoFocus
      onFocus={(e) => e.target.select()}
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish((e.target as HTMLInputElement).value);
        else if (e.key === 'Escape') finish(null);
        else if (e.key === 'Tab' && !e.shiftKey) {
          // Tab means "this one is named, give me the next": commit BEFORE the
          // add so the host builds it on the renamed model, then chain. The
          // default would only move focus out of the canvas — the keydown guard
          // never sees this key while an <input> has it. Shift+Tab keeps the
          // default (blur commits, focus walks back), so a name can still be
          // left without extending anything.
          e.preventDefault();
          finish((e.target as HTMLInputElement).value);
          onTab?.();
        }
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

const fontScaleClass = (fs?: FontScale): string => (fs === 'sm' ? ' dg-fs-sm' : fs === 'lg' ? ' dg-fs-lg' : '');

/** Corner badge for a node whose model carries `link` (see DiagramNodeData.link) —
 * shared by every render branch below (and by TableNode, which imports it) so the
 * click semantics live in exactly one place instead of a copy per shape. Renders
 * nothing when the node has no link. */
export function LinkBadge({ data }: { data: DiagramNodeData }): import('react').ReactElement | null {
  if (data.link === undefined) return null;
  const link = data.link;
  return (
    <button
      type="button"
      className="dg-link-badge"
      title={link}
      aria-label={`Open ${link}`}
      onClick={(e) => {
        // The badge is the navigation affordance; a plain node click keeps
        // meaning "select", so the canvas must never see this one.
        e.stopPropagation();
        if (data.onOpenLink !== undefined) data.onOpenLink(link);
        else if (/^https?:/.test(link)) window.open(link, '_blank', 'noopener');
      }}
    >
      🔗
    </button>
  );
}

/** The open-threat count (red) or a green tick once every threat is handled.
 * Stays in exports (no .dg-no-chrome rule): the PNG is where a reviewer sees
 * at a glance what is still open. Where there is nothing to count yet, the same
 * corner offers the first threat instead — chrome, so THAT state is dropped
 * from exports. */
export function ThreatBadge({ id, data }: { id: string; data: DiagramNodeData }): import('react').ReactElement | null {
  // Read before the early returns below: hooks cannot be conditional, and a
  // node with no threats takes one of them.
  const notes = useContext(NoteStateContext);
  const t = data.threats;
  if (t === undefined || t.total === 0) {
    // Edit mode on a threat model: the first threat is one click away on the
    // canvas, so the register can be written without opening the panel. Only
    // there — a badge on every box of a C4 diagram would be noise.
    if (data.onAddThreat === undefined || data.notation !== TM_NOTATION) return null;
    const add = data.onAddThreat;
    return (
      <button
        type="button"
        className="dg-threat-badge nodrag"
        data-state="empty"
        aria-label="Add a threat"
        title="Add a threat"
        // The canvas must read neither the press as the start of a drag nor
        // the click as "select" — the same contract QuickAddButton states.
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          add({ node: id });
        }}
      >
        +
      </button>
    );
  }
  // state/text/title come from the shared derivation so this badge and the
  // flow's chip cannot drift apart in what they say (see threat-badge.ts).
  const { state, text, title } = threatBadgeProps(t);
  // With a canvas that draws bubbles (NoteStateContext provided), the badge is
  // the switch for this element's bubble — in BOTH modes; view mode's toggles
  // are the canvas's own session state. Without one (a host that never draws
  // bubbles, a bare DiagramNode) it stays the passive count it always was.
  // An external stub takes the same passive branch: it stands in for a node
  // this drill view does not draw, and the note derivation skips externals for
  // exactly that reason — the bubble belongs to the view that draws the node,
  // so a switch here would flip a state nothing on this canvas can show.
  if (notes === null || data.external === true) {
    return (
      <span className="dg-threat-badge" data-state={state} title={title}>
        {text}
      </span>
    );
  }
  const open = notes.isOpen(threatTargetKey({ node: id }));
  return (
    <button
      type="button"
      className="dg-threat-badge nodrag"
      data-state={state}
      title={title}
      aria-expanded={open}
      aria-label={`${title} — ${open ? 'hide' : 'show'}`}
      // neither a drag start nor a node click — the empty state's contract
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        notes.toggle({ node: id });
      }}
    >
      {text}
    </button>
  );
}

/** The `+` a selected node offers in edit mode: what the host would add on it
 * (a cause on a bone, a flow to a new process, a connected sibling …), named
 * so the offer is legible before the click. Selected-only, so a busy diagram
 * shows one `+`, and mouse events stop here: the canvas must not read the
 * click as "select" nor the press as the start of a drag. Not exported to
 * PNGs (.dg-no-chrome). Keyboard users have Tab, the same action. */
export function QuickAddButton({
  id,
  data,
  selected,
}: {
  id: string;
  data: DiagramNodeData;
  selected: boolean | undefined;
}): import('react').ReactElement | null {
  if (selected !== true || data.quickAdd === undefined) return null;
  const label = data.quickAdd.label(id);
  if (label === undefined) return null;
  const run = data.quickAdd.run;
  return (
    <button
      type="button"
      className="dg-quick-add nodrag"
      title={`${label} (Tab)`}
      aria-label={label}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        run(id);
      }}
    >
      +
    </button>
  );
}

/** The box label body: rich runs when present, else plain name — with pre-wrap
 * and alignment. Used only on box paths (image caption / group header stay plain). */
function BoxLabel({ data }: { data: DiagramNodeData }): import('react').ReactElement {
  const style: CSSProperties = {
    whiteSpace: 'pre-wrap',
    ...(data.textColor !== undefined ? { color: data.textColor } : {}),
    ...(data.textAlign !== undefined ? { textAlign: data.textAlign } : {}),
  };
  if (data.rich !== undefined) {
    return (
      <span className={`dg-label dg-rich-label${fontScaleClass(data.fontScale)}`} style={style}>
        {runsToDisplay(data.rich).map((r) => {
          let node: import('react').ReactNode = r.text;
          if (r.italic) node = <i>{node}</i>;
          if (r.bold) node = <b>{node}</b>;
          return <span key={r.key}>{node}</span>;
        })}
      </span>
    );
  }
  return (
    <span className={`dg-label${fontScaleClass(data.fontScale)}`} style={style}>
      {data.label}
    </span>
  );
}

export function DiagramNode({
  id,
  data,
  selected,
  width,
  height,
}: {
  id: string;
  data: DiagramNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
}) {
  const style = data.typeId !== undefined ? data.typeRegistry.resolve(data.typeId) : { shape: 'box' as const };
  const profile = notationProfile(data.notation);
  const isTypelessText =
    profile.node?.typelessAsText === true &&
    data.typeId === undefined &&
    (data.state === 'leaf' || data.state === 'collapsed') &&
    data.image === undefined;
  const Icon =
    data.icon !== undefined
      ? data.icons.resolve(data.icon)
      : data.typeId !== undefined
        ? data.icons.resolve(style.icon ?? '')
        : undefined;
  const isContainer = data.state !== 'leaf';
  const isCldGroup = profile.node?.typelessAsText === true && data.typeId === undefined && isContainer;
  // Not gated on isContainer: a branch with no commits yet has no children,
  // so the view compiler marks it 'leaf' — but it is still a lane row (the
  // notation keeps every lane, empty or not, drawn full-width by gitLayout),
  // not an ordinary leaf box.
  const isLane = profile.id === 'git-graph' && data.typeId === 'branch';
  const highlight = useContext(LoopHighlightContext);
  // 'loop': members glow, rest strong-dim. 'focus': members stay normal, rest light-dim.
  const loopClass = !highlight.active
    ? ''
    : highlight.nodes.has(id)
      ? highlight.variant === 'loop'
        ? ' dg-loop-node-hl'
        : ''
      : highlight.variant === 'loop'
        ? ' dg-loop-node-dim'
        : ' dg-focus-node-dim';
  // Tab inside an open label editor is the same offer the `+` chip makes, so it
  // is wired from the same channel: commit, then add. `run` is a no-op when the
  // node has no recipe, so no separate label gate is needed here.
  const quickAdd = data.quickAdd;
  const onTab = quickAdd !== undefined ? () => quickAdd.run(id) : undefined;
  const name =
    data.labelEditing === true ? (
      <InlineName label={data.label} onCommit={data.onLabelCommit} onTab={onTab} />
    ) : (
      <span className="dg-label">{data.label}</span>
    );

  // drill-view external stub: rendered through the normal type-aware branches
  // below so it looks like the original entity, ghosted (translucent, dashed)
  // with a ↗ marker; a click drills into the node it stands in for
  const isExternal = data.external === true;
  const ghostClass = isExternal ? ' dg-ghost' : '';
  const ghostTitle = isExternal ? { title: `${data.label} — click to enter` } : {};
  const ghostArrow = isExternal ? (
    <span className="dg-external-arrow" aria-hidden="true">
      ↗
    </span>
  ) : null;

  if (style.shape === 'table' && data.state === 'leaf') {
    return <TableNode id={id} data={data} selected={selected} />;
  }

  if (style.shape === 'circle' && data.state === 'leaf') {
    // A commit: the box is the circle; the tag hangs above it, outside the
    // layout footprint, so untagged commits and tagged ones take the same room.
    const tagColor = data.textColor ?? data.color;
    return (
      <div
        className={`dg-node dg-circle-node${ghostClass}${loopClass}`}
        {...(data.stylePreset?.rough !== undefined ? {} : { style: accentStyle(data.color) })}
        {...ghostTitle}
      >
        {sketchOf(data, 'circle', id, width, height)}
        {(data.label !== '' || data.labelEditing === true) && (
          <span className="dg-commit-tag" {...(tagColor !== undefined ? { style: { color: tagColor } } : {})}>
            {name}
          </span>
        )}
        <LinkBadge data={data} />
        <QuickAddButton id={id} data={data} selected={selected} />
        {sideHandles}
      </div>
    );
  }

  if (data.shape !== undefined && data.state === 'leaf') {
    const maskUrl = `url("${assetUrl(data.assetBase, data.libraryBase, data.shape)}")`;
    const typeLabel = data.typeId !== undefined ? typeSubtitle(style.label ?? data.typeId, data.technology) : undefined;
    const labelColor = data.textColor ?? data.color;
    return (
      <div className={`dg-node dg-shape-node${ghostClass}${loopClass}`} {...ghostTitle}>
        <span
          className="dg-shape-fill"
          aria-hidden="true"
          style={{ WebkitMaskImage: maskUrl, maskImage: maskUrl, background: data.color ?? 'var(--dg-shape-default)' }}
        />
        <div className="dg-shape-label" {...(labelColor !== undefined ? { style: { color: labelColor } } : {})}>
          {ghostArrow}
          {name}
          {typeLabel !== undefined && typeLabel !== '' ? <span className="dg-type">{typeLabel}</span> : null}
        </div>
        <LinkBadge data={data} />
        <QuickAddButton id={id} data={data} selected={selected} />
        {sideHandles}
      </div>
    );
  }

  // A cornerBadge type's image is container chrome, not the node's body: its
  // leaf keeps the typed-box look (inline thumb) so a group placed before it
  // has children doesn't balloon into a stretched icon.
  if (data.image !== undefined && data.state === 'leaf' && style.cornerBadge !== true) {
    // NodeResizer sits outside the body div: its handles straddle the box edge
    // and the div's overflow:hidden would clip them.
    return (
      <>
        {data.onResize !== undefined && (
          <NodeResizer
            isVisible={selected === true}
            keepAspectRatio
            minWidth={40}
            minHeight={40}
            onResizeEnd={(_e, p) => data.onResize?.(id, p.width, p.height, { x: p.x, y: p.y })}
          />
        )}
        <div
          className={`dg-node dg-image-node${ghostClass}${loopClass}`}
          // icon nodes stay transparent (no accent fill/border); the frame shows on
          // hover/selection via CSS. textColor still tints the caption.
          {...(data.textColor !== undefined ? { style: { color: data.textColor } } : {})}
          {...ghostTitle}
        >
          <img
            className="dg-image"
            src={assetUrl(data.assetBase, data.libraryBase, data.image)}
            alt={data.label}
            draggable={false}
          />
          <div className="dg-image-caption">
            {ghostArrow}
            {name}
          </div>
          <LinkBadge data={data} />
          <QuickAddButton id={id} data={data} selected={selected} />
          {sideHandles}
        </div>
      </>
    );
  }

  const badges = (
    <span className="dg-badges">
      {data.promoted && (
        <span className="dg-badge" data-testid="promoted-marker" title="Promoted shared node">
          ▲
        </span>
      )}
      {data.sharedMembers.length > 0 && (
        <span className="dg-badge" data-testid="shared-badge" title={`Shared members: ${data.sharedMembers.join(', ')}`}>
          ⚭ {data.sharedMembers.length}
        </span>
      )}
      {isContainer && !isCldGroup && data.onEnterNode !== undefined && (
        <button
          type="button"
          className="dg-enter"
          data-testid="enter-chip"
          title="Enter — zoom into this node as its own diagram"
          aria-label="Enter node"
          onClick={(e) => {
            e.stopPropagation();
            data.onEnterNode?.(id);
          }}
        >
          ⤢
        </button>
      )}
      {isContainer && !isCldGroup && (
        // A plain fold toggle: the glyph says what the box IS (open/shut) and a
        // click flips it. The host is told the state to land in, because only
        // the view knows the current one — a container can be open through
        // focus with no pin at all, and a blind flip of the pin would then be
        // a click that changes nothing.
        <button
          type="button"
          className="dg-fold"
          data-testid="fold-chip"
          title={data.state === 'expanded' ? 'Collapse' : 'Expand'}
          aria-label={data.state === 'expanded' ? 'Collapse' : 'Expand'}
          aria-expanded={data.state === 'expanded'}
          onClick={(e) => {
            e.stopPropagation();
            data.onToggleExpand?.(id, data.state === 'expanded' ? 'collapsed' : 'expanded');
          }}
        >
          {data.state === 'expanded' ? '▾' : '▸'}
        </button>
      )}
      {isCldGroup && (
        <button
          type="button"
          className="dg-disclose"
          data-testid="disclose-chip"
          title={data.state === 'expanded' ? 'Collapse group' : 'Expand group'}
          aria-label={data.state === 'expanded' ? 'Collapse group' : 'Expand group'}
          onClick={(e) => {
            e.stopPropagation();
            data.onToggleExpand?.(id, data.state === 'expanded' ? 'collapsed' : 'expanded');
          }}
        >
          {data.state === 'expanded' ? '▾' : '▸'}
        </button>
      )}
    </span>
  );
  const metaBadges =
    data.metaBadges !== undefined && data.metaBadges.length > 0 ? (
      <span className="dg-meta">
        {data.metaBadges.map((m) => (
          <span key={m} className="dg-meta-badge">
            {m}
          </span>
        ))}
      </span>
    ) : null;

  if (isLane) {
    // A lane is a row, not a box: no border, no fill, none of the fold/enter/pin
    // chrome (the notation keeps it expanded). Its name sits in a tinted box at
    // the band's right end — the reference's "Master / Nightly" labels. Width
    // and inset mirror GIT_LAYOUT.LABEL_W / MARGIN in styles.css. The `+`
    // (append a commit) takes the chip's default spot, just past the row's
    // right end — beside the name, where the lane is grabbed.
    return (
      <div className={`dg-lane${loopClass}`}>
        <span className="dg-lane-label" {...(data.color !== undefined ? { style: { ...accentStyle(data.color), color: data.textColor ?? data.color } } : {})}>
          {name}
        </span>
        <QuickAddButton id={id} data={data} selected={selected} />
        {sideHandles}
      </div>
    );
  }

  if (data.typeId === FB_EFFECT_TYPE) {
    // The effect IS the spine: fishboneLayout sizes this node across the whole
    // fish, the line fills it and the head box sits at its right end (the
    // git-lane trick — no overlay needed). Flex lets the line take whatever the
    // box leaves, so nothing here needs to know the box's width.
    return (
      <div className={`dg-fb-head${loopClass}`}>
        <span className="dg-fb-spine" aria-hidden="true" />
        <span className="dg-fb-head-box">{name}</span>
        <QuickAddButton id={id} data={data} selected={selected} />
        {sideHandles}
      </div>
    );
  }

  if (data.typeId === FB_CAUSE_TYPE) {
    // A cause is text on a line, not a box: no border, no fill, and no accent —
    // the bone colour belongs to the line (the profile's edge colour), the text
    // stays readable in the theme's own colour unless the author picks one.
    return (
      <div className={`dg-fb-cause${loopClass}`} {...(data.textColor !== undefined ? { style: { color: data.textColor } } : {})}>
        {name}
        <QuickAddButton id={id} data={data} selected={selected} />
        {sideHandles}
      </div>
    );
  }

  if (data.typeId === GIT_STAGE_TYPE) {
    // A stage is a frame across every lane of a git graph (see gitLayout). The
    // frame itself lets the pointer through — commits and lane lines sit inside
    // it and must stay clickable — so only its title can be grabbed.
    return (
      <div
        className={`dg-git-stage${loopClass}`}
        {...(data.color !== undefined ? { style: { '--dg-stage': data.color } as CSSProperties } : {})}
      >
        <span className="dg-git-stage-name" {...(data.textColor !== undefined ? { style: { color: data.textColor } } : {})}>
          {name}
        </span>
      </div>
    );
  }

  // Activity chrome keys on the type, not container state: an empty lane or
  // frame has no children, compiles as 'leaf', and must still render as a
  // band/frame — never as an ordinary leaf box (the git empty-lane lesson).
  if (data.typeId === 'activity-lane' || data.typeId === 'activity-frame') {
    const isFrame = data.typeId === 'activity-frame';
    return (
      <div
        className={`${isFrame ? 'dg-activity-frame' : 'dg-activity-lane'}${loopClass}`}
        {...(data.color !== undefined ? { style: { '--dg-act-accent': data.color } as CSSProperties } : {})}
      >
        <span className="dg-activity-strip">
          <span className="dg-activity-name">{name}</span>
        </span>
        {sideHandles}
      </div>
    );
  }
  if (data.typeId === 'activity-region') {
    return (
      <div className={`dg-activity-region${loopClass}`}>
        {(data.label !== '' || data.labelEditing === true) && <span className="dg-activity-region-name">{name}</span>}
        {sideHandles}
      </div>
    );
  }

  if (isCldGroup && data.state === 'expanded') {
    // Members render as their own loose React Flow nodes within this node's
    // (now transparent) bounds; we only draw a small name tag + collapse toggle.
    return (
      <div className={`dg-cld-group${loopClass}`}>
        <span className="dg-group-tag">
          <span className="dg-label">{data.label}</span>
          <button
            type="button"
            className="dg-disclose"
            data-testid="disclose-chip"
            title="Collapse group"
            aria-label="Collapse group"
            onClick={(e) => {
              e.stopPropagation();
              data.onToggleExpand?.(id, 'collapsed');
            }}
          >
            ▾
          </button>
        </span>
        {sideHandles}
      </div>
    );
  }

  if (data.state === 'expanded') {
    // Outline group types (C4 boundaries, AWS regions/VPCs) draw a pure colored
    // line — no accent tint; the stencil's boundary is a line, not a wash.
    const groupOutline = style.outline === true && data.color !== undefined;
    const corner = style.cornerBadge === true;
    return (
      <div
        className={`dg-group${style.dashed === true ? ' dg-dashed' : ''}${groupOutline ? ' dg-group-outline' : ''}${corner ? ' dg-group-corner' : ''}${loopClass}`}
        {...(data.stylePreset?.rough !== undefined
          ? {}
          : {
              style: groupOutline
                ? { borderColor: data.color, color: data.textColor ?? data.color }
                : { ...accentStyle(data.color), ...(data.textColor !== undefined ? { color: data.textColor } : {}) },
            })}
      >
        {/* never the preset's own fill: this box is where the children and their
            edges are drawn (see SketchFill) — and an outline group stays a line */}
        {sketchOf(data, style.shape, id, width, height, groupOutline ? 'none' : 'wash')}
        <ThreatBadge id={id} data={data} />
        <QuickAddButton id={id} data={data} selected={selected} />
        <div className="dg-group-header">
          {data.image !== undefined && (
            <img
              className={corner ? 'dg-corner-badge' : 'dg-image-thumb'}
              src={assetUrl(data.assetBase, data.libraryBase, data.image)}
              alt=""
              draggable={false}
            />
          )}
          {Icon !== undefined && <Icon size={14} className="dg-icon" />}
          {name}
          {metaBadges}
          {badges}
        </div>
        {sideHandles}
      </div>
    );
  }

  const outline = style.outline === true && data.color !== undefined;
  // Registry solid look (e.g. the C4 profile): applies only when nothing more
  // specific colours the node — an explicit color keeps today's accent path.
  const solid =
    data.color === undefined && style.fill !== undefined
      ? {
          background: style.fill,
          borderColor: style.fill,
          ...(style.textOn !== undefined ? { color: style.textOn } : {}),
        }
      : undefined;
  const boxAccent = {
    ...(solid ?? (outline ? { borderColor: data.color, color: data.color } : accentStyle(data.color))),
    // an explicit text color overrides the default (which follows the accent on C4 boxes)
    ...(data.textColor !== undefined ? { color: data.textColor } : {}),
  };
  // an explicit empty registry label (UML glyphs) suppresses the type subtitle entirely
  const typeLabel = data.typeId !== undefined ? typeSubtitle(style.label ?? data.typeId, data.technology) : undefined;
  // UML draws these glyphs in a fixed neutral stroke — the docs promise node.color is
  // ignored on bars/start/end, so skip the inline accent that would otherwise tint them
  const neutralGlyph = style.shape === 'bar' || style.shape === 'start-dot' || style.shape === 'end-bullseye';

  return (
    <div
      className={
        isTypelessText
          ? `dg-node dg-text-node${ghostClass}${loopClass}`
          : `dg-node dg-shape-${style.shape}${style.dashed === true ? ' dg-dashed' : ''}${outline ? ' dg-c4-outline' : ''}${solid !== undefined && data.stylePreset?.rough === undefined ? ' dg-solid' : ''}${ghostClass}${loopClass}`
      }
      {...(data.stylePreset?.rough !== undefined || isTypelessText || neutralGlyph ? {} : { style: boxAccent })}
      {...ghostTitle}
    >
      {!isTypelessText && sketchOf(data, style.shape, id, width, height)}
      <div className="dg-node-row">
        {ghostArrow}
        {data.image !== undefined && (
          <img className="dg-image-thumb" src={assetUrl(data.assetBase, data.libraryBase, data.image)} alt="" draggable={false} />
        )}
        {Icon !== undefined && <Icon size={16} className="dg-icon" />}
        {data.labelEditing === true ? (
          <RichLabelEditor
            runs={data.rich ?? (data.label !== '' ? [{ text: data.label }] : [])}
            onCommit={(r) => (data.onRichCommit ?? ((_r: TextRun[] | null) => {}))(r)}
            onTab={onTab}
          />
        ) : (
          <BoxLabel data={data} />
        )}
        {data.state === 'collapsed' && !isCldGroup && <span className="dg-count">{data.hiddenCount}</span>}
        {badges}
      </div>
      {typeLabel !== undefined && typeLabel !== '' ? <span className="dg-type">{typeLabel}</span> : null}
      {metaBadges}
      <LinkBadge data={data} />
      <ThreatBadge id={id} data={data} />
      <QuickAddButton id={id} data={data} selected={selected} />
      {sideHandles}
    </div>
  );
}
