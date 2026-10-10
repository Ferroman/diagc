import { NodeChrome } from '../chrome';
import {
  accentStyle,
  assetUrl,
  dropTargetAttrs,
  MetaBadges,
  nodeIcon,
  planHit,
  sketchOf,
  XResizer,
} from '../node-look';
import { NodeChips } from '../NodeChips';
import { outlineInk } from '../outline-ink';
import type { BodyProps } from './types';

/** An open container: a box its members are drawn inside, with the name, the
 * metadata and the badge row in a header. */
export function GroupBody({ id, data, selected, width, height, profile, parts }: BodyProps) {
  const { style, name, loopClass, highlight } = parts;
  const { hitStyle, hitAttrs } = planHit(id, data, profile, highlight);
  const Icon = nodeIcon(data, style);
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
      {...dropTargetAttrs(data)}
    >
      <XResizer id={id} data={data} selected={selected} />
      {/* never the preset's own fill: this box is where the children and their
          edges are drawn (see SketchFill) — and an outline group stays a line */}
      {sketchOf(data, style.shape, { id, width, height }, groupOutline ? 'none' : 'wash')}
      <NodeChrome id={id} data={data} selected={selected} uses={['threat', 'comment', 'quickAdd']} />
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
        <MetaBadges data={data} />
        <NodeChips id={id} data={data} profile={profile} focusId={highlight.focusId} />
      </div>
      <NodeChrome id={id} data={data} selected={selected} uses={['handles']} />
    </div>
  );
}
