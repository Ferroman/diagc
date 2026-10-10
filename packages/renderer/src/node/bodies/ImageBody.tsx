import { NodeResizer } from '@xyflow/react';
import { NodeChrome } from '../chrome';
import { assetUrl } from '../node-look';
import type { BodyProps } from './types';

/** A leaf whose body is its image, captioned with the name. */
export function ImageBody({ id, data, selected, parts }: BodyProps) {
  const { name, loopClass, ghost } = parts;
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
        className={`dg-node dg-image-node${ghost.className}${loopClass}`}
        // icon nodes stay transparent (no accent fill/border); the frame shows on
        // hover/selection via CSS. textColor still tints the caption.
        style={data.textColor !== undefined ? { color: data.textColor } : undefined}
        {...ghost.title}
      >
        <img
          className="dg-image"
          src={assetUrl(data.assetBase, data.libraryBase, data.image!)}
          alt={data.label}
          draggable={false}
        />
        <div className="dg-image-caption">
          {ghost.arrow}
          {name}
        </div>
        <NodeChrome id={id} data={data} selected={selected} uses={['link', 'quickAdd', 'handles']} />
      </div>
    </>
  );
}
