import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isPlanActor, type DiagramModel } from '@diagc/core/internal';
import type { NotationProfile } from '../notations';
import type { DiagramViewProps } from './view-types';

export interface TeamView {
  /** whether a plan is drawn in team lanes: the host's when it holds it, else the view's own */
  grouped: boolean;
  setGrouped: (grouped: boolean) => void;
  /** the actors (team, person or PLAN_UNASSIGNED ids) hidden now; one Set
   * identity while the ids are unchanged, so the memos keyed on it hold */
  hidden: ReadonlySet<string>;
  /** hide an actor, or show it again */
  toggleHidden: (id: string) => void;
}

const NONE: readonly string[] = [];

/** The plan's team view state, controlled by the host when it passes
 * `grouped` / `hiddenActors` (as `dayWidth` is), else held here; back to
 * ungrouped with nothing hidden for another diagram, since it is view state of
 * this one and never saved. */
export function useTeamView(
  props: Pick<DiagramViewProps, 'grouped' | 'onGroupedChange' | 'hiddenActors' | 'onHiddenActorsChange' | 'model'>,
): TeamView {
  const [ownGrouped, setOwnGrouped] = useState(false);
  const [ownHidden, setOwnHidden] = useState<readonly string[]>(NONE);
  const grouped = props.grouped ?? ownGrouped;
  const ids = props.hiddenActors ?? ownHidden;
  const { onGroupedChange, onHiddenActorsChange } = props;

  // A host passing a fresh array literal each render must not bust every memo
  // keyed on the set: it is rebuilt only when the ids' content changes.
  const key = ids.join('\u0000');
  /* eslint-disable-next-line react-hooks/exhaustive-deps -- `ids` is tracked through its content key */
  const hidden = useMemo<ReadonlySet<string>>(() => new Set(ids), [key]);

  const setGrouped = useCallback(
    (next: boolean) => {
      setOwnGrouped(next);
      onGroupedChange?.(next);
    },
    [onGroupedChange],
  );
  const setHidden = useCallback(
    (next: readonly string[]) => {
      setOwnHidden(next);
      onHiddenActorsChange?.(next);
    },
    [onHiddenActorsChange],
  );
  const toggleHidden = useCallback(
    (id: string) => setHidden(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]),
    [ids, setHidden],
  );

  const modelId = props.model.id;
  const seenModel = useRef(modelId);
  useEffect(() => {
    if (seenModel.current === modelId) return;
    seenModel.current = modelId;
    // A controlled prop belongs to the host, which owns its reset: a link to
    // this diagram may carry its own view, and a report from here would
    // overwrite it. Only the state held here resets, and says so.
    setOwnGrouped(false);
    setOwnHidden(NONE);
    if (props.grouped === undefined) onGroupedChange?.(false);
    if (props.hiddenActors === undefined) onHiddenActorsChange?.(NONE);
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- only another diagram resets it; the callbacks change with the host */
  }, [modelId]);
  return { grouped, setGrouped, hidden, toggleHidden };
}

/** Whether the canvas offers grouping by team: a notation that groups by team,
 * on a model with at least one person or team — with neither there is nothing
 * to group by or hide, so neither the switch nor the Unassigned card shows. */
export function useOffersTeams(profile: NotationProfile, model: DiagramModel): boolean {
  const groups = profile.groupsByTeam === true;
  return useMemo(() => groups && model.nodes.some(isPlanActor), [groups, model]);
}

/** What the canvas takes from the team view, for a notation that groups by
 * team or not: the compile's grouping (never grouped when it does not), and
 * the corner switch (none when it does not). */
export function teamParts(offered: boolean, t: TeamView, chromeless = false) {
  return {
    grouping: { grouped: offered && t.grouped, hidden: t.hidden, controls: !chromeless },
    switch: offered ? { grouped: t.grouped, toggle: () => t.setGrouped(!t.grouped) } : undefined,
  };
}
