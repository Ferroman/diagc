import type { CSSProperties, MutableRefObject } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { diffMarksByPlane, type DiagramModel, type DiffMarks, type DiffStatus } from '@diagc/core/internal';
import type { LayoutApi } from '@diagc/renderer';

// The combined diff page: one picture holding both versions (core's combineDiff),
// with a switch per kind of change, the changes counted per plane, and a message
// the overview page sends to bring one changed element into view.

/** How a plane itself changed, where it did. */
export type PlaneStatuses = Record<string, DiffStatus>;

/** Which marks the reader has switched on. */
export interface DiffShow {
  added: boolean;
  removed: boolean;
  changed: boolean;
  /** fade whatever carries no mark */
  dim: boolean;
}

export const SHOW_ALL: DiffShow = { added: true, removed: true, changed: true, dim: false };

/**
 * The marks the canvas outlines. A switched-off `added` or `changed` drops out,
 * and the element is drawn as any other. `removed` always stays: a removed
 * element is in the picture only as a mark, so switching it off hides the
 * element (hostClass), and that needs the mark's class on it.
 */
export function shownMarks(marks: DiffMarks, show: DiffShow): DiffMarks {
  const keep = (statuses: Record<string, DiffStatus>) =>
    Object.fromEntries(Object.entries(statuses).filter(([, s]) => s === 'removed' || show[s]));
  return { nodes: keep(marks.nodes), relations: keep(marks.relations) };
}

/** The classes the switches put around the canvas (renderer styles.css reads them). */
export function hostClass(show: DiffShow): string | undefined {
  const classes = [...(show.removed ? [] : ['dg-diff-hide-removed']), ...(show.dim ? ['dg-diff-dim'] : [])];
  return classes.length > 0 ? classes.join(' ') : undefined;
}

/** How many marks of each kind the plane `plane` shows (`''` = a model without planes). */
export function statusCounts(model: DiagramModel, marks: DiffMarks, plane: string): Record<DiffStatus, number> {
  const counts: Record<DiffStatus, number> = { added: 0, removed: 0, changed: 0 };
  const on = diffMarksByPlane(model, marks).get(plane);
  for (const id of on?.nodes ?? []) counts[marks.nodes[id]!] += 1;
  for (const id of on?.relations ?? []) counts[marks.relations[id]!] += 1;
  return counts;
}

/** Every plane's number of marks, by plane id. */
export function planeCounts(model: DiagramModel, marks: DiffMarks): Record<string, number> {
  return Object.fromEntries(
    [...diffMarksByPlane(model, marks)].map(([id, on]) => [id, on.nodes.length + on.relations.length]),
  );
}

/** The plane the page opens on: the first that shows a change, so a change that
 * only a later plane draws is not behind a click. Undefined = the first plane. */
export function openingDiffPlane(model: DiagramModel, marks: DiffMarks): string | undefined {
  const counts = planeCounts(model, marks);
  return model.planes.find((p) => (counts[p.id] ?? 0) > 0)?.id;
}

/** What the overview page asks the combined page to show. */
export interface DiffFocus {
  type: 'diagc-diff-focus';
  node?: string;
  relation?: string;
  plane?: string;
}

export function isDiffFocus(data: unknown): data is DiffFocus {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'diagc-diff-focus';
}

/** Where a focus request lands: the plane to draw (undefined = stay) and the nodes to bring into view. */
export interface FocusPlan {
  plane?: string;
  nodes: string[];
  /** the kind of mark the element carries, to switch back on if it is off */
  status?: DiffStatus;
}

/**
 * Resolve a focus request against the model: a node is itself, a relation its two
 * ends, a plane just a switch. The view stays on `current` when that plane shows
 * the element, and moves to the first plane that does otherwise.
 */
export function planFocus(model: DiagramModel, marks: DiffMarks, focus: DiffFocus, current: string): FocusPlan {
  if (focus.plane !== undefined) {
    return model.planes.some((p) => p.id === focus.plane) ? { plane: focus.plane, nodes: [] } : { nodes: [] };
  }
  const relation = focus.relation !== undefined ? model.relations.find((r) => r.id === focus.relation) : undefined;
  const nodes = relation !== undefined ? [relation.from, relation.to] : focus.node !== undefined ? [focus.node] : [];
  const status = relation !== undefined ? marks.relations[relation.id] : marks.nodes[focus.node ?? ''];
  const shows = (on: { nodes: string[]; relations: string[] } | undefined) =>
    on !== undefined && (relation !== undefined ? on.relations.includes(relation.id) : on.nodes.includes(focus.node!));
  const byPlane = diffMarksByPlane(model, marks);
  const plan: FocusPlan = { nodes: [...new Set(nodes)], ...(status !== undefined ? { status } : {}) };
  if (nodes.length === 0 || shows(byPlane.get(current))) return plan;
  const other = [...byPlane].find(([, on]) => shows(on))?.[0];
  return other !== undefined && other !== '' ? { ...plan, plane: other } : plan;
}

/** How often, and for how long, a focus waits for its nodes: a plane switch lays out first. */
const FOCUS_POLL_MS = 150;
const FOCUS_DEADLINE_MS = 6000;

export interface DiffViewInput {
  /** undefined on every page that is not a combined diff page */
  marks: DiffMarks | undefined;
  model: DiagramModel | undefined;
  /** the plane being drawn; undefined = the first */
  plane: string | undefined;
  setPlane: (id: string) => void;
  apiRef: MutableRefObject<LayoutApi | null>;
}

export interface DiffView {
  show: DiffShow;
  toggle: (key: keyof DiffShow) => void;
  /** the marks to hand the canvas */
  marks: DiffMarks | undefined;
  /** the marks of each kind on the drawn plane */
  counts: Record<DiffStatus, number>;
  /** each plane's number of marks */
  planes: Record<string, number>;
}

/** The combined diff page's state: its switches, its counts, and the focus requests it answers. */
export function useDiffView({ marks, model, plane, setPlane, apiRef }: DiffViewInput): DiffView {
  const [show, setShow] = useState<DiffShow>(SHOW_ALL);
  const [focus, setFocus] = useState<{ nodes: string[] } | null>(null);
  const current = plane ?? model?.planes[0]?.id ?? '';

  const onMessage = useCallback(
    (e: MessageEvent) => {
      if (marks === undefined || model === undefined || !isDiffFocus(e.data)) return;
      const plan = planFocus(model, marks, e.data, current);
      if (plan.plane !== undefined && plan.plane !== current) setPlane(plan.plane);
      const { status } = plan;
      if (status !== undefined) setShow((s) => (s[status] ? s : { ...s, [status]: true }));
      if (plan.nodes.length > 0) setFocus({ nodes: plan.nodes });
    },
    [marks, model, current, setPlane],
  );
  useEffect(() => {
    if (marks === undefined) return;
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [marks, onMessage]);

  // The nodes may not be on the canvas yet (the plane just switched), so ask until
  // they are, and give up quietly: the reader still has the plane in front of them.
  useEffect(() => {
    if (focus === null) return;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      if (apiRef.current?.focusNodes(focus.nodes) === true || Date.now() - started > FOCUS_DEADLINE_MS) return;
      timer = setTimeout(attempt, FOCUS_POLL_MS);
    };
    timer = setTimeout(attempt, FOCUS_POLL_MS);
    return () => clearTimeout(timer);
  }, [focus, apiRef]);

  const shown = useMemo(() => (marks !== undefined ? shownMarks(marks, show) : undefined), [marks, show]);
  const counts = useMemo(
    () =>
      marks !== undefined && model !== undefined
        ? statusCounts(model, marks, current)
        : { added: 0, removed: 0, changed: 0 },
    [marks, model, current],
  );
  const planes = useMemo(
    () => (marks !== undefined && model !== undefined ? planeCounts(model, marks) : {}),
    [marks, model],
  );
  const toggle = useCallback((key: keyof DiffShow) => setShow((s) => ({ ...s, [key]: !s[key] })), []);
  return { show, toggle, marks: shown, counts, planes };
}

// The switches, drawn as chips of the page's top bar. The swatch colours are the
// renderer's own marks (`--dg-diff-*` on `.dg-canvas`); the bar sits outside the
// canvas, so they are named here again.
export const DIFF_COLORS: Record<DiffStatus, string> = { added: '#16a34a', removed: '#dc2626', changed: '#d97706' };
const LABELS: Record<DiffStatus, string> = { added: 'Added', removed: 'Removed', changed: 'Changed' };
const STATUSES: readonly DiffStatus[] = ['added', 'removed', 'changed'];

const groupStyle: CSSProperties = {
  display: 'inline-flex',
  gap: 2,
  alignItems: 'center',
  flexWrap: 'wrap',
  borderLeft: '1px solid var(--dg-border)',
  marginLeft: 4,
  paddingLeft: 6,
};

const switchStyle = (on: boolean, strike = true): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: 'none',
  border: 'none',
  borderRadius: 4,
  color: on ? 'var(--dg-text)' : 'var(--dg-text-muted)',
  cursor: 'pointer',
  font: 'inherit',
  opacity: on || !strike ? 1 : 0.55,
  padding: '2px 6px',
  textDecoration: on || !strike ? 'none' : 'line-through',
  // the fade is an extra, off at rest: it reads as pressed when on, not as struck out when off
  ...(!strike && on ? { background: 'var(--dg-badge-bg)', color: 'var(--dg-badge-text)' } : {}),
});

const swatchStyle = (color: string, dashed: boolean): CSSProperties => ({
  width: 9,
  height: 9,
  border: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
  borderRadius: 2,
});

/** The switches of a combined diff page: one per kind of change, with how many the
 * drawn plane shows, and the fade for everything else. */
export function DiffSwitches({
  show,
  counts,
  onToggle,
  first,
}: {
  show: DiffShow;
  counts: Record<DiffStatus, number>;
  onToggle: (key: keyof DiffShow) => void;
  /** nothing stands before the group in the bar, so no divider */
  first: boolean;
}) {
  return (
    <span
      style={first ? { ...groupStyle, borderLeft: 'none', marginLeft: 0, paddingLeft: 0 } : groupStyle}
      role="group"
      aria-label="Changes"
    >
      {STATUSES.map((s) => (
        <button key={s} type="button" aria-pressed={show[s]} style={switchStyle(show[s])} onClick={() => onToggle(s)}>
          <span style={swatchStyle(DIFF_COLORS[s], s === 'removed')} aria-hidden="true" />
          {LABELS[s]} {counts[s]}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={show.dim}
        style={switchStyle(show.dim, false)}
        onClick={() => onToggle('dim')}
      >
        Dim the rest
      </button>
    </span>
  );
}
