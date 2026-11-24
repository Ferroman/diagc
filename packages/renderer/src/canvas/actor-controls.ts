import { useMemo } from 'react';
import { PLAN_TEAM_TYPE, teamsOf, type DiagramModel } from '@diagc/core/internal';
import type { NotationProfile } from '../notations';
import type { ActorControls } from './build-data';
import type { TeamView } from './useTeamView';

/** Each person's teams after the first in model order, by name: a person has
 * one roster card, listed under that first team, and says where else they are.
 * Only people with more than one team have an entry. */
export function alsoInOf(model: DiagramModel): ReadonlyMap<string, string[]> {
  const order = new Map(model.nodes.map((n, i) => [n.id, i] as const));
  const nameOf = new Map(model.nodes.map((n) => [n.id, n.name || n.id] as const));
  const out = new Map<string, string[]>();
  for (const n of model.nodes) {
    if (n.type === PLAN_TEAM_TYPE) continue;
    const teams = teamsOf(model, n.id).sort((a, b) => order.get(a)! - order.get(b)!);
    if (teams.length > 1)
      out.set(
        n.id,
        teams.slice(1).map((t) => nameOf.get(t)!),
      );
  }
  return out;
}

/** What the roster cards read from the team view, for a notation whose actors
 * can be hidden; undefined for any other, so no node carries an eye. */
function actorControls(
  profile: NotationProfile,
  model: DiagramModel,
  hidden: ReadonlySet<string>,
  toggle: (id: string) => void,
): ActorControls | undefined {
  const hides = profile.node?.hidesActors;
  return hides === undefined ? undefined : { hides, hidden, toggle, alsoIn: alsoInOf(model) };
}

/** `actorControls`, kept for as long as its inputs hold: the node data cache compares it by identity. */
export function useActorControls(
  profile: NotationProfile,
  model: DiagramModel,
  teams: Pick<TeamView, 'hidden' | 'toggleHidden'>,
  chromeless = false,
): ActorControls | undefined {
  const { hidden, toggleHidden } = teams;
  return useMemo(
    () => (chromeless ? undefined : actorControls(profile, model, hidden, toggleHidden)),
    [profile, model, hidden, toggleHidden, chromeless],
  );
}
