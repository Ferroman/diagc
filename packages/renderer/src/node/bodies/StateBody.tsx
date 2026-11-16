import type { CSSProperties, ReactElement } from 'react';
import { NodeChrome } from '../chrome';
import { accentStyle, dropTargetAttrs, MetaBadges, sketchOf } from '../node-look';
import type { BodyProps } from './types';

/** A state. Closed, a rounded box: the name, and under a divider one line per
 * behaviour. A folded composite swaps the behaviours for the composite glyph
 * (its content is what the fold hides, not its behaviours). Open, the box is
 * the frame its substates are drawn in, with the name in a header. */
export function StateBody({ id, data, selected, width, height, parts }: BodyProps) {
  const { style, name, loopClass, ghost } = parts;
  const open = data.state === 'expanded';
  const rough = data.stylePreset?.rough !== undefined;
  const paint: CSSProperties | undefined = rough
    ? undefined
    : { ...accentStyle(data.color), ...(data.textColor !== undefined ? { color: data.textColor } : {}) };
  const folded = data.composite === true && !open;
  const behaviors = open || folded ? [] : (data.behaviors ?? []);
  return (
    <div
      className={
        open
          ? `dg-group dg-sm-state dg-sm-state-open${loopClass}`
          : `dg-node dg-shape-rounded dg-sm-state${ghost.className}${loopClass}`
      }
      style={paint}
      data-type={data.typeId}
      {...dropTargetAttrs(data)}
      {...ghost.title}
    >
      {sketchOf(data, style.shape, { id, width, height }, open ? 'wash' : 'preset')}
      {open ? (
        <>
          <NodeChrome id={id} data={data} selected={selected} uses={['threat', 'comment', 'quickAdd']} />
          <div className="dg-group-header">
            {name}
            <MetaBadges data={data} />
          </div>
        </>
      ) : (
        <>
          <div className="dg-node-row dg-sm-state-name">
            {ghost.arrow}
            {name}
            {folded && <CompositeGlyph />}
          </div>
          {behaviors.length > 0 && <Behaviors lines={behaviors} />}
          <MetaBadges data={data} />
          <NodeChrome id={id} data={data} selected={selected} uses={['link', 'threat', 'comment', 'quickAdd']} />
        </>
      )}
      <NodeChrome id={id} data={data} selected={selected} uses={['handles']} />
    </div>
  );
}

function Behaviors({ lines }: { lines: string[] }): ReactElement {
  return (
    <>
      <hr className="dg-sm-divider" />
      <ul className="dg-sm-behaviors">
        {lines.map((line, i) => (
          <li key={i} className="dg-sm-behavior">
            {line}
          </li>
        ))}
      </ul>
    </>
  );
}

/** The UML mark for a state with a hidden decomposition: two ovals joined by a line. */
function CompositeGlyph(): ReactElement {
  return (
    <svg
      className="dg-sm-composite-glyph"
      data-testid="sm-composite-glyph"
      viewBox="0 0 24 12"
      width="24"
      height="12"
      aria-hidden="true"
    >
      <rect x="1" y="2" width="8" height="8" rx="4" />
      <rect x="15" y="2" width="8" height="8" rx="4" />
      <line x1="9" y1="6" x2="15" y2="6" />
    </svg>
  );
}
