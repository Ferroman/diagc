import type { DiagramModel } from '../../types';
import type { CompiledView, PlanRosterFrame, ViewNode } from '../../view/types';
import { isPlanActor, PLAN_TEAM_TYPE } from './plan';
import { PLAN_UNASSIGNED_TYPE, planCopyId } from './plan-view';
import { planIndex } from './teams';

/**
 * Frame each team around its members in a plan view's roster. Pure, and run
 * last by `planView`: membership is drawn whether or not the chart is grouped
 * or the view carries controls.
 *
 * A person in several teams has one real node, in the first of their teams in
 * model order, and a badge copy in each other team (its own canvas id, mapped
 * back through `copies`) — a node cannot sit inside two frames. Unlike a lane
 * copy's zone, the real node is drawn as well, so `copies` maps it to itself.
 * Only teams and people that are roots of this view count, so a view that does
 * not draw them (a drilled zone) frames nothing. A team with no member stays a plain card.
 * Returns `view` itself when there is no frame.
 */
export function planRoster(view: CompiledView, model: DiagramModel): CompiledView {
  const rootIds = new Set(view.roots.map((r) => r.id));
  const index = planIndex(model);
  // the model's order, not the relations': it is the order frames are drawn in
  const teams = model.nodes.filter((n) => n.type === PLAN_TEAM_TYPE && rootIds.has(n.id)).map((n) => n.id);
  const teamSet = new Set(teams);
  const people = view.roots.filter((r) => isPlanActor(r.node) && r.node.type !== PLAN_TEAM_TYPE);
  const copies = new Map<string, string>();
  const copyRoots: ViewNode[] = [];
  const members = new Map<string, string[]>(teams.map((t) => [t, []]));
  for (const person of people) {
    const mine = [...(index.teamsOf.get(person.id) ?? [])].filter((t) => teamSet.has(t));
    mine.sort((a, b) => teams.indexOf(a) - teams.indexOf(b));
    mine.forEach((team, i) => {
      if (i === 0) {
        members.get(team)!.push(person.id);
        return;
      }
      // the real badge is drawn too, so it maps to itself, ahead of its
      // copies: every canvas id drawing the person, the real one first, is
      // what the map's inverse then gives (a rename, a focus, a host's bounds)
      if (i === 1) copies.set(person.id, person.id);
      const id = planCopyId(team, person.id);
      copies.set(id, person.id);
      copyRoots.push({ ...person, id });
      members.get(team)!.push(id);
    });
  }
  const roster: PlanRosterFrame[] = teams.flatMap((team) => {
    const m = members.get(team)!;
    return m.length === 0 ? [] : [{ team, members: m }];
  });
  if (roster.length === 0) return view;
  // before the Unassigned card, which the roster keeps last
  const at = view.roots.findIndex((r) => r.node.type === PLAN_UNASSIGNED_TYPE);
  const roots =
    at < 0 ? [...view.roots, ...copyRoots] : [...view.roots.slice(0, at), ...copyRoots, ...view.roots.slice(at)];
  return { ...view, roots, copies: new Map([...(view.copies ?? []), ...copies]), roster };
}
