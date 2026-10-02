import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cliVersion, findHome, homePaths } from './home';
import { AGENTS_BEGIN, AGENTS_BLOCK, AGENTS_END, DEFAULT_NAME, IGNORED, diagramName, missingIgnores, runInit, withAgentsBlock, type InitOptions } from './init';
import { readStarter } from './starters';

// Real starters and the real core: the compile step is the point of `init`.
const home = homePaths(findHome(fileURLToPath(import.meta.url)));
const version = cliVersion(home.root);

let cwd: string;
let out: string[];
let err: string[];
const io = { out: (t: string) => void out.push(t), err: (t: string) => void err.push(t) };

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'diagc-init-'));
  out = [];
  err = [];
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

const opts = (over: Partial<InitOptions> = {}): InitOptions => ({
  cwd,
  agents: false,
  startersDir: home.startersDir,
  version,
  coreEntry: home.coreEntry,
  ...over,
});
const read = (rel: string) => readFileSync(path.join(cwd, rel), 'utf8');
const has = (rel: string) => existsSync(path.join(cwd, rel));
/** every path under cwd, for "nothing was written" checks */
const tree = (): string[] => readdirSync(cwd, { recursive: true }).map(String).sort();

describe('runInit, fresh', () => {
  it('writes the basic starter as example, ignores the build output, compiles, and says what is next', async () => {
    expect(await runInit(opts(), io)).toBe(0);
    expect(read(`.diagrams/src/${DEFAULT_NAME}.diagram.ts`)).toBe(readStarter(home.startersDir, 'basic'));
    expect(read('.gitignore')).toBe(`${IGNORED.join('\n')}\n`);
    expect(has(`.diagrams/.artifacts/${DEFAULT_NAME}.diagram.json`)).toBe(true);
    expect(err).toEqual([]);
    const text = out.join('\n');
    expect(text).toMatch(/^✓ \.diagrams\/src\/example\.diagram\.ts\s+\(basic starter\)$/m);
    expect(text).toMatch(/^✓ \.gitignore\s+\(\+ \.diagrams\/\.artifacts\/, \.diagrams\/html\/, \.diagrams\/diff\/\)$/m);
    expect(text).toMatch(/^✓ compiled\s+-> \.diagrams\/\.artifacts\/example\.diagram\.json$/m);
    expect(text).toContain('Next:');
    expect(text).toMatch(/^ {2}diagc studio\s+look at it$/m);
    expect(text).toMatch(/^ {2}diagc guide\s+how to write diagrams/m);
    expect(text).toMatch(/^ {2}diagc init --agents\s+point coding agents/m);
    // no package.json here, so no install hint
    expect(text).not.toContain('@diagc/core');
  });

  it('takes a name and a type, and keeps the starter byte for byte', async () => {
    expect(await runInit(opts({ name: 'shop', type: 'c4' }), io)).toBe(0);
    expect(read('.diagrams/src/shop.diagram.ts')).toBe(readStarter(home.startersDir, 'c4'));
    expect(out.join('\n')).toMatch(/shop\.diagram\.ts\s+\(c4 starter\)/);
  });

  it('accepts a folder in the name and mirrors it in the artifact', async () => {
    expect(await runInit(opts({ name: 'team/app' }), io)).toBe(0);
    expect(has('.diagrams/src/team/app.diagram.ts')).toBe(true);
    expect(out.join('\n')).toMatch(/-> \.diagrams\/\.artifacts\/team\/app\.diagram\.json/);
  });

  it('reads shop.diagram.ts and .diagrams/src/shop as shop', async () => {
    expect(await runInit(opts({ name: '.diagrams/src/shop.diagram.ts' }), io)).toBe(0);
    expect(has('.diagrams/src/shop.diagram.ts')).toBe(true);
    expect(await runInit(opts({ name: '.diagrams/src/shop2' }), io)).toBe(0);
    expect(has('.diagrams/src/shop2.diagram.ts')).toBe(true);
  });

  it('suggests the editor types only where there is a package.json, with this version', async () => {
    writeFileSync(path.join(cwd, 'package.json'), '{}');
    await runInit(opts(), io);
    expect(out.join('\n')).toMatch(new RegExp(`^ {2}npm i -D @diagc/core@${version.replace(/\./g, '\\.')}\\s+editor types for \\.diagram\\.ts$`, 'm'));
  });
});

describe('runInit, again', () => {
  it('skips the starter when there is a diagram and neither name nor type was given', async () => {
    await runInit(opts(), io);
    const before = tree();
    out = [];
    expect(await runInit(opts(), io)).toBe(0);
    expect(tree()).toEqual(before);
    const text = out.join('\n');
    expect(text).toMatch(/^· \.diagrams\/src\s+already has 1 diagram\(s\) — starter skipped$/m);
    expect(text).toMatch(/^· \.gitignore\s+already ignores the build output$/m);
    expect(text).not.toContain('compiled');
    expect(text).toContain('Next:');
  });

  it('still writes a second starter when a name is given', async () => {
    await runInit(opts(), io);
    expect(await runInit(opts({ name: 'shop' }), io)).toBe(0);
    expect(has('.diagrams/src/shop.diagram.ts')).toBe(true);
  });
});

describe('runInit refuses, and writes nothing', () => {
  it('a name that exists, as TypeScript or as JSON', async () => {
    mkdirSync(path.join(cwd, '.diagrams', 'src'), { recursive: true });
    writeFileSync(path.join(cwd, '.diagrams', 'src', 'shop.diagram.json'), '{}');
    const before = tree();
    expect(await runInit(opts({ name: 'shop' }), io)).toBe(1);
    expect(err).toEqual(["diagc: .diagrams/src/shop.diagram.json already exists — pick another name, or run 'diagc init' with no name to leave it alone."]);
    expect(tree()).toEqual(before);
    expect(has('.gitignore')).toBe(false);
  });

  it('a name that exists as TypeScript', async () => {
    mkdirSync(path.join(cwd, '.diagrams', 'src'), { recursive: true });
    writeFileSync(path.join(cwd, '.diagrams', 'src', 'shop.diagram.ts'), 'export default 1;');
    const before = tree();
    expect(await runInit(opts({ name: 'shop' }), io)).toBe(1);
    expect(err[0]).toContain('shop.diagram.ts already exists');
    expect(tree()).toEqual(before);
  });

  it('a trailing slash', async () => {
    expect(await runInit(opts({ name: 'shop/' }), io)).toBe(1);
    expect(err[0]).toMatch(/is not a diagram name/);
    expect(tree()).toEqual([]);
  });

  it('an unknown type even when the default name is taken', async () => {
    await runInit(opts(), io);
    err = [];
    expect(await runInit(opts({ type: 'c5' }), io)).toBe(1);
    expect(err[0]).toMatch(/No starter 'c5'/);
  });

  it('an unknown type, naming the real ones', async () => {
    expect(await runInit(opts({ type: 'c5' }), io)).toBe(1);
    expect(err[0]).toMatch(/^diagc: No starter 'c5'\. Types: activity, basic, c4, .* — e\.g\. diagc init example --type activity$/);
    expect(tree()).toEqual([]);
  });

  it('an unsafe name', async () => {
    expect(await runInit(opts({ name: 'Shop' }), io)).toBe(1);
    expect(err[0]).toMatch(/^diagc: 'Shop' is not a diagram name/);
    expect(tree()).toEqual([]);
  });

  it('an install with no starter files, saying to reinstall', async () => {
    expect(await runInit(opts({ startersDir: path.join(cwd, 'nope') }), io)).toBe(1);
    expect(err[0]).toMatch(/starter files missing from this install .* — reinstall diagc\./);
    expect(tree()).toEqual([]);
  });
});

describe('.gitignore', () => {
  it('adds only the missing lines, after the last line, however it was spelled', async () => {
    writeFileSync(path.join(cwd, '.gitignore'), 'node_modules\n/.diagrams/html\n.diagrams/.artifacts/');
    await runInit(opts(), io);
    expect(read('.gitignore')).toBe('node_modules\n/.diagrams/html\n.diagrams/.artifacts/\n.diagrams/diff/\n');
    expect(out.join('\n')).toMatch(/^✓ \.gitignore\s+\(\+ \.diagrams\/diff\/\)$/m);
  });

  it('missingIgnores compares after trimming and without the slashes', () => {
    expect(missingIgnores('')).toEqual(IGNORED);
    expect(missingIgnores('  .diagrams/html/  \n/.diagrams/diff\n')).toEqual(['.diagrams/.artifacts/']);
    expect(missingIgnores('.diagrams/html/\r\n.diagrams/diff/\r\n.diagrams/.artifacts/\r\n')).toEqual([]);
  });
});

describe('diagramName', () => {
  it('strips the source prefix and the diagram suffix, once', () => {
    expect(diagramName('shop')).toBe('shop');
    expect(diagramName('shop.diagram.ts')).toBe('shop');
    expect(diagramName('.diagrams/src/team/app.diagram.json')).toBe('team/app');
  });
});

describe('runInit, compile failure', () => {
  it('reports compile failed and leaves the written starter', async () => {
    const startersDir = path.join(cwd, 'starters');
    mkdirSync(path.join(startersDir, 'bad'), { recursive: true });
    writeFileSync(path.join(startersDir, 'bad', 'starter.diagram.ts'), 'throw new Error("boom");\n');
    expect(await runInit(opts({ startersDir, type: 'bad' }), io)).toBe(1);
    expect(err[0]).toMatch(/compile failed/);
    expect(has('.diagrams/src/example.diagram.ts')).toBe(true);
  });
});

describe('runInit --agents', () => {
  const count = (text: string, needle: string): number => text.split(needle).length - 1;

  it('creates AGENTS.md when neither file exists, and drops the --agents hint', async () => {
    expect(await runInit(opts({ agents: true }), io)).toBe(0);
    expect(read('AGENTS.md')).toBe(AGENTS_BLOCK);
    expect(has('CLAUDE.md')).toBe(false);
    const text = out.join('\n');
    expect(text).toMatch(/^✓ AGENTS\.md\s+\(diagc block added\)$/m);
    expect(text).not.toContain('diagc init --agents');
  });

  it('appends to the files that exist, both when both do', async () => {
    writeFileSync(path.join(cwd, 'CLAUDE.md'), '# Notes\n\nKeep tests green.');
    writeFileSync(path.join(cwd, 'AGENTS.md'), '# Agents\n');
    await runInit(opts({ agents: true }), io);
    expect(read('CLAUDE.md')).toBe(`# Notes\n\nKeep tests green.\n\n${AGENTS_BLOCK}`);
    expect(read('AGENTS.md')).toBe(`# Agents\n\n${AGENTS_BLOCK}`);
  });

  it('replaces its own block on a second run instead of adding another', async () => {
    writeFileSync(path.join(cwd, 'CLAUDE.md'), `# Notes\n\n${AGENTS_BEGIN}\nold text\n${AGENTS_END}\n\n## After\n`);
    await runInit(opts({ agents: true }), io);
    const text = read('CLAUDE.md');
    expect(text).toBe(`# Notes\n\n${AGENTS_BLOCK}\n## After\n`);
    expect(count(text, AGENTS_BEGIN)).toBe(1);
    expect(out.join('\n')).toMatch(/^✓ CLAUDE\.md\s+\(diagc block refreshed\)$/m);
    out = [];
    await runInit(opts({ agents: true }), io);
    expect(read('CLAUDE.md')).toBe(text);
  });

  it('withAgentsBlock treats a begin marker with no end as no block', () => {
    const r = withAgentsBlock(`${AGENTS_BEGIN}\nhalf\n`);
    expect(r.replaced).toBe(false);
    expect(r.text).toBe(`${AGENTS_BEGIN}\nhalf\n\n${AGENTS_BLOCK}`);
  });

  it('withAgentsBlock separates the block from the text above by one blank line, whatever the ending', () => {
    expect(withAgentsBlock('a').text).toBe(`a\n\n${AGENTS_BLOCK}`);
    expect(withAgentsBlock('a\n').text).toBe(`a\n\n${AGENTS_BLOCK}`);
    expect(withAgentsBlock('a\n\n').text).toBe(`a\n\n${AGENTS_BLOCK}`);
    expect(withAgentsBlock('').text).toBe(AGENTS_BLOCK);
  });

  it('the block names commands, not DSL', () => {
    expect(AGENTS_BLOCK).toContain('diagc guide');
    expect(AGENTS_BLOCK).toContain('diagc lint --json');
    expect(AGENTS_BLOCK).toContain('diagc publish <name>');
    expect(AGENTS_BLOCK).not.toMatch(/m\.node|relate|contains/);
  });
});
