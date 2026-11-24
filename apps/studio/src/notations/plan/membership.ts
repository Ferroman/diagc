import {
  PLAN_MEMBER_OF,
  PLAN_PERSON_TYPE,
  PLAN_TEAM_TYPE,
  teamsOf,
  type DiagramModel,
  type EditorCommand,
} from '@diagc/core/internal';

/** Membership is the relation `person member-of team`; the studio edits it with
 * the generic relation commands, so there is no membership command of its own. */

/** Adding `personId` to `teamId`: undefined unless a person goes to a team and
 * is not in it already (a team into a team, a repeat drop: nothing to change). */
export function addMember(model: DiagramModel, personId: string, teamId: string): EditorCommand | undefined {
  const person = model.nodes.find((n) => n.id === personId);
  const team = model.nodes.find((n) => n.id === teamId);
  if (person?.type !== PLAN_PERSON_TYPE || team?.type !== PLAN_TEAM_TYPE) return undefined;
  if (teamsOf(model, personId).includes(teamId)) return undefined;
  return { type: 'add-relation', from: personId, to: teamId, opts: { kind: PLAN_MEMBER_OF } };
}

/** Taking `personId` out of `teamId`: every `member-of` between them goes (the
 * model lets duplicates accumulate), as one step. Undefined when they are not
 * members. */
export function removeMember(model: DiagramModel, personId: string, teamId: string): EditorCommand | undefined {
  const held = model.relations.filter((r) => r.from === personId && r.to === teamId && r.kind === PLAN_MEMBER_OF);
  if (held.length === 0) return undefined;
  const commands = held.map((r): EditorCommand => ({ type: 'delete-relation', id: r.id }));
  return commands.length === 1 ? commands[0]! : { type: 'batch', commands };
}
