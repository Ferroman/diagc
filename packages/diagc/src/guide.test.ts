import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NODE_TYPES } from '@diagc/core/internal';
import {
  GuideMissingError,
  TOPIC_TYPE_PREFIXES,
  UnknownTopicError,
  guideTopics,
  renderGuide,
  runGuide,
  type GuideContext,
} from './guide';

let tmp: string;
let ctx: GuideContext;

function page(name: string, md: string): void {
  writeFileSync(path.join(ctx.guideDir, `${name}.md`), md);
}
function starter(type: string, src: string): void {
  mkdirSync(path.join(ctx.startersDir, type), { recursive: true });
  writeFileSync(path.join(ctx.startersDir, type, 'starter.diagram.ts'), src);
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'diagc-guide-'));
  ctx = { guideDir: path.join(tmp, 'guide'), startersDir: path.join(tmp, 'starters'), version: '1.2.3' };
  mkdirSync(ctx.guideDir);
  mkdirSync(ctx.startersDir);
  page('index', '# Guide\n');
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('guideTopics', () => {
  it('lists the topic files, sorted, without the index', () => {
    page('er', '# ER\n');
    page('c4', '# C4\n');
    writeFileSync(path.join(ctx.guideDir, 'notes.txt'), 'not a page');
    expect(guideTopics(ctx.guideDir)).toEqual(['c4', 'er']);
  });

  it('says to reinstall when the guide files are gone', () => {
    rmSync(ctx.guideDir, { recursive: true });
    expect(() => guideTopics(ctx.guideDir)).toThrowError(GuideMissingError);
    expect(() => guideTopics(ctx.guideDir)).toThrow(/reinstall diagc/);
  });
});

describe('renderGuide', () => {
  it('prints the index when no topic is given, without a trailing newline', () => {
    page('index', '# Guide\n\nFor diagc {{version}}.\n\n');
    expect(renderGuide(undefined, ctx)).toBe('# Guide\n\nFor diagc 1.2.3.');
  });

  it('fences a named starter in the index', () => {
    starter('basic', "export default 'b';\n");
    page('index', 'Start:\n\n{{starter:basic}}\n');
    expect(renderGuide(undefined, ctx)).toBe("Start:\n\n```ts\nexport default 'b';\n```");
  });

  it('gives a topic its own starter for a bare {{starter}}', () => {
    starter('c4', "export default 'c';\n\n\n");
    page('c4', '# C4\n\n{{starter}}\n');
    expect(renderGuide('c4', ctx)).toBe("# C4\n\n```ts\nexport default 'c';\n```");
  });

  it('refuses a bare {{starter}} in the index, naming the file', () => {
    page('index', '{{starter}}\n');
    expect(() => renderGuide(undefined, ctx)).toThrow(/index\.md: \{\{starter\}\} needs a type/);
  });

  it('inserts a starter byte for byte, without expanding what is in it', () => {
    // A replacement string would treat `$&` as "the match" and a second pass
    // would expand the placeholder; neither may happen to a user's source.
    const src = "// {{version}} costs $& and $1\nexport default 'x';";
    starter('basic', `${src}\n`);
    page('index', '{{starter:basic}}\n');
    expect(renderGuide(undefined, ctx)).toBe('```ts\n' + src + '\n```');
  });

  it('lists the node types no topic owns in the index', () => {
    page('index', '{{node-types}}\n');
    const out = renderGuide(undefined, ctx);
    expect(out).toContain('`service`');
    expect(out).toContain('`aws-vpc`');
    expect(out).not.toContain('c4-');
    expect(out).not.toContain('deploy-');
    expect(out).not.toContain('`db-table`');
  });

  it("lists a topic's own node types, from its prefix and from its notation", () => {
    page('c4', '# C4\n\n{{node-types}}\n');
    page('git-graph', '# Git graph\n\n{{node-types}}\n');
    const c4 = renderGuide('c4', ctx);
    expect(c4).toContain('`c4-person`');
    expect(c4).not.toContain('`service`');
    expect(renderGuide('git-graph', ctx)).toBe('# Git graph\n\n`commit`, `branch`, `git-stage`');
  });

  it('refuses {{node-types}} in a topic that has none', () => {
    page('causal-loop', '# Causal loop\n\n{{node-types}}\n');
    expect(() => renderGuide('causal-loop', ctx)).toThrow(/causal-loop\.md: \{\{node-types\}\} is empty/);
  });

  it("lists the relation kinds, with a topic's notation's own added once", () => {
    page('index', '{{relation-kinds}}\n');
    page('git-graph', '# Git graph\n\n{{relation-kinds}}\n');
    expect(renderGuide(undefined, ctx)).toContain('`sync`');
    expect(renderGuide(undefined, ctx)).not.toContain('`merge`');
    const git = renderGuide('git-graph', ctx);
    expect(git).toContain('`merge`');
    expect(git.match(/`sync`/g)).toHaveLength(1);
  });

  it('lists the topics by command and title', () => {
    page('index', '{{topics}}\n');
    page('er', '# ER\n\nTables.\n');
    page('c4', '# C4\n\nSystems.\n');
    expect(renderGuide(undefined, ctx)).toBe('- `diagc guide c4` — C4\n- `diagc guide er` — ER');
  });

  it('refuses a topic file with no title, naming it', () => {
    page('index', '{{topics}}\n');
    page('er', 'Tables.\n');
    expect(() => renderGuide(undefined, ctx)).toThrow(/er\.md: a topic starts with a '# Title' line/);
  });

  it('refuses an unknown placeholder, naming the file', () => {
    page('index', 'Hello {{nope}}\n');
    expect(() => renderGuide(undefined, ctx)).toThrow(/index\.md: unknown placeholder \{\{nope\}\}/);
  });

  it('leaves braces that are not a placeholder alone', () => {
    page('index', 'const o = {{ a: 1 }}; ${{ github.ref }}\n');
    expect(renderGuide(undefined, ctx)).toBe('const o = {{ a: 1 }}; ${{ github.ref }}');
  });

  it('prints the index and then every topic for `all`', () => {
    page('index', '# Guide\n');
    page('er', '# ER\n');
    page('c4', '# C4\n');
    expect(renderGuide('all', ctx)).toBe('# Guide\n\n---\n\n# C4\n\n---\n\n# ER');
  });

  it('refuses an unknown topic and lists the real ones', () => {
    page('c4', '# C4\n');
    expect(() => renderGuide('c5', ctx)).toThrowError(UnknownTopicError);
    expect(() => renderGuide('c5', ctx)).toThrow("No guide topic 'c5'. Topics: all, c4");
  });

  it('refuses a topic that is a path, and the index by name', () => {
    page('c4', '# C4\n');
    writeFileSync(path.join(tmp, 'secret.md'), '# Secret\n');
    for (const t of ['index', '../secret', 'c4/../index', './c4', '']) {
      expect(() => renderGuide(t, ctx), t).toThrowError(UnknownTopicError);
    }
  });
});

describe('TOPIC_TYPE_PREFIXES', () => {
  it('matches at least one known type per prefix', () => {
    // A prefix that matches nothing means core renamed a family of types and
    // that topic's list silently went empty.
    for (const [topic, prefixes] of Object.entries(TOPIC_TYPE_PREFIXES)) {
      for (const p of prefixes) {
        expect(
          NODE_TYPES.some((t) => t.startsWith(p)),
          `${topic}: '${p}'`,
        ).toBe(true);
      }
    }
  });
});

describe('runGuide', () => {
  const capture = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (t: string) => void out.push(t), err: (t: string) => void err.push(t) } };
  };

  it('prints the page and returns 0', () => {
    const c = capture();
    expect(runGuide([], ctx, c.io)).toBe(0);
    expect(c.out).toEqual(['# Guide']);
    expect(c.err).toEqual([]);
  });

  it('prints one topic', () => {
    page('c4', '# C4\n');
    const c = capture();
    expect(runGuide(['c4'], ctx, c.io)).toBe(0);
    expect(c.out).toEqual(['# C4']);
  });

  it('reports an unknown topic on stderr and returns 1', () => {
    const c = capture();
    expect(runGuide(['nope'], ctx, c.io)).toBe(1);
    expect(c.out).toEqual([]);
    expect(c.err).toEqual(["diagc: No guide topic 'nope'. Topics: all"]);
  });

  it('refuses more than one topic', () => {
    page('c4', '# C4\n');
    page('er', '# ER\n');
    const c = capture();
    expect(runGuide(['c4', 'er'], ctx, c.io)).toBe(1);
    expect(c.out).toEqual([]);
    expect(c.err[0]).toMatch(/guide takes one topic, got 2/);
  });

  it('reports a damaged install and returns 1', () => {
    rmSync(ctx.guideDir, { recursive: true });
    const c = capture();
    expect(runGuide([], ctx, c.io)).toBe(1);
    expect(c.err[0]).toMatch(/reinstall diagc/);
  });

  it('reports missing starter files as a damaged install and returns 1', () => {
    rmSync(ctx.startersDir, { recursive: true });
    page('index', '{{starter:basic}}\n');
    const c = capture();
    expect(runGuide([], ctx, c.io)).toBe(1);
    expect(c.out).toEqual([]);
    expect(c.err[0]).toMatch(/starter files missing.*reinstall diagc/);
  });
});
