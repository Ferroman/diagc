import { useEffect } from 'react';
import type { ReaderOpening } from '@diagc/renderer';

/** A plan's team view as the page address carries it: `?group=1&hide=<id>,<id>`. */
export interface TeamViewParams {
  grouped: boolean;
  hidden: readonly string[];
}

/** Read the view from a query string. Absent parameters are the default view. */
export function readTeamView(search: string): TeamViewParams {
  const params = new URLSearchParams(search);
  // Ids may hold a comma, so each is percent-encoded before the join and the
  // parameter is split on its raw form; URLSearchParams would decode first and
  // turn an encoded comma back into a separator.
  const rawHide = search
    .replace(/^\?/, '')
    .split('&')
    .find((kv) => kv.startsWith('hide='));
  const hidden =
    rawHide === undefined
      ? []
      : rawHide
          .slice('hide='.length)
          .split(',')
          .filter((id) => id !== '')
          .map((id) => decodeURIComponent(id));
  return { grouped: params.get('group') === '1', hidden };
}

/** Put the view into the address, keeping every other parameter and the hash.
 * `replaceState`, never a push: toggling an eye must not fill the Back button.
 * Nothing is written for the default view, so a plain link stays plain. */
export function writeTeamView(grouped: boolean, hidden: readonly string[]): void {
  const params = new URLSearchParams(location.search);
  params.delete('group');
  params.delete('hide');
  if (grouped) params.set('group', '1');
  // Appended by hand: each id is encoded on its own and the ids joined by a
  // bare comma, the form the reader splits on (set() would encode the joiners).
  const rest = params.toString();
  const query = [rest, ...(hidden.length > 0 ? [`hide=${hidden.map(encodeURIComponent).join(',')}`] : [])]
    .filter((q) => q !== '')
    .join('&');
  const next = `${location.pathname}${query === '' ? '' : `?${query}`}${location.hash}`;
  if (next !== `${location.pathname}${location.search}${location.hash}`) window.history.replaceState(null, '', next);
}

/** Keep the address in step with the view while the page is read. An export
 * (`off`) never writes: its URL is the publisher's, and it ignores the view. */
export function useTeamViewUrl(grouped: boolean, hidden: readonly string[], off: boolean): void {
  const key = hidden.join('\u0000');
  useEffect(() => {
    if (!off) writeTeamView(grouped, hidden);
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- `hidden` is tracked through its content key */
  }, [grouped, key, off]);
}

/** The opening plus the address's view; the opening untouched when the page
 * was opened with none (an export reads none). */
export function withTeamView(opening: ReaderOpening | undefined, team: TeamViewParams | undefined) {
  if (team === undefined) return opening;
  return { ...opening, grouped: team.grouped, hidden: team.hidden };
}
