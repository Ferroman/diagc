import { useMemo } from 'react';
import {
  STRIDE_NAMES,
  crossingLabel,
  crossings,
  threatRegister,
  threatSummary,
  validate,
  type DiagramModel,
  type Threat,
  type ThreatTarget,
} from '@diagc/core';
import type { DiagramSelection } from '@diagc/renderer';
import { DockSection } from '../DockSection';

interface ThreatModelPanelProps {
  model: DiagramModel;
  /** the viewed plane — a boundary is containment, so which flows cross one is
   * a fact about the plane being drawn (see crossings) */
  plane?: string;
  onSelect: (selection: DiagramSelection) => void;
}

/** every threat on one element, in declaration order */
interface Group {
  key: string;
  /** the element's display name — a flow reads `from → to (label)` */
  name: string;
  selection: DiagramSelection;
  threats: Threat[];
}

const selectionFor = (target: ThreatTarget): DiagramSelection =>
  'node' in target ? { kind: 'node', id: target.node } : { kind: 'edge', id: target.relation };

/** `[T] MITM · high · open` — severity is optional and then left out; an unset
 * status IS open (isOpen), so it reads as the word it means rather than blank. */
const threatLine = (t: Threat): string =>
  [`[${t.category}] ${t.title}`, ...(t.severity !== undefined ? [t.severity] : []), t.status ?? 'open'].join(' · ');

/**
 * The threat-model dock panel: the two questions a STRIDE review asks of a
 * drawing — which boundary crossings nobody has thought about yet, and what the
 * whole register holds. Both are derivations of the model, so this panel only
 * reads and selects; adding or editing a threat stays in the Threats section of
 * the node/edge inspector, which is where the element already is.
 */
export function ThreatModelPanel({ model, plane, onSelect }: ThreatModelPanelProps) {
  const cross = useMemo(() => crossings(model, plane), [model, plane]);
  // A crossing with no threat at all is the gap worth surfacing; one with only
  // mitigated threats has been reviewed, so it drops off this list.
  const review = useMemo(
    () => model.relations.filter((r) => cross.has(r.id) && threatSummary(r.threats).total === 0),
    [model, cross],
  );
  const groups = useMemo(() => {
    // threatRegister is already flat and ordered (nodes, then relations); the
    // Map regroups it per element while keeping that first-seen order.
    const out = new Map<string, Group>();
    for (const row of threatRegister(model)) {
      const key = JSON.stringify(row.target);
      const group = out.get(key) ?? { key, name: row.name, selection: selectionFor(row.target), threats: [] };
      group.threats.push(row.threat);
      out.set(key, group);
    }
    return [...out.values()];
  }, [model]);
  // The threat codes are generic (any notation may carry threats), tm- ones are
  // this notation's own; both belong to the reviewer looking at this panel.
  const issues = useMemo(
    () => validate(model).filter((i) => i.code.startsWith('threat-') || i.code.startsWith('tm-') || i.code === 'invalid-threats'),
    [model],
  );

  // The element line names the flow's two ENDS, which are always nodes — the
  // 'outside' case belongs to a crossing's end, not to one of these, so this is
  // not core's boundaryName with a different spelling.
  const nodeName = (id: string): string => model.nodes.find((n) => n.id === id)?.name ?? id;

  return (
    <DockSection id="threat-model" title="Threat model" className="sidebar so-panel">
      <section className="panel-section" aria-label="Crossings to review">
        <h4>Crossings to review</h4>
        {review.length === 0 ? (
          <p className="so-hint">Every boundary-crossing flow has at least one threat.</p>
        ) : (
          <div className="so-answers tm-list">
            {review.map((r) => (
              <button key={r.id} type="button" onClick={() => onSelect({ kind: 'edge', id: r.id })}>
                {`${nodeName(r.from)} → ${nodeName(r.to)}`}
                {/* the flow reads between its ends, the sub-line between the
                    boundaries those ends sit in — hence the two arrows. The
                    sub-line is worded by core, so it cannot drift from the
                    published table's `Crosses` column. `review` is filtered on
                    `cross.has`, so the fallback is unreachable. */}
                <span className="so-hint tm-sub">{crossingLabel(model, cross.get(r.id) ?? {})}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="panel-section" aria-label="Register">
        <h4>Register</h4>
        {groups.length === 0 ? (
          <p className="so-hint">Select an element and add a threat in the Threats section.</p>
        ) : (
          groups.map((g) => {
            const { open, total } = threatSummary(g.threats);
            return (
              <div key={g.key} className="tm-group">
                {/* the same full-width row the review list uses, so a group
                    header and a crossing read alike */}
                <div className="so-answers tm-list">
                  <button type="button" onClick={() => onSelect(g.selection)}>
                    {g.name} <span className="so-hint">{open} / {total}</span>
                  </button>
                </div>
                <ul className="tm-threats">
                  {g.threats.map((t, index) => (
                    // The bracketed letter is the STRIDE category; hovering
                    // names it rather than spending a line on the word. The key
                    // carries the index because this panel also renders models
                    // validation rejects — repeated threat ids among them.
                    <li key={`${t.id}:${index}`} title={STRIDE_NAMES[t.category]}>
                      {threatLine(t)}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>
      {issues.length > 0 && (
        <ul className="so-issues" aria-label="Issues">
          {issues.map((i, index) => {
            const ref = i.ref;
            // A threat issue names the element that carries it, a tm- one the
            // flow; anything else has nothing on canvas to select, so it renders
            // as text rather than a dead button. Several bad threats on one
            // element share a code and a ref, so the key needs the index.
            const target: DiagramSelection | undefined =
              ref === undefined
                ? undefined
                : model.nodes.some((n) => n.id === ref)
                  ? { kind: 'node', id: ref }
                  : model.relations.some((r) => r.id === ref)
                    ? { kind: 'edge', id: ref }
                    : undefined;
            return (
              <li key={`${i.code}:${ref ?? ''}:${index}`}>
                {target !== undefined ? (
                  <button type="button" onClick={() => onSelect(target)}>
                    {i.message}
                  </button>
                ) : (
                  <span>{i.message}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DockSection>
  );
}
