import { useContext } from 'react';
import type {
  Column,
  ElementRef,
  FontScale,
  NotationId,
  PlanRole,
  Point,
  TextAlign,
  TextRun,
} from '@diagc/core/internal';
import type { IconRegistry } from '@diagc/icons';
import type { Registry, TypeStyle } from '../registry';
import type { AnnotationCounts } from '../notes/comment-badge';
import { LoopHighlightContext } from '../loops/loop-highlight';
import { notationProfile, type NodeChip } from '../notations';
import type { StylePreset } from '../sketch/stylePresets';
import type { EditingApi } from '../canvas/view-types';
import { NODE_BODIES } from './bodies';
import { InlineName } from './InlineName';

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
   * new-tab open for http(s) links (see LinkBadge in chrome.tsx) */
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
   * notation's drag-over outline. Like `selected`, but on `data`: useNodeDragging
   * patches it directly onto React Flow's node copy rather than deriving it
   * through the cached node-data builder (see withDropTarget). */
  dropTarget?: boolean;
}

/**
 * One React Flow node. The preamble here is what every body shares — the
 * type's look, the notation, the name or its rename field, the loop highlight
 * and the external stub's ghosting; which body draws the rest is NODE_BODIES'
 * first match (bodies/index.ts).
 */
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
  const style: TypeStyle =
    data.typeId !== undefined ? data.typeRegistry.resolve(data.typeId) : { shape: 'box' as const };
  const profile = notationProfile(data.notation);
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
  const isExternal = data.external === true;
  const ghost = {
    className: isExternal ? ' dg-ghost' : '',
    title: isExternal ? { title: `${data.label} — click to enter` } : {},
    arrow: isExternal ? (
      <span className="dg-external-arrow" aria-hidden="true">
        ↗
      </span>
    ) : null,
  };
  const { Body } = NODE_BODIES.find((rule) => rule.match(data, profile, style))!;
  return (
    <Body
      id={id}
      data={data}
      selected={selected}
      width={width}
      height={height}
      profile={profile}
      parts={{ style, name, loopClass, highlight, ghost, onTab }}
    />
  );
}
