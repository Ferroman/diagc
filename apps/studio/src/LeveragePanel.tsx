import { useMemo } from 'react';
import type { DiagramModel } from '@diagc/core';
import { analyzeLeverage, analyzeDependency, type LeverageSign, type LoopEdgeInput } from '@diagc/renderer';

/** the nodes/edges a clicked report row asks the canvas to glow */
export interface LeverageFocus {
  key: string;
  nodes: string[];
  edges: string[];
}

interface LeveragePanelProps {
  model: DiagramModel;
  /** compiled CLD signed graph (same edge ids the canvas draws) */
  edges: LoopEdgeInput[];
  /** selected variable node id */
  target: string;
  /** key of the currently-highlighted row (null = none) */
  activeFocusKey: string | null;
  /** click a row → highlight it (or clear when it is already active) */
  onFocus: (focus: LeverageFocus | null) => void;
  onClose: () => void;
  /** the ctrl-clicked comparison variable (null/undefined = no comparison) */
  compareId?: string | null;
  /** clear the active comparison */
  onClearCompare?: () => void;
}

const SIGN_GLYPH: Record<LeverageSign, string> = { '+': '+', '-': '−', mixed: '±', unknown: '?' };
const SIGN_CLASS: Record<LeverageSign, string> = {
  '+': 'lev-pos',
  '-': 'lev-neg',
  mixed: 'lev-mixed',
  unknown: 'lev-unknown',
};
const kindLabel = (k: string) => (k === 'R' ? 'amplifier' : k === 'B' ? 'brake' : 'unknown');
// Dependency section wording differs from the Feedback-loops section's "amplifier/brake": a
// two-variable comparison names the loop it closes as "reinforcing"/"balancing" (R/B).
const depLoopLabel = (k: string) => (k === 'R' ? 'reinforcing' : k === 'B' ? 'balancing' : 'unclear');
const LOOPS_SHOWN = 10;
const DRIVERS_SHOWN = 8;
const HUBS_SHOWN = 8;

export function LeveragePanel({
  model,
  edges,
  target,
  activeFocusKey,
  onFocus,
  onClose,
  compareId,
  onClearCompare,
}: LeveragePanelProps) {
  const report = useMemo(() => analyzeLeverage(edges, target), [edges, target]);
  const dep = useMemo(
    () => (compareId != null && compareId !== target ? analyzeDependency(edges, target, compareId) : null),
    [edges, target, compareId],
  );
  const distLabel = (n: number) => (n === 1 ? 'direct' : `${n} hops`);
  const name = (id: string) => model.nodes.find((n) => n.id === id)?.name ?? id;
  const toggle = (focus: LeverageFocus) => onFocus(activeFocusKey === focus.key ? null : focus);

  // A hub's highlight = every target-loop it shares with the target, unioned.
  const hubFocus = (hubId: string): LeverageFocus => {
    const nodes = new Set<string>();
    const edgeIds = new Set<string>();
    for (const l of report.loops) {
      if (!l.nodes.includes(hubId)) continue;
      l.nodes.forEach((n) => nodes.add(n));
      l.edgeIds.forEach((e) => edgeIds.add(e));
    }
    return { key: `hub:${hubId}`, nodes: [...nodes], edges: [...edgeIds] };
  };

  const Row = ({ focus, children }: { focus: LeverageFocus; children: React.ReactNode }) => (
    <button
      type="button"
      className={`edge-row lev-row${activeFocusKey === focus.key ? ' active' : ''}`}
      data-focus={focus.key}
      onClick={() => toggle(focus)}
    >
      {children}
    </button>
  );

  return (
    <aside className="sidebar leverage-panel">
      <div className="panel-head">
        <h2>Leverage</h2>
        <button className="chip icon-btn" aria-label="Close panel" title="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="muted">
        <b>{name(target)}</b>
      </p>

      {dep !== null && (
        <section className="panel-section dep-section">
          <div className="dep-head">
            <h3>Dependency</h3>
            <button
              className="chip icon-btn"
              aria-label="Clear comparison"
              title="Clear comparison"
              onClick={onClearCompare}
            >
              ✕
            </button>
          </div>
          <p className="muted">
            <b>{name(target)}</b> ⇄ <b>{name(compareId!)}</b>
          </p>
          {!dep.forward.exists && !dep.backward.exists ? (
            <p className="muted">No causal path between them.</p>
          ) : (
            <div className="edge-list">
              {dep.forward.exists && (
                <Row focus={{ key: 'dep:fwd', nodes: dep.forward.path.nodes, edges: dep.forward.path.edgeIds }}>
                  <span className={`lev-sign ${SIGN_CLASS[dep.forward.sign]}`}>{SIGN_GLYPH[dep.forward.sign]}</span>{' '}
                  {name(target)} → {name(compareId!)} <span className="muted">· {distLabel(dep.forward.distance)}</span>
                </Row>
              )}
              {dep.backward.exists && (
                <Row focus={{ key: 'dep:bwd', nodes: dep.backward.path.nodes, edges: dep.backward.path.edgeIds }}>
                  <span className={`lev-sign ${SIGN_CLASS[dep.backward.sign]}`}>{SIGN_GLYPH[dep.backward.sign]}</span>{' '}
                  {name(compareId!)} → {name(target)} <span className="muted">· {distLabel(dep.backward.distance)}</span>
                </Row>
              )}
              {dep.loop !== null && (
                <p className="muted lev-hint">
                  Together they form a{dep.loop === 'unknown' ? 'n' : ''} {depLoopLabel(dep.loop)} loop
                  {dep.loop !== 'unknown' ? ` (${dep.loop})` : ''}.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <section className="panel-section">
        <h3>Feedback loops{report.loops.length > 0 ? ` (${report.loops.length})` : ''}</h3>
        {report.loops.length === 0 ? (
          <p className="muted">Not part of any feedback loop.</p>
        ) : (
          <div className="edge-list">
            {report.loops.slice(0, LOOPS_SHOWN).map((l) => (
              <Row key={l.key} focus={{ key: `loop:${l.key}`, nodes: l.nodes, edges: l.edgeIds }}>
                <span className={`lev-kind lev-kind-${l.kind}`}>{l.kind}</span> {kindLabel(l.kind)}{' '}
                <span className="muted">· {l.length} vars</span>
              </Row>
            ))}
            {report.loops.length > LOOPS_SHOWN && (
              <p className="muted">+{report.loops.length - LOOPS_SHOWN} more (shortest shown)</p>
            )}
          </div>
        )}
      </section>

      <section className="panel-section">
        <h3>Drivers (upstream)</h3>
        {report.drivers.length === 0 ? (
          <p className="muted">No upstream causes — this variable is a driver, not driven.</p>
        ) : (
          <div className="edge-list">
            {report.drivers.slice(0, DRIVERS_SHOWN).map((d) => (
              <Row key={d.id} focus={{ key: `drv:${d.id}`, nodes: d.path.nodes, edges: d.path.edgeIds }}>
                <span className={`lev-sign ${SIGN_CLASS[d.sign]}`}>{SIGN_GLYPH[d.sign]}</span> {name(d.id)}{' '}
                <span className="muted">
                  · {d.distance === 1 ? 'direct' : `${d.distance} hops`}
                  {d.loopCount > 0 ? ` · in ${d.loopCount} loop${d.loopCount > 1 ? 's' : ''}` : ''}
                </span>
              </Row>
            ))}
            {report.drivers.length > DRIVERS_SHOWN && (
              <p className="muted">+{report.drivers.length - DRIVERS_SHOWN} more</p>
            )}
          </div>
        )}
      </section>

      {report.hubs.length > 0 && (
        <section className="panel-section">
          <h3>Leverage points</h3>
          <p className="muted lev-hint">Variables recurring across this one's loops — change one, move many.</p>
          <div className="edge-list">
            {report.hubs.slice(0, HUBS_SHOWN).map((h) => (
              <Row key={h.id} focus={hubFocus(h.id)}>
                <span className={`lev-sign ${SIGN_CLASS[h.sign]}`}>{SIGN_GLYPH[h.sign]}</span> {name(h.id)}{' '}
                <span className="muted">
                  · in {h.loopCount} of {name(target)}'s loops
                </span>
              </Row>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
