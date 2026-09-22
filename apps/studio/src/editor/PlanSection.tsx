import { PLAN_ROLES, isPlanEvent, isPlanZone, rolesOf, type DiagramModel, type DiagramNode, type EditorCommand, type PlanRole } from '@diagc/core';
import { setRole } from './planActions';

const ROLE_TITLE: Record<PlanRole, string> = { owns: 'Owner', executes: 'Executor', checks: 'Checker' };

/** Candidates for a role: people first, then anything that is not a zone or
 * an event — any node can hold a role, but a person is the usual answer. */
export function roleCandidates(model: DiagramModel): DiagramNode[] {
  const rest = model.nodes.filter((n) => n.type !== 'person' && !isPlanZone(n) && !isPlanEvent(n));
  return [...model.nodes.filter((n) => n.type === 'person'), ...rest];
}

interface RolePickersProps {
  model: DiagramModel;
  zoneId: string;
  /** appended to the select labels so a list of zones reads apart (`Owner Q1`) */
  suffix?: string;
  onCommand: (command: EditorCommand) => void;
}

/** Three selects, one per role. The panel keeps one person per role — the
 * first of the relation list when TypeScript declared several. */
export function RolePickers({ model, zoneId, suffix, onCommand }: RolePickersProps) {
  const roles = rolesOf(model, zoneId);
  const candidates = roleCandidates(model);
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

/** The inspector's Plan section: a zone's span and roles, an event's date. */
export function PlanSection({ model, node, onCommand }: PlanSectionProps) {
  const set = (dates: { start?: string; end?: string; at?: string }) => onCommand({ type: 'set-plan-dates', id: node.id, dates });
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
            <RolePickers model={model} zoneId={node.id} onCommand={onCommand} />
          </div>
        </>
      )}
      {isPlanEvent(node) && <DateInput label="At" value={str(node.metadata?.at)} onChange={(at) => set({ at })} />}
    </section>
  );
}
