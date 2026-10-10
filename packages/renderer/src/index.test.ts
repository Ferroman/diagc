import { describe, expect, it } from 'vitest';
import * as entry from './index';

describe('@diagc/renderer', () => {
  // The values the studio, the viewer and the Obsidian plugin import, and the
  // kind registry the renderer reference page builds. The types the apps import
  // are checked by typechecking the apps; what the docs import, by
  // packages/diagc/src/rendererApi.test.ts.
  it('exports the values the apps and the docs import', () => {
    expect(Object.keys(entry).sort()).toEqual([
      'ACTIVITY_LAYOUT',
      'DEFAULT_TYPE_STYLES',
      'DiagramView',
      'LIBRARY_ENTRY_DND_TYPE',
      'LeveragePanel',
      'PLAN_LAYOUT',
      'STYLE_PRESETS',
      'THEME_STORAGE_KEY',
      'applyTheme',
      'createKindRegistry',
      'createTypeRegistry',
      'darkTheme',
      'isKnownStyle',
      'lightTheme',
      'notationProfile',
      'planGraphCached',
      'planX',
      'todayIso',
    ]);
  });
});
