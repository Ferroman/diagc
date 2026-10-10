import { describe, expect, it } from 'vitest';
import * as entry from './index';

describe('@diagc/renderer', () => {
  // The values the studio, the viewer and the Obsidian plugin import. A name
  // joins when an app imports it and leaves when the last one stops; the types
  // they import are checked by typechecking the apps.
  it('exports the values the apps import', () => {
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
