import type { LayoutSettings } from '@diagramming/core';

const ALGORITHMS: { value: string; label: string }[] = [
  { value: 'layered', label: 'Layered' },
  { value: 'force', label: 'Force' },
  { value: 'stress', label: 'Stress' },
  { value: 'mrtree', label: 'Tree' },
  { value: 'radial', label: 'Radial' },
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

  return (
    <>
      <select
        className="chip-select"
        aria-label="Layout algorithm"
        title="Layout algorithm"
        value={algorithm}
        onChange={(e) => onChange({ algorithm: e.target.value === 'layered' ? undefined : e.target.value })}
      >
        {ALGORITHMS.map((a) => (
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
