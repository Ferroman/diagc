import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { argsOf, captureIo, contextFor, diagram, inTempDir, writeSources } from '../../test-fixtures/cli';
import { diff, diffOutDir, parseRange } from './diff';

/** A repository in `dir` with one commit of what is there. */
function commitAll(dir: string): void {
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args],
      {
        cwd: dir,
        stdio: 'pipe',
      },
    );
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'v1');
}

describe('diff arguments', () => {
  it('reads A..B as a range and a lone ref as against the working tree', () => {
    expect(parseRange('v1.0..v2.0')).toEqual({ from: 'v1.0', to: 'v2.0' });
    expect(parseRange('HEAD~3')).toEqual({ from: 'HEAD~3' });
    expect(() => parseRange('v1..')).toThrow('is not a range');
    expect(() => parseRange('v1...v2')).toThrow('is not a range');
  });

  it('names the output directory after the range', () => {
    expect(diffOutDir('v1.0', 'feature/x')).toBe('.diagrams/diff/v1.0..feature-x');
    expect(diffOutDir('HEAD~3', undefined)).toBe('.diagrams/diff/HEAD-3..working-tree');
  });
});

describe('diff', () => {
  it('prints the change list on stdout and the pages it wrote on stderr', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { gone: diagram('gone'), shop: diagram('shop'), same: diagram('same') });
      commitAll(dir);
      rmSync(path.join(dir, '.diagrams', 'src', 'gone.diagram.json'));
      writeSources(dir, { shop: diagram('shop', { nodes: [{ id: 'a', name: 'B', type: 'service' }] }) });
      const io = captureIo();
      const args = argsOf(['HEAD'], { '--no-images': true, '--labels': ['before', 'after'] });
      expect(await diff.run(args, contextFor(io))).toBe(0);
      expect(io.stdout).toBe(
        'diagc diff before -> after\ngone:\n  - diagram removed: gone\nshop:\n  ~ A -> B (renamed)\n2 diagram(s) changed, 1 unchanged\n',
      );
      expect(io.stderr).toBe(
        '✓ 3 page(s) -> .diagrams/diff/HEAD..working-tree\n' +
          '✓ side by side -> .diagrams/diff/HEAD..working-tree/index.html\n' +
          '✓ for an ADR -> .diagrams/diff/HEAD..working-tree/summary.md\n',
      );
      expect(readdirSync(path.join(dir, '.diagrams', 'diff', 'HEAD..working-tree')).sort()).toEqual([
        'gone.before.html',
        'index.html',
        'shop.after.html',
        'shop.before.html',
        'summary.md',
      ]);
    });
  });

  it('compares the .diagrams of the directory it runs in, below the repository root, and writes its pages there', async () => {
    await inTempDir(async (dir) => {
      const pkg = path.join(dir, 'pkg');
      writeSources(pkg, { shop: diagram('shop') });
      writeSources(dir, { top: diagram('top') });
      commitAll(dir);
      writeSources(pkg, { shop: diagram('shop', { nodes: [{ id: 'a', name: 'B', type: 'service' }] }) });
      process.chdir(pkg);
      const io = captureIo();
      expect(await diff.run(argsOf(['HEAD'], { '--no-images': true }), contextFor(io))).toBe(0);
      expect(io.stdout).toBe(
        'diagc diff HEAD -> working tree\nshop:\n  ~ A -> B (renamed)\n1 diagram(s) changed, 0 unchanged\n',
      );
      expect(io.stderr).toBe(
        '✓ 2 page(s) -> .diagrams/diff/HEAD..working-tree\n' +
          '✓ side by side -> .diagrams/diff/HEAD..working-tree/index.html\n' +
          '✓ for an ADR -> .diagrams/diff/HEAD..working-tree/summary.md\n',
      );
      expect(readdirSync(path.join(pkg, '.diagrams', 'diff', 'HEAD..working-tree')).sort()).toEqual([
        'index.html',
        'shop.after.html',
        'shop.before.html',
        'summary.md',
      ]);
      expect(readdirSync(path.join(dir, '.diagrams'))).toEqual(['src']);
    });
  });

  it('prints only JSON on stdout with --json, and writes into --out', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop: diagram('shop') });
      commitAll(dir);
      writeSources(dir, { shop: diagram('shop', { nodes: [{ id: 'a', name: 'B', type: 'service' }] }) });
      const io = captureIo();
      expect(
        await diff.run(argsOf(['HEAD'], { '--json': true, '--no-images': true, '--out': 'review' }), contextFor(io)),
      ).toBe(0);
      expect(JSON.parse(io.stdout)).toMatchObject({ from: 'HEAD', to: 'working tree', diagrams: [{ name: 'shop' }] });
      expect(io.stderr).toBe(
        '✓ 2 page(s) -> review\n✓ side by side -> review/index.html\n✓ for an ADR -> review/summary.md\n',
      );
    });
  });

  it('says nothing changed on stdout, and writes no pages', async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop: diagram('shop') });
      commitAll(dir);
      const io = captureIo();
      expect(await diff.run(argsOf(['HEAD']), contextFor(io))).toBe(0);
      expect([io.stdout, io.stderr]).toEqual([
        'diagc diff HEAD -> working tree\nno diagram changed (1 compared)\n',
        '',
      ]);
      expect(readdirSync(path.join(dir, '.diagrams'))).toEqual(['src']);
    });
  });

  it('needs a ref, and says so with the usage', async () => {
    const io = captureIo();
    expect(await diff.run(argsOf([], { '--json': true }), contextFor(io))).toBe(1);
    expect([io.stdout, io.stderr]).toEqual([
      '',
      'diagc: diff needs a git ref (diff v1.0) or a range (diff v1.0..v2.0).\nUSAGE\n',
    ]);
  });

  it("puts the range's, git's and the names' errors on stderr, with exit 1", async () => {
    await inTempDir(async (dir) => {
      writeSources(dir, { shop: diagram('shop') });
      const outside = captureIo();
      expect(await diff.run(argsOf(['HEAD']), contextFor(outside))).toBe(1);
      expect([outside.stdout, outside.stderr]).toEqual(['', `diagc: not a git repository (or any parent): ${dir}\n`]);
      commitAll(dir);
      const errors: [string[], string][] = [
        [
          ['HEAD..'],
          "diagc: 'HEAD..' is not a range: write <from>..<to>, or one ref to compare with the working tree\n",
        ],
        [['nope'], "diagc: 'nope' is not a commit, tag or branch in this repository\n"],
        [['HEAD', 'nope', 'shop.diagram.json'], "diagc: no diagram 'nope'\n"],
      ];
      for (const [positionals, stderr] of errors) {
        const io = captureIo();
        expect([positionals, await diff.run(argsOf(positionals), contextFor(io)), io.stdout, io.stderr]).toEqual([
          positionals,
          1,
          '',
          stderr,
        ]);
      }
    });
  });
});
