import type { CSSProperties } from 'react';
import type { NodeStripe } from '../notations';

/** The hatched stretches over a box: a plan period's days on a bar it pauses,
 * and the washed ones, a team's days on a lane copy of a bar (`tint`).
 * Inside the box, so a drag, a resize or a fold carries them along; full
 * height; under the box's own text (styles.css lifts the row over them). */
export function NodeStripes({ stripes }: { stripes: readonly NodeStripe[] | undefined }) {
  if (stripes === undefined || stripes.length === 0) return null;
  return (
    <>
      {stripes.map((s) => (
        <span
          key={`${s.variant ?? 'period'}:${s.x}:${s.title}`}
          className={s.variant === 'tint' ? 'dg-stripe dg-stripe-tint' : 'dg-stripe'}
          title={s.title}
          style={
            {
              left: s.x,
              width: s.width,
              ...(s.color !== undefined ? { '--dg-stripe': s.color } : {}),
            } as CSSProperties
          }
        />
      ))}
    </>
  );
}
