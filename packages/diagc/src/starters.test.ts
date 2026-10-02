import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STARTER_FILE, UnknownStarterError, readStarter, starterTypes } from './starters';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'diagc-starters-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function starter(type: string, src: string): void {
  mkdirSync(path.join(dir, type), { recursive: true });
  writeFileSync(path.join(dir, type, STARTER_FILE), src);
}

describe('starterTypes', () => {
  it('lists the folders that hold a starter, sorted', () => {
    starter('er', 'e');
    starter('basic', 'b');
    starter('c4', 'c');
    expect(starterTypes(dir)).toEqual(['basic', 'c4', 'er']);
  });

  it('ignores a folder without a starter and a loose file', () => {
    starter('c4', 'c');
    mkdirSync(path.join(dir, 'features'));
    writeFileSync(path.join(dir, 'features', 'legend.diagram.ts'), 'x');
    writeFileSync(path.join(dir, 'acme.diagram.ts'), 'x');
    expect(starterTypes(dir)).toEqual(['c4']);
  });

  it('is empty for a directory that does not exist', () => {
    expect(starterTypes(path.join(dir, 'nope'))).toEqual([]);
  });
});

describe('readStarter', () => {
  it('returns the source byte for byte', () => {
    const src = "import { model } from '@diagc/core';\n\nexport default model('x');\n";
    starter('basic', src);
    expect(readStarter(dir, 'basic')).toBe(src);
  });

  it('refuses an unknown type and names the known ones', () => {
    starter('basic', 'b');
    starter('c4', 'c');
    expect(() => readStarter(dir, 'c5')).toThrowError(UnknownStarterError);
    expect(() => readStarter(dir, 'c5')).toThrow("No starter 'c5'. Types: basic, c4");
  });

  it('refuses a type that is a path, without reading it', () => {
    starter('basic', 'b');
    writeFileSync(path.join(dir, STARTER_FILE), 'outside a type folder');
    expect(() => readStarter(dir, '.')).toThrowError(UnknownStarterError);
    expect(() => readStarter(dir, 'basic/..')).toThrowError(UnknownStarterError);
    expect(() => readStarter(dir, '../x')).toThrowError(UnknownStarterError);
  });
});
