import { useMemo } from 'react';
import {
  PLAN_PERSON_TYPE,
  PLAN_ROLES,
  isPlanActor,
  isPlanEvent,
  isPlanPeriod,
  isPlanZone,
  rolesOf,
  teamsOf,
  type DiagramModel,
  type DiagramNode,
  type EditorCommand,
  type PlanRole,
} from '@diagc/core/internal';
import { removeMember } from './membership';
import { setRole } from './planActions';

const ROLE_TITLE: Record<PlanRole, string> = { owns: 'Owner', executes: 'Executor', checks: 'Checker' };

/** Candidates for a role: actors (people, teams) first, then anything else
 * that is not a zone or an event — any node can hold a role, but an actor is
 * the usual answer. */
export function roleCandidates(model: DiagramModel): DiagramNode[] {
  const rest = model.nodes.filter((n) => !isPlanActor(n) && !isPlanZone(n) && !isPlanEvent(n));
  return [...model.nodes.filter((n) => isPlanActor(n)), ...rest];
}

interface RolePickersProps {
  model: DiagramModel;
  zoneId: string;
  /** every node that may hold a role, derived ONCE by the caller: the list is
   * the same for every zone, and the Plan panel renders one of these per row —
   * a whole-model scan per zone per keystroke otherwise. */
  candidates: readonly DiagramNode[];
  /** appended to the select labels so a list of zones reads apart (`Owner Q1`) */
  suffix?: string;
  onCommand: (command: EditorCommand) => void;
}

/** Three selects, one per role. The panel keeps one person per role — the
 * first of the relation list when TypeScript declared several. */
export function RolePickers({ model, zoneId, candidates, suffix, onCommand }: RolePickersProps) {
  const roles = rolesOf(model, zoneId);
  return (
    <>
      {PLAN_ROLES.map((role) => (
        <select
          key={role}
          aria-label={suffix !== undefined ? `${ROLE_TITLE[role]} ${suffix}` : ROLE_TITLE[role]}
          title={ROLE_TITLE[role]}
          value={roles[role][0] ?? ''}
          onChange={(e) => onCommand(setRole(model, zoneId, role, e.target.value === '' ? null : e.target.value))}
        >
          <option value="">—</option>
          {candidates.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      ))}
    </>
  );
}

interface DateInputProps {
  label: string;
  value: string;
  onChange: (iso: string) => void;
}

/** A date input yields only complete dates, so there is no draft to keep: the
 * change is the commit (unlike the free-text threat fields). */
export function DateInput({ label, value, onChange }: DateInputProps) {
  return (
    <input
      type="date"
      aria-label={label}
      value={value}
      onChange={(e) => {
        if (e.target.value !== '') onChange(e.target.value);
      }}
    />
  );
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

interface PlanSectionProps {
  model: DiagramModel;
  node: DiagramNode;
  onCommand: (command: EditorCommand) => void;
}

/** The inspector's Plan section: a zone's span and roles, a period's span, an
 * event's date. */
export function PlanSection({ model, node, onCommand }: PlanSectionProps) {
  // one derivation per model, not one per render: typing in a date field
  // re-renders the whole inspector
  const candidates = useMemo(() => roleCandidates(model), [model]);
  const set = (dates: { start?: string; end?: string; at?: string }) =>
    onCommand({ type: 'set-plan-dates', id: node.id, dates });
  return (
    <section className="panel-section">
      <h3>Plan</h3>
      {isPlanZone(node) && (
        <>
          <div className="field-row">
            <DateInput label="Start" value={str(node.metadata?.start)} onChange={(start) => set({ start })} />
            <DateInput label="End" value={str(node.metadata?.end)} onChange={(end) => set({ end })} />
          </div>
          <div className="field-row">
            <RolePickers model={model} zoneId={node.id} candidates={candidates} onCommand={onCommand} />
          </div>
        </>
      )}
      {isPlanPeriod(node) && (
        <div className="field-row">
          <DateInput label="Start" value={str(node.metadata?.start)} onChange={(start) => set({ start })} />
          <DateInput label="End" value={str(node.metadata?.end)} onChange={(end) => set({ end })} />
        </div>
      )}
      {node.type === PLAN_PERSON_TYPE && <TeamList model={model} personId={node.id} onCommand={onCommand} />}
      {isPlanEvent(node) && <DateInput label="At" value={str(node.metadata?.at)} onChange={(at) => set({ at })} />}
    </section>
  );
}

/** A person's teams, each with a remove button. Adding is a drag onto a team
 * card on the canvas, so the list only ever takes away. */
function TeamList({
  model,
  personId,
  onCommand,
}: {
  model: DiagramModel;
  personId: string;
  onCommand: PlanSectionProps['onCommand'];
}) {
  const teams = teamsOf(model, personId);
  const nameOf = (id: string): string => model.nodes.find((n) => n.id === id)?.name ?? id;
  if (teams.length === 0) return <p className="hint">Not in a team. Drag onto a team card to add.</p>;
  return (
    <ul className="plan-teams" aria-label="Teams">
      {teams.map((t) => (
        <li key={t}>
          <span>{nameOf(t)}</span>
          <button
            type="button"
            aria-label={`Remove from ${nameOf(t)}`}
            onClick={() => {
              const command = removeMember(model, personId, t);
              if (command !== undefined) onCommand(command);
            }}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
