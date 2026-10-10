import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { FontScale, TextRun } from '@diagc/core/internal';
import type { NotationProfile } from '../../notations';
import type { TypeStyle } from '../../registry';
import { NodeChrome } from '../chrome';
import type { DiagramNodeData } from '../DiagramNode';
import {
  accentStyle,
  assetUrl,
  dropTargetAttrs,
  isCausalGroup,
  MetaBadges,
  nodeIcon,
  planHit,
  sketchOf,
  TypeSubtitle,
  XResizer,
} from '../node-look';
import { NodeChips } from '../NodeChips';
import { outlineInk } from '../outline-ink';
import { RichLabelEditor } from '../RichLabelEditor';
import { runsToDisplay } from '../richtext';
import type { BodyProps } from './types';

/** Every node no other body claims: a box in the registry's shape, or on a
 * notation that draws untyped nodes as text (causal loops), a text node. */
export function BoxBody(props: BodyProps) {
  const { id, data, selected, width, height, profile, parts } = props;
  const { style, loopClass, ghost, highlight } = parts;
  const { hitStyle, hitAttrs } = planHit(id, data, profile, highlight);
  const isTypelessText = isTextNode(data, profile);
  const look = boxLook(data, style);
  return (
    <div
      className={
        isTypelessText
          ? `dg-node dg-text-node${ghost.className}${loopClass}`
          : `${look.className}${ghost.className}${loopClass}`
      }
      style={
        data.stylePreset?.rough !== undefined || isTypelessText || look.neutralGlyph
          ? hitStyle
          : { ...look.accent, ...hitStyle }
      }
      data-type={data.typeId}
      {...hitAttrs}
      {...dropTargetAttrs(data)}
      {...ghost.title}
    >
      <XResizer id={id} data={data} selected={selected} />
      {!isTypelessText && sketchOf(data, style.shape, { id, width, height })}
      {style.shape === 'diamond' && data.stylePreset?.rough === undefined && <DiamondGlyph accent={look.accent} />}
      <BoxRow {...props} />
      <TypeSubtitle data={data} style={style} />
      <MetaBadges data={data} />
      <NodeChrome id={id} data={data} selected={selected} uses={['link', 'threat', 'comment', 'quickAdd', 'handles']} />
    </div>
  );
}

/** An untyped leaf or folded node where the notation draws those as text. */
const isTextNode = (data: DiagramNodeData, profile: NotationProfile): boolean =>
  profile.node?.typelessAsText === true &&
  data.typeId === undefined &&
  (data.state === 'leaf' || data.state === 'collapsed') &&
  data.image === undefined;

/** The box's classes (before the ghost and loop classes) and its colours. */
function boxLook(
  data: DiagramNodeData,
  style: TypeStyle,
): { className: string; accent: CSSProperties; neutralGlyph: boolean } {
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
  return {
    className: `dg-node dg-shape-${style.shape}${style.dashed === true ? ' dg-dashed' : ''}${outline ? ' dg-c4-outline' : ''}${solid !== undefined && data.stylePreset?.rough === undefined ? ' dg-solid' : ''}`,
    accent: {
      ...(solid ?? (ink !== undefined ? { borderColor: ink, color: ink } : accentStyle(data.color))),
      // an explicit text color overrides the default (which follows the accent on C4 boxes)
      ...(data.textColor !== undefined ? { color: data.textColor } : {}),
    },
    // UML draws these glyphs in a fixed neutral stroke — the docs promise node.color is
    // ignored on bars/start/end, so skip the inline accent that would otherwise tint them
    neutralGlyph: style.shape === 'bar' || style.shape === 'start-dot' || style.shape === 'end-bullseye',
  };
}

/** A clip-path cut the border off every diagonal edge, leaving the diamond
 * drawn by its fill alone — near the canvas colour in the light theme. The
 * polygon carries both, in the same colours the box would have used. */
function DiamondGlyph({ accent }: { accent: CSSProperties }): ReactElement {
  return (
    <svg className="dg-diamond-glyph" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polygon
        points="50,1 99,50 50,99 1,50"
        vectorEffect="non-scaling-stroke"
        fill={String(accent.background ?? 'var(--dg-node-fill)')}
        stroke={accent.borderColor ?? 'var(--dg-node-stroke)'}
      />
    </svg>
  );
}

/** The box's name row: the external arrow, a thumbnail, the icon, the label
 * or its editor, a folded node's hidden count, and the badge row. */
function BoxRow({ id, data, profile, parts }: BodyProps): ReactElement {
  const { style, ghost, highlight, onTab } = parts;
  const Icon = nodeIcon(data, style);
  return (
    <div className={style.captionBelow === true ? 'dg-node-row dg-glyph-caption' : 'dg-node-row'}>
      {ghost.arrow}
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
      {data.state === 'collapsed' && !isCausalGroup(data, profile) && (
        <span className="dg-count">{data.hiddenCount}</span>
      )}
      <NodeChips id={id} data={data} profile={profile} focusId={highlight.focusId} />
    </div>
  );
}

const fontScaleClass = (fs?: FontScale): string => (fs === 'sm' ? ' dg-fs-sm' : fs === 'lg' ? ' dg-fs-lg' : '');

/** The box label body: rich runs when present, else plain name — with pre-wrap
 * and alignment. Used only on box paths (image caption / group header stay plain). */
function BoxLabel({ data }: { data: DiagramNodeData }): ReactElement {
  const style: CSSProperties = {
    whiteSpace: 'pre-wrap',
    color: data.textColor,
    textAlign: data.textAlign,
  };
  if (data.rich !== undefined) {
    return (
      <span className={`dg-label dg-rich-label${fontScaleClass(data.fontScale)}`} style={style}>
        {runsToDisplay(data.rich).map((r) => {
          let node: ReactNode = r.text;
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
