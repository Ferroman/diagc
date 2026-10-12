import type { ReactNode } from 'react';

export type InspectorTab = 'properties' | 'library';

/**
 * The left inspector dock's tab shell: a Properties tab (the current selection's
 * panel) and a Library tab (palette + add actions). Presentational — the host
 * (InspectorDock) renders the bodies and useDockLayout owns the active tab, so a
 * flow can open Properties (entering edit mode, adding a node) while a canvas
 * click leaves the tab where it is. Only the active body is mounted.
 */
export function InspectorTabs({
  activeTab,
  onTabChange,
  properties,
  library,
}: {
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  properties: ReactNode;
  library: ReactNode;
}) {
  return (
    <div className="inspector">
      <div className="inspector-tabs" role="tablist" aria-label="Inspector">
        {(['properties', 'library'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`inspector-tab-${tab}`}
            aria-controls={`inspector-panel-${tab}`}
            aria-selected={activeTab === tab}
            className={`inspector-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {tab === 'properties' ? 'Properties' : 'Library'}
          </button>
        ))}
      </div>
      <div
        className="inspector-body"
        role="tabpanel"
        id={`inspector-panel-${activeTab}`}
        aria-labelledby={`inspector-tab-${activeTab}`}
      >
        {activeTab === 'properties' ? properties : library}
      </div>
    </div>
  );
}
