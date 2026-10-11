import { Fragment, type ReactNode } from 'react';
import { ActivityPanel } from '../activity/ActivityPanel';
import type { DockEntry, NotationDockContext } from '../notations/types';

/**
 * Right-dock panels that are not a notation's: what they edit is keyed by node
 * type, so they are offered on every plane, after the notation's own panel.
 * Each hides itself where it has nothing to work on.
 */
export const DOCK_FEATURES: readonly (DockEntry & { id: string })[] = [
  {
    id: 'activity',
    modes: 'edit',
    render: (ctx) => (
      <ActivityPanel
        model={ctx.model}
        plane={ctx.viewPlane}
        selection={ctx.selection}
        onCommand={ctx.onCommand}
        onSelect={(id) => ctx.select({ kind: 'node', id })}
      />
    ),
  },
];

const shown = (entry: DockEntry | undefined, ctx: NotationDockContext): ReactNode =>
  entry !== undefined && (ctx.editing || entry.modes === 'both') ? entry.render(ctx) : null;

/** The right dock's leading panels while the mode shows them: the notation's
 * own, then the features, in that order. */
export function dockPanels(notationDock: DockEntry | undefined, ctx: NotationDockContext): ReactNode {
  return (
    <>
      {shown(notationDock, ctx)}
      {DOCK_FEATURES.map((feature) => (
        <Fragment key={feature.id}>{shown(feature, ctx)}</Fragment>
      ))}
    </>
  );
}
