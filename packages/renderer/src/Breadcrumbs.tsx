import { Panel } from '@xyflow/react';

export interface BreadcrumbsProps {
  /** the drill trail root→current (node ids); empty = bird's-eye, nothing shown */
  path: string[];
  nameOf: (id: string) => string;
  /** a crumb was clicked; `null` = the home button (zoom all the way out) */
  onCrumb: (id: string | null) => void;
}

/** The nested-zoom trail. Rendered as a React Flow overlay panel; each crumb pops
 *  the view back out to that frame (the last crumb is the current frame). */
export function Breadcrumbs({ path, nameOf, onCrumb }: BreadcrumbsProps) {
  if (path.length === 0) return null;
  return (
    <Panel position="top-left" className="dg-breadcrumbs">
      <nav className="dg-breadcrumbs-nav" aria-label="Nested zoom breadcrumb">
        <button type="button" className="dg-crumb dg-crumb-home" title="Zoom out to the bird’s-eye view" onClick={() => onCrumb(null)}>
          ⌂
        </button>
        {path.map((id, i) => {
          const current = i === path.length - 1;
          return (
            <span key={id} className="dg-crumb-item">
              <span className="dg-crumb-sep" aria-hidden="true">
                ›
              </span>
              <button
                type="button"
                className={`dg-crumb${current ? ' dg-crumb-current' : ''}`}
                {...(current ? { 'aria-current': 'page' as const } : {})}
                onClick={() => onCrumb(id)}
              >
                {nameOf(id)}
              </button>
            </span>
          );
        })}
      </nav>
    </Panel>
  );
}
