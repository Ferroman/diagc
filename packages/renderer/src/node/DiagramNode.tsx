import { useContext, type CSSProperties } from 'react';
import { NodeResizer } from '@xyflow/react';
import {
  ACTIVITY_FRAME_TYPE,
  ACTIVITY_REGION_TYPE,
  FB_CAUSE_TYPE,
  FB_EFFECT_TYPE,
  GIT_STAGE_TYPE,
  isActivityBand,
  PLAN_EVENT_TYPE,
  type Column,
  type FontScale,
  type NotationId,
  type PlanRole,
  type Point,
  type TextAlign,
  type TextRun,
  type ElementRef,
} from '@diagc/core/internal';
import type { IconRegistry } from '@diagc/icons';
import type { Registry, TypeStyle } from '../registry';
import type { AnnotationCounts } from '../notes/comment-badge';
import { LoopHighlightContext } from '../loops/loop-highlight';
import { notationProfile, type NodeChip } from '../notations';
import { RichLabelEditor } from './RichLabelEditor';
import { runsToDisplay } from './richtext';
import { outlineInk } from './outline-ink';
import { TableNode } from './TableNode';
import type { StylePreset } from '../sketch/stylePresets';
import { typeSubtitle } from './type-subtitle';
import type { EditingApi } from '../canvas/view-types';
import { CommentBadge, LinkBadge, QuickAddButton, sideHandles, ThreatBadge } from './chrome';
import { InlineName } from './InlineName';
import { accentStyle, assetUrl, isCausalGroup, sketchOf, XResizer } from './node-look';
import { FoldChip, NodeChips } from './NodeChips';

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
  /** drill-view external stub: a ghost standing in for an off-frame node an
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
  /** comment/link counts on the element; absent when it carries neither */
  annotations?: AnnotationCounts;
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
  onResize?: (id: string, w: number, h: number, pos: Point) => void;
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
  quickAdd?: EditingApi['quickAdd'];
  /** edit, plan notation: a role chip's menu chose a role for its actor, or
   * `null` to remove it (see EditingApi.onSetRole). Absent in view mode or off
   * the plan notation — the chip then stays the plain span it always was. */
  onSetRole?: (zoneId: string, actorId: string, role: PlanRole | null) => void;
  /** edit: open a new threat row on this element's note (see
   * EditingApi.onAddThreat). Absent in view mode; drives the empty badge. */
  onAddThreat?: (target: ElementRef) => void;
  /** notation chips — the plan's roles — drawn in the badge row */
  chips?: NodeChip[];
  /** with onResize: the notation resizes this node on x only, from either
   * side (a zone's width is its dates) */
  resizeAxis?: 'x';
  /** this node is the drop target under the pointer during a single-node
   * drag that could land on it (see EditingApi.onDropInto) — draws the
   * notation's drag-over outline. Like `selected`, but on `data`: DiagramView
   * patches it directly onto React Flow's node copy rather than deriving it
   * through the cached node-data builder (see withDropTarget). */
  dropTarget?: boolean;
}

const fontScaleClass = (fs?: FontScale): string => (fs === 'sm' ? ' dg-fs-sm' : fs === 'lg' ? ' dg-fs-lg' : '');

/** The box label body: rich runs when present, else plain name — with pre-wrap
 * and alignment. Used only on box paths (image caption / group header stay plain). */
function BoxLabel({ data }: { data: DiagramNodeData }): import('react').ReactElement {
  const style: CSSProperties = {
    whiteSpace: 'pre-wrap',
    color: data.textColor,
    textAlign: data.textAlign,
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
  const isCldGroup = isCausalGroup(data, profile);
  // Not gated on the node having members: a branch with no commits yet has no children,
  // so the view compiler marks it 'leaf' — but it is still a lane row (the
  // notation keeps every lane, empty or not, drawn full-width by gitLayout),
  // not an ordinary leaf box.
  const isLane = data.typeId !== undefined && profile.node?.isLane?.(data.typeId) === true;
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
  // The plan's reciprocal mark, on top of the dim above: a zone whose role
  // chip matches the selected actor gets an outline in that chip's colour
  // (the badge carries the actor's own colour already — see planChips);
  // going the other way, an actor that `related` put in a selected zone's
  // neighbourhood gets the same outline in ITS OWN colour. Neither reads
  // `loopClass`'s dim set directly: a zone's chip is the ground truth for
  // which actor lit it up, and an actor's own accent is its own to carry.
  const focusId = highlight.focusId;
  const activeChip = focusId !== null ? data.chips?.find((c) => c.refId === focusId) : undefined;
  // The notation says which types are actors (profile.node.actorOutline).
  const isPlanActorType = data.typeId !== undefined && profile.node?.actorOutline?.(data.typeId) === true;
  const hitColor =
    activeChip !== undefined
      ? (activeChip.color ?? 'var(--dg-accent)')
      : focusId !== null && isPlanActorType && id !== focusId && highlight.nodes.has(id)
        ? (data.color ?? 'var(--dg-accent)')
        : undefined;
  const hitStyle = hitColor !== undefined ? ({ '--dg-hit': hitColor } as CSSProperties) : undefined;
  const hitAttrs = hitColor !== undefined ? { 'data-plan-hit': true } : {};
  // The drag-over outline (see DiagramNodeData.dropTarget / EditingApi.onDropInto).
  const dropTargetAttrs = data.dropTarget === true ? { 'data-drop-target': true } : {};
  // Tab inside an open label editor is the same offer the quick-add button makes, so it
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
    // The table draws its own header, so none of the branches below ever place `name`
    // for it: hand the rename field over, or double-click and a dropped Table stencil
    // would flip `labelEditing` with nothing on screen to type into.
    return (
      <TableNode id={id} data={data} selected={selected} titleEditor={data.labelEditing === true ? name : undefined} />
    );
  }

  if (style.shape === 'circle' && data.state === 'leaf') {
    // A commit: the box is the circle; the tag hangs above it, outside the
    // layout footprint, so untagged commits and tagged ones take the same room.
    const tagColor = data.textColor ?? data.color;
    return (
      <div
        className={`dg-node dg-circle-node${ghostClass}${loopClass}`}
        style={data.stylePreset?.rough !== undefined ? undefined : accentStyle(data.color)}
        {...ghostTitle}
      >
        {sketchOf(data, 'circle', { id, width, height })}
        {(data.label !== '' || data.labelEditing === true) && (
          <span className="dg-commit-tag" style={tagColor !== undefined ? { color: tagColor } : undefined}>
            {name}
          </span>
        )}
        <LinkBadge data={data} />
        <QuickAddButton id={id} data={data} selected={selected} />
        {sideHandles}
      </div>
    );
  }

  if (data.typeId === PLAN_EVENT_TYPE && data.state === 'leaf') {
    // A plan event: the box is a small diamond (drawn by ::before — the generic
    // diamond clip-paths its root, which would clip the name away) and the
    // name hangs beside it, outside the layout footprint like a commit's tag.
    return (
      <div
        className={`dg-node dg-event-node${ghostClass}${loopClass}`}
        style={data.stylePreset?.rough !== undefined || data.color === undefined ? undefined : { color: data.color }}
        data-type={data.typeId}
        {...ghostTitle}
      >
        {sketchOf(data, 'diamond', { id, width, height })}
        {(data.label !== '' || data.labelEditing === true) && <span className="dg-event-tag">{name}</span>}
        <LinkBadge data={data} />
        <CommentBadge id={id} data={data} />
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
        <div className="dg-shape-label" style={labelColor !== undefined ? { color: labelColor } : undefined}>
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
          style={data.textColor !== undefined ? { color: data.textColor } : undefined}
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

  const badges = <NodeChips id={id} data={data} profile={profile} focusId={focusId} />;
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
    // and inset mirror GIT_LAYOUT.LABEL_W / MARGIN in styles.css. The quick-add
    // button (append a commit) keeps its default spot, just past the row's
    // right end — beside the name, where the lane is grabbed.
    return (
      <div className={`dg-lane${loopClass}`}>
        <span
          className="dg-lane-label"
          style={
            data.color !== undefined ? { ...accentStyle(data.color), color: data.textColor ?? data.color } : undefined
          }
        >
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
    // git-lane trick — no canvas overlay needed). Flex lets the line take whatever the
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
      <div
        className={`dg-fb-cause${loopClass}`}
        style={data.textColor !== undefined ? { color: data.textColor } : undefined}
      >
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
        style={data.color !== undefined ? ({ '--dg-stage': data.color } as CSSProperties) : undefined}
      >
        <span
          className="dg-git-stage-name"
          style={data.textColor !== undefined ? { color: data.textColor } : undefined}
        >
          {name}
        </span>
      </div>
    );
  }

  // Activity chrome keys on the type, not container state: an empty lane or
  // frame has no children, compiles as 'leaf', and must still render as a
  // band/frame — never as an ordinary leaf box (the git empty-lane lesson).
  if (isActivityBand(data.typeId)) {
    const isFrame = data.typeId === ACTIVITY_FRAME_TYPE;
    return (
      <div
        className={`${isFrame ? 'dg-activity-frame' : 'dg-activity-lane'}${loopClass}`}
        style={data.color !== undefined ? ({ '--dg-act-accent': data.color } as CSSProperties) : undefined}
      >
        <span className="dg-activity-strip">
          <span className="dg-activity-name">{name}</span>
        </span>
        {sideHandles}
        {!isFrame && (
          <>
            <QuickAddButton id={id} data={data} selected={selected} side="before" />
            <QuickAddButton id={id} data={data} selected={selected} side="after" />
          </>
        )}
      </div>
    );
  }
  if (data.typeId === ACTIVITY_REGION_TYPE) {
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
          <FoldChip id={id} data={data} group />
        </span>
        {sideHandles}
      </div>
    );
  }

  if (data.state === 'expanded') {
    // Outline group types (C4 boundaries, AWS regions/VPCs) draw a pure colored
    // line — no accent tint; the stencil's boundary is a line, not a wash.
    const groupInk = style.outline === true && data.color !== undefined ? outlineInk(data.color) : undefined;
    const groupOutline = groupInk !== undefined;
    const corner = style.cornerBadge === true;
    return (
      <div
        className={`dg-group${style.dashed === true ? ' dg-dashed' : ''}${groupOutline ? ' dg-group-outline' : ''}${corner ? ' dg-group-corner' : ''}${loopClass}`}
        style={
          data.stylePreset?.rough !== undefined
            ? hitStyle
            : {
                ...(groupInk !== undefined
                  ? { borderColor: groupInk, color: data.textColor ?? groupInk }
                  : accentStyle(data.color)),
                ...(data.textColor !== undefined ? { color: data.textColor } : {}),
                ...hitStyle,
              }
        }
        data-type={data.typeId}
        {...hitAttrs}
        {...dropTargetAttrs}
      >
        <XResizer id={id} data={data} selected={selected} />
        {/* never the preset's own fill: this box is where the children and their
            edges are drawn (see SketchFill) — and an outline group stays a line */}
        {sketchOf(data, style.shape, { id, width, height }, groupOutline ? 'none' : 'wash')}
        <ThreatBadge id={id} data={data} />
        <CommentBadge id={id} data={data} />
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

  const ink = style.outline === true && data.color !== undefined ? outlineInk(data.color) : undefined;
  const outline = ink !== undefined;
  // Registry solid look (e.g. the C4 profile): applies only when nothing more
  // specific colours the node — an explicit color keeps today's accent path.
  const solid =
    data.color === undefined && style.fill !== undefined
      ? {
          background: style.fill,
          borderColor: style.fill,
          color: style.textOn,
        }
      : undefined;
  const boxAccent: CSSProperties = {
    ...(solid ?? (ink !== undefined ? { borderColor: ink, color: ink } : accentStyle(data.color))),
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
      style={
        data.stylePreset?.rough !== undefined || isTypelessText || neutralGlyph
          ? hitStyle
          : { ...boxAccent, ...hitStyle }
      }
      data-type={data.typeId}
      {...hitAttrs}
      {...dropTargetAttrs}
      {...ghostTitle}
    >
      <XResizer id={id} data={data} selected={selected} />
      {!isTypelessText && sketchOf(data, style.shape, { id, width, height })}
      {style.shape === 'diamond' && data.stylePreset?.rough === undefined && (
        // A clip-path cut the border off every diagonal edge, leaving the diamond
        // drawn by its fill alone — near the canvas colour in the light theme. The
        // polygon carries both, in the same colours the box would have used.
        <svg className="dg-diamond-glyph" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon
            points="50,1 99,50 50,99 1,50"
            vectorEffect="non-scaling-stroke"
            fill={String(boxAccent.background ?? 'var(--dg-node-fill)')}
            stroke={boxAccent.borderColor ?? 'var(--dg-node-stroke)'}
          />
        </svg>
      )}
      <div className={style.captionBelow === true ? 'dg-node-row dg-glyph-caption' : 'dg-node-row'}>
        {ghostArrow}
        {data.image !== undefined && (
          <img
            className="dg-image-thumb"
            src={assetUrl(data.assetBase, data.libraryBase, data.image)}
            alt=""
            draggable={false}
          />
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
      <CommentBadge id={id} data={data} />
      <QuickAddButton id={id} data={data} selected={selected} />
      {sideHandles}
    </div>
  );
}
