import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { guideTopics } from './guide';
import { findHome, homePaths } from './home';
import { AGENTS_BEGIN, AGENTS_END, IGNORED } from './init';

// A test of the skill's TEXT — the file this checkout ships and `diagc init --agents`
// writes into other repositories — as guideContent.test.ts is of the guide's. The
// skill names commands and files, never DSL, so what can drift is what is checked
// here: a command or flag the CLI no longer has, a directory `init` no longer ignores.
const home = homePaths(findHome(fileURLToPath(import.meta.url)));
const skill = readFileSync(home.skillFile, 'utf8');

// Loaded whole every time an agent is asked for a diagram: thin is the point.
const SKILL_MAX_LINES = 40;

const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? '';
const field = (key: string): string => new RegExp(`^${key}: (.+)$`, 'm').exec(frontmatter)?.[1] ?? '';
const codeSpans = [...skill.slice(skill.indexOf(AGENTS_BEGIN)).matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);

describe('skill content', () => {
  it('opens with a name and a description an agent can load', () => {
    // The Agent Skills format: a lowercase hyphenated name of at most 64 characters,
    // a description of at most 1024.
    expect(frontmatter.split('\n').map((l) => l.split(':')[0])).toEqual(['name', 'description']);
    expect(field('name')).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(field('name').length).toBeLessThanOrEqual(64);
    expect(field('description')).not.toBe('');
    expect(field('description').length).toBeLessThanOrEqual(1024);
  });

  it('keeps its description a plain YAML scalar', () => {
    // Unquoted, so `: ` would start a mapping and ` #` a comment: either one cuts
    // the description short for every agent that parses the file.
    expect(field('description')).not.toMatch(/: | #/);
    expect(field('description')).toMatch(/^[A-Za-z]/);
  });

  it('holds everything after the frontmatter between the refresh markers', () => {
    // `init --agents` replaces what is between them on a later run, so text outside
    // them would be written once and never refreshed.
    const block = skill.slice(`---\n${frontmatter}\n---\n\n`.length);
    expect(skill.startsWith(`---\n${frontmatter}\n---\n\n${AGENTS_BEGIN}\n`)).toBe(true);
    expect(block.endsWith(`\n${AGENTS_END}\n`)).toBe(true);
    expect(skill.split(AGENTS_BEGIN).length - 1).toBe(1);
    expect(skill.split(AGENTS_END).length - 1).toBe(1);
  });

  it('stays thin, and leaves the DSL to the guide', () => {
    expect(skill.split('\n').length).toBeLessThanOrEqual(SKILL_MAX_LINES);
    // A listing here would be a second copy of the guide, and this one is not compiled.
    expect(skill).not.toMatch(/^```/m);
    expect(skill).not.toMatch(/m\.node|relate\(|contains\(/);
    expect(skill).toContain('diagc guide');
  });

  it('names only commands and flags the CLI has', () => {
    const help = execFileSync(process.execPath, [path.join(home.root, 'bin', 'diagc.mjs'), '--help'], { encoding: 'utf8', cwd: tmpdir() });
    const commands = /^Usage: diagc <([a-z|]+)>/m.exec(help)?.[1]?.split('|') ?? [];
    const calls = codeSpans.filter((s) => s.startsWith('diagc '));
    for (const call of calls) {
      const [, command, ...rest] = call.split(' ');
      expect(commands, call).toContain(command);
      for (const flag of rest.filter((w) => w.startsWith('--'))) expect(help, call).toContain(flag);
    }
    // the loop it is there to teach
    expect(calls).toEqual(expect.arrayContaining(['diagc guide', 'diagc lint --json', 'diagc publish <name>']));
  }, 30_000);

  it('gives real topics as its examples', () => {
    // `diagc guide C4` is an unknown topic: an example is an id the command takes.
    const line = skill.split('\n').find((l) => l.includes('`diagc guide <topic>`')) ?? '';
    const examples = [...line.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!).filter((s) => !s.startsWith('diagc'));
    expect(examples.length).toBeGreaterThan(0);
    for (const topic of examples) expect(guideTopics(home.guideDir), topic).toContain(topic);
  });

  it('says to commit the sources and the images, and calls build output exactly what init ignores', () => {
    const spans = (text: string | undefined): string[] => [...(text ?? '').matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);
    const rule = /^- Commit (.+?)\. (.+?) are build output\.$/m.exec(skill);
    expect(spans(rule?.[1])).toEqual(['.diagrams/src/', '.diagrams/static/']);
    expect(spans(rule?.[2]).sort()).toEqual([...IGNORED].sort());
    // and nowhere else names a directory of its own
    const dirs = [...new Set(codeSpans.filter((s) => /^\.diagrams\/[^<*]*\/$/.test(s)))];
    expect(dirs.sort()).toEqual([...IGNORED, '.diagrams/src/', '.diagrams/static/'].sort());
  });
});
