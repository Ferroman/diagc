// The causal-loop "leverage" report for one selected variable: the feedback
// loops it sits in, its upstream drivers, and the hubs its loops share. Lives in
// the renderer rather than the studio so the published page can show it too —
// the analysis (leverage.ts) already did; only this view of it was studio-only.
// Styled by styles.css (`.dg-lev-*`), which DiagramView imports, so any host
// that draws a diagram has the rules.
import { useMemo, type ReactNode } from 'react';
import type { DiagramModel } from '@diagc/core';
import { analyzeLeverage, analyzeDependency, type LeverageSign } from './leverage';
import type { LoopEdgeInput } from './loops';

/** the nodes/edges a clicked report row asks the canvas to glow */
export interface LeverageFocus {
  key: string;
  nodes: string[];
  edges: string[];
}

export interface LeveragePanelProps {
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
  '+': 'dg-lev-pos',
  '-': 'dg-lev-neg',
  mixed: 'dg-lev-mixed',
  unknown: 'dg-lev-unknown',
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

  const Row = ({ focus, children }: { focus: LeverageFocus; children: ReactNode }) => (
    <button
      type="button"
      className={`dg-lev-row${activeFocusKey === focus.key ? ' active' : ''}`}
      data-focus={focus.key}
      onClick={() => toggle(focus)}
    >
      {children}
    </button>
  );

  return (
    <aside className="dg-leverage" aria-label="Leverage">
      <div className="dg-lev-head">
        <h2>Leverage</h2>
        <button type="button" className="dg-lev-close" aria-label="Close panel" title="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="dg-lev-muted">
        <b>{name(target)}</b>
      </p>

      {dep !== null && (
        <section className="dg-lev-section">
          <div className="dg-lev-head">
            <h3>Dependency</h3>
            <button
              type="button"
              className="dg-lev-close"
              aria-label="Clear comparison"
              title="Clear comparison"
              onClick={onClearCompare}
            >
              ✕
            </button>
          </div>
          <p className="dg-lev-muted">
            <b>{name(target)}</b> ⇄ <b>{name(compareId!)}</b>
          </p>
          {!dep.forward.exists && !dep.backward.exists ? (
            <p className="dg-lev-muted">No causal path between them.</p>
          ) : (
            <div className="dg-lev-list">
              {dep.forward.exists && (
                <Row focus={{ key: 'dep:fwd', nodes: dep.forward.path.nodes, edges: dep.forward.path.edgeIds }}>
                  <span className={`dg-lev-sign ${SIGN_CLASS[dep.forward.sign]}`}>{SIGN_GLYPH[dep.forward.sign]}</span>{' '}
                  {name(target)} → {name(compareId!)}{' '}
                  <span className="dg-lev-muted">· {distLabel(dep.forward.distance)}</span>
                </Row>
              )}
              {dep.backward.exists && (
                <Row focus={{ key: 'dep:bwd', nodes: dep.backward.path.nodes, edges: dep.backward.path.edgeIds }}>
                  <span className={`dg-lev-sign ${SIGN_CLASS[dep.backward.sign]}`}>{SIGN_GLYPH[dep.backward.sign]}</span>{' '}
                  {name(compareId!)} → {name(target)}{' '}
                  <span className="dg-lev-muted">· {distLabel(dep.backward.distance)}</span>
                </Row>
              )}
              {dep.loop !== null && (
                <p className="dg-lev-muted dg-lev-hint">
                  Together they form a{dep.loop === 'unknown' ? 'n' : ''} {depLoopLabel(dep.loop)} loop
                  {dep.loop !== 'unknown' ? ` (${dep.loop})` : ''}.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <section className="dg-lev-section">
        <h3>Feedback loops{report.loops.length > 0 ? ` (${report.loops.length})` : ''}</h3>
        {report.loops.length === 0 ? (
          <p className="dg-lev-muted">Not part of any feedback loop.</p>
        ) : (
          <div className="dg-lev-list">
            {report.loops.slice(0, LOOPS_SHOWN).map((l) => (
              <Row key={l.key} focus={{ key: `loop:${l.key}`, nodes: l.nodes, edges: l.edgeIds }}>
                <span className={`dg-lev-kind dg-lev-kind-${l.kind}`}>{l.kind}</span> {kindLabel(l.kind)}{' '}
                <span className="dg-lev-muted">· {l.length} vars</span>
              </Row>
            ))}
            {report.loops.length > LOOPS_SHOWN && (
              <p className="dg-lev-muted">+{report.loops.length - LOOPS_SHOWN} more (shortest shown)</p>
            )}
          </div>
        )}
      </section>

      <section className="dg-lev-section">
        <h3>Drivers (upstream)</h3>
        {report.drivers.length === 0 ? (
          <p className="dg-lev-muted">No upstream causes — this variable is a driver, not driven.</p>
        ) : (
          <div className="dg-lev-list">
            {report.drivers.slice(0, DRIVERS_SHOWN).map((d) => (
              <Row key={d.id} focus={{ key: `drv:${d.id}`, nodes: d.path.nodes, edges: d.path.edgeIds }}>
                <span className={`dg-lev-sign ${SIGN_CLASS[d.sign]}`}>{SIGN_GLYPH[d.sign]}</span> {name(d.id)}{' '}
                <span className="dg-lev-muted">
                  · {distLabel(d.distance)}
                  {d.loopCount > 0 ? ` · in ${d.loopCount} loop${d.loopCount > 1 ? 's' : ''}` : ''}
                </span>
              </Row>
            ))}
            {report.drivers.length > DRIVERS_SHOWN && (
              <p className="dg-lev-muted">+{report.drivers.length - DRIVERS_SHOWN} more</p>
            )}
          </div>
        )}
      </section>

      {report.hubs.length > 0 && (
        <section className="dg-lev-section">
          <h3>Leverage points</h3>
          <p className="dg-lev-muted dg-lev-hint">Variables recurring across this one's loops — change one, move many.</p>
          <div className="dg-lev-list">
            {report.hubs.slice(0, HUBS_SHOWN).map((h) => (
              <Row key={h.id} focus={hubFocus(h.id)}>
                <span className={`dg-lev-sign ${SIGN_CLASS[h.sign]}`}>{SIGN_GLYPH[h.sign]}</span> {name(h.id)}{' '}
                <span className="dg-lev-muted">
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
