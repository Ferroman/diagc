import { useMemo } from 'react';
import type { NotationProfile } from '../notations';
import type { ActorControls } from './build-data';
import type { TeamView } from './useTeamView';

/** What the roster cards read from the team view, for a notation whose actors
 * can be hidden; undefined for any other, so no node carries an eye. */
function actorControls(
  profile: NotationProfile,
  hidden: ReadonlySet<string>,
  toggle: (id: string) => void,
): ActorControls | undefined {
  const hides = profile.node?.hidesActors;
  return hides === undefined ? undefined : { hides, hidden, toggle };
}

/** `actorControls`, kept for as long as its inputs hold: the node data cache compares it by identity. */
export function useActorControls(
  profile: NotationProfile,
  teams: Pick<TeamView, 'hidden' | 'toggleHidden'>,
  chromeless = false,
): ActorControls | undefined {
  const { hidden, toggleHidden } = teams;
  return useMemo(
    () => (chromeless ? undefined : actorControls(profile, hidden, toggleHidden)),
    [profile, hidden, toggleHidden, chromeless],
  );
}
