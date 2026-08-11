import type { DiagramPlane } from '@diagramming/core';

/**
 * Switches the active plane (the derived viewpoint). `undefined` = the base/default
 * view with no plane overlay. Presentational only — the parent maps the selection to
 * its own reset/switch semantics — so the same control serves both view and edit mode.
 */
export function PlaneSwitcher({
  planes,
  activePlane,
  onSelect,
}: {
  planes: DiagramPlane[];
  activePlane: string | undefined;
  onSelect: (id: string | undefined) => void;
}) {
  if (planes.length === 0) return null;
  return (
    <div className="lp-planes" role="group" aria-label="Active plane">
      <button
        type="button"
        className={`chip plane${activePlane === undefined ? ' active' : ''}`}
        onClick={() => onSelect(undefined)}
        title="Base view — no plane overlay"
      >
        Default
      </button>
      {planes.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`chip plane${activePlane === p.id ? ' active' : ''}`}
          onClick={() => onSelect(p.id)}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
