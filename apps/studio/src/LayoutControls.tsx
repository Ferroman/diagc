import type { LayoutDirection, LayoutSettings } from '@diagc/core';

/**
 * The arrangements worth offering.
 *
 * `radial` and `stress` were withdrawn (DEFERRALS.md). radial needs a TREE, so
 * on any diagram carrying a cycle — which is every real architecture diagram —
 * it fails on both the lifted and the flat graph and the engine degrades to
 * layered, meaning the entry could only ever be a no-op that looked broken.
 * stress places nodes as dimensionless points with no overlap removal, so its
 * compact result is a pile (146 overlapping sibling pairs on platform-c4).
 * Both are still honoured when a sidecar names them — only the picker stops
 * proposing them. stress now has its boxes pushed apart after elk places them
 * (renderer overlap.ts) and is the causal-loop default, where the picker lists
 * it as that notation's default (`defaultAlgorithm`); elsewhere it stays off
 * the list until it has been tried on nested diagrams like platform-c4.
 */
const ALGORITHMS: { value: string; label: string }[] = [
  { value: 'layered', label: 'Layered' },
  { value: 'force', label: 'Force' },
  { value: 'mrtree', label: 'Tree' },
  { value: 'rectpacking', label: 'Packed' },
];
/** names for notation defaults the picker does not list itself */
const ALGORITHM_NAMES: Record<string, string> = { stress: 'Stress' };
const DIRECTIONS: { value: string; label: string }[] = [
  { value: 'DOWN', label: 'Down ↓' },
  { value: 'RIGHT', label: 'Right →' },
  { value: 'LEFT', label: 'Left ←' },
  { value: 'UP', label: 'Up ↑' },
];
// Preset targets for the layered wrap (width÷height). Values are what the
// sidecar stores; the empty value is "off" and sends `undefined` like every
// other control's default.
const WRAP_PRESETS: { value: string; label: string }[] = [
  { value: '', label: 'Off' },
  { value: '1', label: 'Square' },
  { value: '1.6', label: 'Screen' },
  { value: '2', label: 'Wide' },
];

export interface LayoutControlsProps {
  /** the plane's effective settings — sidecar values with any preview merged over */
  settings: LayoutSettings;
  /** merge a patch; a field set to undefined clears it back to the tuned default */
  onChange: (patch: Partial<LayoutSettings>) => void;
  /** the direction this diagram flows in when the settings name none (core's
   * defaultLayoutDirection) — shown as the selected option, stored as
   * `undefined`. Absent ⇒ down, the default for every model but an activity one. */
  defaultDirection?: LayoutDirection;
  /** the notation pins the algorithm (elk partitions are layered-only): the
   * picker is withheld, everything else stays adjustable */
  algorithmLocked?: boolean;
  /** the algorithm this notation runs when the settings name none (a causal
   * loop's stress) — shown as the selected option, stored as `undefined`, and
   * listed even when the picker does not otherwise offer it. Absent ⇒ layered. */
  defaultAlgorithm?: string;
}

/**
 * Algorithm / direction / spacing / edge routing, with no opinion about where
 * the settings live. The editor dispatches them into the undo stack; view mode
 * holds them in ephemeral React state. Choosing a control's default value
 * sends `undefined`, so neither store accumulates redundant entries.
 *
 * One labelled row per control: these live in the dock's Layout & style section
 * (LayoutPanel), not the topbar, where five bare selects pushed the row past
 * the window's edge. Each control keeps its `aria-label` — the longer name
 * ("Layout algorithm") still contains the row's visible one.
 */
export function LayoutControls({
  settings,
  onChange,
  defaultDirection = 'DOWN',
  algorithmLocked,
  defaultAlgorithm = 'layered',
}: LayoutControlsProps) {
  // Locked notations run layered whatever the sidecar names (elk partitions are
  // layered-only) — the layered-only controls below must reflect that forced
  // algorithm, not a setting the run ignores.
  const algorithm = algorithmLocked === true ? 'layered' : (settings.algorithm ?? defaultAlgorithm);
  const direction = settings.direction ?? defaultDirection;
  const edgeRouting = settings.edgeRouting ?? 'curved';

  const wrapValue = settings.aspectRatio === undefined ? '' : String(settings.aspectRatio);
  // A sidecar may carry a ratio outside the presets; list it so the select
  // never misreports what is actually arranging the diagram.
  const wrapOptions = WRAP_PRESETS.some((w) => w.value === wrapValue)
    ? WRAP_PRESETS
    : [...WRAP_PRESETS, { value: wrapValue, label: `${wrapValue} (custom)` }];

  // A diagram may already name an algorithm the picker no longer proposes (a
  // sidecar written before radial/stress were withdrawn). Keep it in the list
  // rather than rendering a blank select that misreports what is actually
  // arranging the diagram — and that you could not deliberately move off.
  //
  // A notation's own default is listed under its own name, not as withdrawn:
  // stress is off the general picker, but on a causal loop it is the default
  // (overlap removal makes it usable there).
  const withDefault = ALGORITHMS.some((a) => a.value === defaultAlgorithm)
    ? ALGORITHMS
    : [...ALGORITHMS, { value: defaultAlgorithm, label: ALGORITHM_NAMES[defaultAlgorithm] ?? defaultAlgorithm }];
  const algorithms = withDefault.some((a) => a.value === algorithm)
    ? withDefault
    : [...withDefault, { value: algorithm, label: `${algorithm} (withdrawn)` }];

  return (
    <>
      {algorithmLocked !== true && (
        <label className="layout-row">
          <span>Algorithm</span>
          <select
            className="chip-select"
            aria-label="Layout algorithm"
            title="Layout algorithm"
            value={algorithm}
            // the notation's default is stored as `undefined`, so `layered` is
            // stored by name wherever it is not the default
            onChange={(e) => onChange({ algorithm: e.target.value === defaultAlgorithm ? undefined : e.target.value })}
          >
            {algorithms.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {algorithm === 'layered' && (
        <label className="layout-row">
          <span>Direction</span>
          <select
            className="chip-select"
            aria-label="Layout direction"
            title="Layout direction"
            value={direction}
            onChange={(e) => onChange({ direction: e.target.value === defaultDirection ? undefined : e.target.value })}
          >
            {DIRECTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {algorithm === 'layered' && (
        <label className="layout-row">
          <span>Wrap</span>
          <select
            className="chip-select"
            aria-label="Wrap"
            title="Wrap long chains onto several rows, aiming at this width÷height"
            value={wrapValue}
            onChange={(e) => onChange({ aspectRatio: e.target.value === '' ? undefined : Number(e.target.value) })}
          >
            {wrapOptions.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="layout-row">
        <span>Spacing</span>
        <input
          type="number"
          className="chip-num"
          aria-label="Node spacing"
          title="Node spacing in px (blank = default)"
          min={8}
          max={200}
          step={4}
          placeholder="40"
          value={settings.spacing ?? ''}
          onChange={(e) => {
            const v = e.target.value.trim();
            onChange({ spacing: v === '' ? undefined : Number(v) });
          }}
        />
      </label>
      <label className="layout-row">
        <span>Edges</span>
        <select
          className="chip-select"
          aria-label="Edge routing"
          title="How routed edges turn their corners. Both follow the layout's route around boxes; an edge to a hand-placed box floats as a curve either way."
          value={edgeRouting}
          onChange={(e) =>
            onChange({ edgeRouting: e.target.value === 'curved' ? undefined : (e.target.value as 'orthogonal') })
          }
        >
          <option value="curved">Rounded</option>
          <option value="orthogonal">Square</option>
        </select>
      </label>
    </>
  );
}
