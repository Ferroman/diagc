import { useState } from 'react';
import { PLAN_ZONE_TYPE, planGraph, type DiagramModel, type EditorCommand } from '@diagc/core';
import type { DiagramSelection } from '@diagc/renderer';
import { DockSection } from '../DockSection';
import { addEvent, addPerson, addZone } from './planActions';
import { DateInput, RolePickers } from './PlanSection';

interface PlanPanelProps {
  model: DiagramModel;
  /** the active plane (undefined = default view = the first plane) */
  plane: string | undefined;
  selection: DiagramSelection | null;
  onCommand: (command: EditorCommand) => void;
  /** select the node an action just created, or a row's node */
  onSelect: (id: string) => void;
  /** the host's date, YYYY-MM-DD: where a quick-add lands when nothing is selected */
  today: string;
}

const INDENT = 12;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * The schedule as a list: zones in tree order with their dates and roles,
 * events with their date, and quick-adds that nest under the selected zone.
 * Dates dispatch on change; names are edited in Properties (one editor per
 * field), the row's name just selects.
 */
export function PlanPanel({ model, plane, selection, onCommand, onSelect, today }: PlanPanelProps) {
  const g = planGraph(model, plane);
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const [personName, setPersonName] = useState('');
  const selected = selection?.kind === 'node' && byId.get(selection.id)?.type === PLAN_ZONE_TYPE ? selection.id : undefined;
  // tree order: each root zone, then its subtree, depth-first
  const rows: { id: string; depth: number }[] = [];
  const walk = (id: string, depth: number): void => {
    rows.push({ id, depth });
    for (const c of g.children.get(id)?.zones ?? []) walk(c, depth + 1);
  };
  for (const z of g.zones) if (!g.parent.has(z)) walk(z, 0);
  const set = (id: string, dates: { start?: string; end?: string; at?: string }) => onCommand({ type: 'set-plan-dates', id, dates });
  const run = (made: { command: EditorCommand; id: string }) => {
    onCommand(made.command);
    onSelect(made.id);
  };
  return (
    <DockSection id="plan" title="Plan" label="Plan" className="sidebar plan-panel">
      <section className="panel-section">
        <h3>Zones</h3>
        {rows.length === 0 ? <p className="lp-caption">No zones yet</p> : null}
        <ul className="plan-rows">
          {rows.map(({ id, depth }) => {
            const n = byId.get(id)!;
            return (
              <li key={id} style={{ paddingLeft: `${depth * INDENT}px` }}>
                <button type="button" className="link-btn" aria-label={`Select ${n.name}`} onClick={() => onSelect(id)}>
                  {n.name}
                </button>
                <DateInput label={`Start ${n.name}`} value={str(n.metadata?.start)} onChange={(start) => set(id, { start })} />
                <DateInput label={`End ${n.name}`} value={str(n.metadata?.end)} onChange={(end) => set(id, { end })} />
                <RolePickers model={model} zoneId={id} suffix={n.name} onCommand={onCommand} />
              </li>
            );
          })}
        </ul>
        <button type="button" className="chip" onClick={() => run(addZone(model, plane, { ...(selected !== undefined ? { selected } : {}), today }))}>
          Add zone
        </button>
      </section>
      <section className="panel-section">
        <h3>Events</h3>
        {g.events.length === 0 ? <p className="lp-caption">No events yet</p> : null}
        <ul className="plan-rows">
          {g.events.map((id) => {
            const n = byId.get(id)!;
            return (
              <li key={id}>
                <button type="button" className="link-btn" aria-label={`Select ${n.name}`} onClick={() => onSelect(id)}>
                  {n.name}
                </button>
                <DateInput label={`At ${n.name}`} value={str(n.metadata?.at)} onChange={(at) => set(id, { at })} />
              </li>
            );
          })}
        </ul>
        <button type="button" className="chip" onClick={() => run(addEvent(model, plane, { ...(selected !== undefined ? { selected } : {}), today }))}>
          Add event
        </button>
      </section>
      <section className="panel-section">
        <h3>People</h3>
        <input aria-label="New person name" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Name" />
        <button
          type="button"
          className="chip"
          disabled={personName.trim() === ''}
          onClick={() => {
            run(addPerson(model, plane, personName.trim()));
            setPersonName('');
          }}
        >
          Add person
        </button>
      </section>
    </DockSection>
  );
}
