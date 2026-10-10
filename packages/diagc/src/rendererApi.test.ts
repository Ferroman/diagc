import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ts = createRequire(path.join(root, 'package.json'))('typescript') as typeof import('typescript');

/** Every name the renderer's entry exports. It names each one (no `export *`), so
 * its syntax is enough and no program is built. */
function rendererExports(): Set<string> {
  const file = path.join(root, 'packages/renderer/src/index.tsx');
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) names.add(element.name.text);
    }
  }
  return names;
}

describe('@diagc/renderer', () => {
  // The package is private, but docs/reference/renderer.md shows a host in a
  // checkout rendering DiagramView itself, so what it imports has to resolve.
  it('exports what the docs import from it', () => {
    const names = rendererExports();
    const imported: string[] = [];
    for (const file of walkFiles(path.join(root, 'docs'), (f) => f.endsWith('.md'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'@diagc\/renderer'/g)) {
        for (const raw of m[1]!.split(',')) {
          const name = raw
            .replace(/\btype\b/, '')
            .split(/\s+as\s+/)[0]!
            .trim();
          if (name !== '') imported.push(`${path.relative(root, file)} imports ${name}`);
        }
      }
    }
    expect(imported).not.toEqual([]);
    expect(imported.filter((line) => !names.has(line.slice(line.lastIndexOf(' ') + 1)))).toEqual([]);
  });
});

function walkFiles(dir: string, keep: (file: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walkFiles(full, keep);
    return keep(full) ? [full] : [];
  });
}
