import { NodeChrome } from '../chrome';
import { assetUrl, TypeSubtitle } from '../node-look';
import type { BodyProps } from './types';

/** A leaf drawn as an SVG silhouette (`shape`): a tintable mask, with the
 * name and type below it. */
export function SilhouetteBody({ id, data, selected, parts }: BodyProps) {
  const { style, name, loopClass, ghost } = parts;
  const maskUrl = `url("${assetUrl(data.assetBase, data.libraryBase, data.shape!)}")`;
  const labelColor = data.textColor ?? data.color;
  return (
    <div className={`dg-node dg-shape-node${ghost.className}${loopClass}`} {...ghost.title}>
      <span
        className="dg-shape-fill"
        aria-hidden="true"
        style={{ WebkitMaskImage: maskUrl, maskImage: maskUrl, background: data.color ?? 'var(--dg-shape-default)' }}
      />
      <div className="dg-shape-label" style={labelColor !== undefined ? { color: labelColor } : undefined}>
        {ghost.arrow}
        {name}
        <TypeSubtitle data={data} style={style} />
      </div>
      <NodeChrome id={id} data={data} selected={selected} uses={['link', 'quickAdd', 'handles']} />
    </div>
  );
}
