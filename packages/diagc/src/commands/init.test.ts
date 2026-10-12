import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { argsOf, captureIo, contextFor, inTempDir } from '../../test-fixtures/cli';
import { init } from './init';

describe('init', () => {
  it('sets the current directory up, from a name and --type, and prints each step on stdout', async () => {
    await inTempDir(async (dir) => {
      const io = captureIo();
      expect(await init.run(argsOf(['shop'], { '--type': 'c4' }), contextFor(io))).toBe(0);
      expect(io.stderr).toBe('');
      expect(io.stdout).toMatch(/^✓ \.diagrams\/src\/shop\.diagram\.ts\s+\(c4 starter\)$/m);
      expect(io.stdout).toContain('Next:');
      expect(existsSync(path.join(dir, '.diagrams', '.artifacts', 'shop.diagram.json'))).toBe(true);
    });
  });

  it('writes the agents block with --agents', async () => {
    await inTempDir(async (dir) => {
      const io = captureIo();
      expect(await init.run(argsOf([], { '--agents': true }), contextFor(io))).toBe(0);
      expect(io.stdout).toMatch(/^✓ AGENTS\.md\s+\(diagc block added\)$/m);
      expect(existsSync(path.join(dir, 'AGENTS.md'))).toBe(true);
    });
  });

  it('takes one name, and refuses an unknown type, on stderr with exit 1, writing nothing', async () => {
    await inTempDir(async (dir) => {
      const two = captureIo();
      expect(await init.run(argsOf(['a', 'b']), contextFor(two))).toBe(1);
      expect([two.stdout, two.stderr]).toEqual([
        '',
        'diagc: init takes one name, got 2 — e.g. diagc init shop --type c4\n',
      ]);
      const unknown = captureIo();
      expect(await init.run(argsOf([], { '--type': 'c5' }), contextFor(unknown))).toBe(1);
      expect(unknown.stdout).toBe('');
      expect(unknown.stderr).toMatch(/^diagc: No starter 'c5'\. Types: activity, basic, c4/);
      expect(readdirSync(dir)).toEqual([]);
    });
  });
});
