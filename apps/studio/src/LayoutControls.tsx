import type { LayoutSettings } from '@diagramming/core';

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
 * proposing them.
 */
const ALGORITHMS: { value: string; label: string }[] = [
  { value: 'layered', label: 'Layered' },
  { value: 'force', label: 'Force' },
  { value: 'mrtree', label: 'Tree' },
  { value: 'rectpacking', label: 'Packed' },
];
const DIRECTIONS: { value: string; label: string }[] = [
  { value: 'RIGHT', label: 'Right →' },
  { value: 'DOWN', label: 'Down ↓' },
  { value: 'LEFT', label: 'Left ←' },
  { value: 'UP', label: 'Up ↑' },
];

export interface LayoutControlsProps {
  /** the plane's effective settings — sidecar values with any preview merged over */
  settings: LayoutSettings;
  /** merge a patch; a field set to undefined clears it back to the tuned default */
  onChange: (patch: Partial<LayoutSettings>) => void;
}

/**
 * Algorithm / direction / spacing / edge routing, with no opinion about where
 * the settings live. The editor dispatches them into the undo stack; view mode
 * holds them in ephemeral React state. Choosing a control's default value
 * sends `undefined`, so neither store accumulates redundant entries.
 */
export function LayoutControls({ settings, onChange }: LayoutControlsProps) {
  const algorithm = settings.algorithm ?? 'layered';
  const direction = settings.direction ?? 'RIGHT';
  const edgeRouting = settings.edgeRouting ?? 'curved';

  // A diagram may already name an algorithm the picker no longer proposes (a
  // sidecar written before radial/stress were withdrawn). Keep it in the list
  // rather than rendering a blank select that misreports what is actually
  // arranging the diagram — and that you could not deliberately move off.
  const algorithms = ALGORITHMS.some((a) => a.value === algorithm)
    ? ALGORITHMS
    : [...ALGORITHMS, { value: algorithm, label: `${algorithm} (withdrawn)` }];

  return (
    <>
      <select
        className="chip-select"
        aria-label="Layout algorithm"
        title="Layout algorithm"
        value={algorithm}
        onChange={(e) => onChange({ algorithm: e.target.value === 'layered' ? undefined : e.target.value })}
      >
        {algorithms.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
      {algorithm === 'layered' && (
        <select
          className="chip-select"
          aria-label="Layout direction"
          title="Layout direction"
          value={direction}
          onChange={(e) => onChange({ direction: e.target.value === 'RIGHT' ? undefined : e.target.value })}
        >
          {DIRECTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      )}
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
      <select
        className="chip-select"
        aria-label="Edge routing"
        title="Edge routing"
        value={edgeRouting}
        onChange={(e) =>
          onChange({ edgeRouting: e.target.value === 'curved' ? undefined : (e.target.value as 'orthogonal') })
        }
      >
        <option value="curved">Curved edges</option>
        <option value="orthogonal">Orthogonal edges</option>
      </select>
    </>
  );
}
