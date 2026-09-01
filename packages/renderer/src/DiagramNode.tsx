import { useContext, useRef, type CSSProperties } from 'react';
import { Handle, NodeResizer, Position } from '@xyflow/react';
import type { Column, FontScale, NotationId, TextAlign, TextRun } from '@diagramming/core';
import type { IconRegistry } from '@diagramming/icons';
import type { Registry, TypeStyle } from './registry';
import { LoopHighlightContext } from './loop-highlight';
import { notationProfile } from './notations';
import { RichLabelEditor } from './RichLabelEditor';
import { runsToDisplay } from './richtext';
import { SketchShape } from './SketchShape';
import { TableNode } from './TableNode';
import type { StylePreset } from './stylePresets';
import type { SketchShapeKind } from './sketch';
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
  pinned?: 'expanded' | 'collapsed';
  typeRegistry: Registry<TypeStyle>;
  icons: IconRegistry;
  /** asset ref — when set the node body is this image (leaf nodes) */
  image?: string;
  /** SVG silhouette ref → rendered as a tintable mask (takes precedence over image) */
  shape?: string;
  /** URL prefix asset refs resolve against (studio: '/api/assets/') */
  assetBase?: string;
  /** style preset with rough params — render hand-drawn chrome (absent = crisp) */
  stylePreset?: StylePreset;
  /** active visual language (e.g. 'causal-loop'); selects the notation profile (see notations.ts) that drives typeless-as-text rendering and other look overrides */
  notation?: NotationId;
  /** drill-view external stub: a ghost chip standing in for an off-frame node an
   * edge points to. Clicking it navigates there. */
  external?: boolean;
  /** ER-table rows (db-table nodes) */
  columns?: Column[];
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
  /** pin/expand affordances (both modes; the viewer wires them too) */
  onTogglePin?: (id: string) => void;
  /** CLD group: expand/collapse via the disclosure toggle (binary) */
  onToggleExpand?: (id: string) => void;
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
  shape === 'send-signal' || shape === 'receive-signal' || shape === 'note'
    ? (shape as SketchShapeKind)
    : 'box';

/** Resolve a node image ref to a URL. Absolute refs (leading '/' or http[s]) —
 * bundled library icons under /library/… — are used as-is; a bare content-hash
 * ref is served from assetBase (user-uploaded assets). */
const assetUrl = (assetBase: string | undefined, ref: string): string =>
  ref.startsWith('/') || /^https?:/.test(ref) ? ref : `${assetBase ?? ''}${ref}`;

const sketchOf = (
  data: DiagramNodeData,
  shape: string,
  id: string,
  width?: number,
  height?: number,
): import('react').ReactElement | null =>
  data.stylePreset?.rough !== undefined && width !== undefined && height !== undefined && width > 0 && height > 0 ? (
    <SketchShape
      id={id}
      kind={sketchKind(shape)}
      width={width}
      height={height}
      preset={data.stylePreset}
      {...(data.color !== undefined ? { color: data.color } : {})}
    />
  ) : null;

function InlineName({ label, onCommit }: { label: string; onCommit?: (value: string | null) => void }) {
  const done = useRef(false); // Enter commits then blurs — don't commit twice
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onCommit?.(value);
  };
  return (
    <input
      className="dg-label-input nodrag nopan"
      aria-label="Rename"
      defaultValue={label}
      autoFocus
      onFocus={(e) => e.target.select()}
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish((e.target as HTMLInputElement).value);
        else if (e.key === 'Escape') finish(null);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

const fontScaleClass = (fs?: FontScale): string => (fs === 'sm' ? ' dg-fs-sm' : fs === 'lg' ? ' dg-fs-lg' : '');

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
  const name =
    data.labelEditing === true ? (
      <InlineName label={data.label} onCommit={data.onLabelCommit} />
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
    return <TableNode data={data} />;
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
        {sideHandles}
      </div>
    );
  }

  if (data.shape !== undefined && data.state === 'leaf') {
    const maskUrl = `url("${assetUrl(data.assetBase, data.shape)}")`;
    const typeLabel = data.typeId !== undefined ? (style.label ?? data.typeId) : undefined;
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
        {sideHandles}
      </div>
    );
  }

  if (data.image !== undefined && data.state === 'leaf') {
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
            src={assetUrl(data.assetBase, data.image)}
            alt={data.label}
            draggable={false}
          />
          <div className="dg-image-caption">
            {ghostArrow}
            {name}
          </div>
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
        <button
          type="button"
          className="dg-pin"
          data-testid="pin-chip"
          title={data.pinned !== undefined ? `Pinned ${data.pinned}` : 'Auto (click to pin)'}
          onClick={(e) => {
            e.stopPropagation();
            data.onTogglePin?.(id);
          }}
        >
          {data.pinned !== undefined ? '📌' : '◇'}
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
            data.onToggleExpand?.(id);
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
    // and inset mirror GIT_LAYOUT.LABEL_W / MARGIN in styles.css.
    return (
      <div className={`dg-lane${loopClass}`}>
        <span className="dg-lane-label" {...(data.color !== undefined ? { style: { ...accentStyle(data.color), color: data.textColor ?? data.color } } : {})}>
          {name}
        </span>
        {sideHandles}
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
              data.onToggleExpand?.(id);
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
    return (
      <div
        className={`dg-group${style.dashed === true ? ' dg-dashed' : ''}${loopClass}`}
        {...(data.stylePreset?.rough !== undefined
          ? {}
          : { style: { ...accentStyle(data.color), ...(data.textColor !== undefined ? { color: data.textColor } : {}) } })}
      >
        {sketchOf(data, style.shape, id, width, height)}
        <div className="dg-group-header">
          {data.image !== undefined && (
            <img className="dg-image-thumb" src={assetUrl(data.assetBase, data.image)} alt="" draggable={false} />
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
          : `dg-node dg-shape-${style.shape}${style.dashed === true ? ' dg-dashed' : ''}${outline ? ' dg-c4-outline' : ''}${ghostClass}${loopClass}`
      }
      {...(data.stylePreset?.rough !== undefined || isTypelessText || neutralGlyph ? {} : { style: boxAccent })}
      {...ghostTitle}
    >
      {!isTypelessText && sketchOf(data, style.shape, id, width, height)}
      <div className="dg-node-row">
        {ghostArrow}
        {data.image !== undefined && (
          <img className="dg-image-thumb" src={assetUrl(data.assetBase, data.image)} alt="" draggable={false} />
        )}
        {Icon !== undefined && <Icon size={16} className="dg-icon" />}
        {data.labelEditing === true ? (
          <RichLabelEditor
            runs={data.rich ?? (data.label !== '' ? [{ text: data.label }] : [])}
            onCommit={(r) => (data.onRichCommit ?? ((_r: TextRun[] | null) => {}))(r)}
          />
        ) : (
          <BoxLabel data={data} />
        )}
        {data.state === 'collapsed' && !isCldGroup && <span className="dg-count">{data.hiddenCount}</span>}
        {badges}
      </div>
      {typeLabel !== undefined && typeLabel !== '' ? <span className="dg-type">{typeLabel}</span> : null}
      {metaBadges}
      {sideHandles}
    </div>
  );
}
