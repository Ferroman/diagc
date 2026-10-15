import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STYLE_IDS } from './cli/parse';
import { findHome } from './home';

// The CLI refuses a `--style` it does not know, so it carries the list of presets —
// which the renderer owns, and the CLI cannot import (it only couples to the viewer
// as a built artifact). The two lists are pinned together here.
const root = findHome(fileURLToPath(import.meta.url)).root;

describe('the style ids publish accepts', () => {
  it("are the renderer's presets, in its order", () => {
    const source = readFileSync(path.join(root, 'packages', 'renderer', 'src', 'sketch', 'stylePresets.ts'), 'utf8');
    // each preset constant's id, then the order STYLE_PRESETS lists them in — the
    // order the studio's picker shows, which a refusal should name them in too
    const ids = new Map(
      [...source.matchAll(/const ([A-Z_]+): StylePreset = \{[^]*?id: '([a-z-]+)'/g)].map((m) => [m[1], m[2]]),
    );
    const listed = source
      .match(/STYLE_PRESETS: StylePreset\[\] = \[([^\]]+)\]/)![1]!
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== '')
      .map((name) => ids.get(name));
    expect(listed).toHaveLength(14);
    expect(STYLE_IDS).toEqual(listed);
  });
});
