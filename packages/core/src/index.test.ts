import { describe, expect, it } from 'vitest';
import * as publicApi from './index';
import * as internalApi from './internal';

describe('@diagc/core entry points', () => {
  // The author API. Semver covers exactly this list from 1.0; changing it is a
  // deliberate API change, made here where a reviewer sees it.
  const PUBLIC_VALUES = [
    'ActivityBuilder',
    'ActivityScope',
    'BUILTIN_NOTATIONS',
    'BranchRef',
    'CategoryRef',
    'CauseRef',
    'CommitRef',
    'ConsequenceRef',
    'DiagramValidationError',
    'EDGE_LABEL_SIDES',
    'FONT_SCALES',
    'FishboneBuilder',
    'FlowRef',
    'GitGraphBuilder',
    'LEGEND_POSITIONS',
    'LEGEND_SECTIONS',
    'LaneRef',
    'ModelBuilder',
    'NodeRef',
    'PlanBuilder',
    'RELATION_LINES',
    'RELATION_MARKERS',
    'RELATION_SHAPES',
    'RegionRef',
    'SIDES',
    'STRIDE',
    'SecondOrderBuilder',
    'TEXT_ALIGNS',
    'THREAT_SEVERITIES',
    'THREAT_STATUSES',
    'ThreatModelBuilder',
    'ZoneBuilder',
    'diagramWarnings',
    'model',
    'validate',
  ];

  it('exports exactly the author API', () => {
    expect(Object.keys(publicApi).sort()).toEqual(PUBLIC_VALUES);
  });

  it('hands out the same objects from both entries', () => {
    for (const [name, value] of Object.entries(publicApi)) {
      expect(internalApi[name as keyof typeof internalApi], name).toBe(value);
    }
  });
});
