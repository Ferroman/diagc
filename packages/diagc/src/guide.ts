import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NODE_TYPES, NOTATION_NODE_TYPES, NOTATION_RELATION_KINDS, RELATION_KINDS } from '@diagc/core/internal';
import { UnknownStarterError, readStarter } from './starters';

/** Where `diagc guide` reads from, and the release it speaks for. */
export interface GuideContext {
  guideDir: string;
  startersDir: string;
  version: string;
}

const INDEX = 'index';
/** `diagc guide all`: the index, then every topic — for a reader who cannot ask
 * for one (the copy published on the website). */
export const ALL_TOPIC = 'all';

/**
 * Which node types a topic owns. Core's `NODE_TYPES` is one flat list — it only
 * feeds the lint — so a diagram type's own ids are recognised by their prefix.
 * The index prints whatever no topic claims. A test holds each prefix to at
 * least one real type, so a renamed family cannot quietly empty a topic's list.
 */
export const TOPIC_TYPE_PREFIXES: Record<string, readonly string[]> = {
  c4: ['c4-'],
  activity: ['activity-'],
  'second-order': ['so-'],
  fishbone: ['fb-'],
  deployment: ['deploy-'],
  'threat-model': ['tm-'],
  plan: ['plan-'],
  er: ['db-table'],
};

/** Thrown for a topic there is no page for; the message lists what there is. */
export class UnknownTopicError extends Error {
  constructor(topic: string, topics: string[]) {
    super(`No guide topic '${topic}'. Topics: ${[ALL_TOPIC, ...topics].join(', ')}`);
    this.name = 'UnknownTopicError';
  }
}

/** Thrown when the guide's own files are not where the install says they are. */
export class GuideMissingError extends Error {
  constructor(guideDir: string) {
    super(`guide files missing from this install (${guideDir}) — reinstall diagc.`);
    this.name = 'GuideMissingError';
  }
}

/** The topics a guide directory holds: every page but the index, sorted. */
export function guideTopics(guideDir: string): string[] {
  if (!existsSync(path.join(guideDir, `${INDEX}.md`))) throw new GuideMissingError(guideDir);
  return readdirSync(guideDir)
    .filter((f) => f.endsWith('.md') && f !== `${INDEX}.md`)
    .map((f) => f.slice(0, -'.md'.length))
    .sort();
}

const codeList = (ids: readonly string[]): string => ids.map((id) => `\`${id}\``).join(', ');
const fence = (src: string): string => '```ts\n' + src.trimEnd() + '\n```';

/** What a notation adds to a shared list, for a page named after that notation. */
function notationOwn(map: Partial<Record<string, readonly string[]>>, page: string): readonly string[] {
  return map[page] ?? [];
}

function nodeTypesFor(page: string): string[] {
  if (page === INDEX) {
    const claimed = Object.values(TOPIC_TYPE_PREFIXES).flat();
    return NODE_TYPES.filter((t) => !claimed.some((p) => t.startsWith(p)));
  }
  const own = TOPIC_TYPE_PREFIXES[page] ?? [];
  return [...NODE_TYPES.filter((t) => own.some((p) => t.startsWith(p))), ...notationOwn(NOTATION_NODE_TYPES, page)];
}

function relationKindsFor(page: string): string[] {
  return [...new Set([...RELATION_KINDS, ...notationOwn(NOTATION_RELATION_KINDS, page)])];
}

/** One bullet per topic: the command that prints it, and its own title. */
function topicList(guideDir: string): string {
  return guideTopics(guideDir)
    .map((topic) => {
      const file = path.join(guideDir, `${topic}.md`);
      const title = /^# (.+)$/m.exec(readFileSync(file, 'utf8'))?.[1];
      if (title === undefined) throw new Error(`${file}: a topic starts with a '# Title' line`);
      return `- \`diagc guide ${topic}\` — ${title.trim()}`;
    })
    .join('\n');
}

/** One page with its placeholders filled. The replacer is a function, so what it
 * returns is taken literally: a starter holding `$&` or a `{{…}}` of its own is
 * printed as written. */
function renderPage(page: string, ctx: GuideContext): string {
  const file = path.join(ctx.guideDir, `${page}.md`);
  return readFileSync(file, 'utf8')
    .replace(/\{\{([a-z-]+)(?::([a-z0-9-]+))?\}\}/g, (whole: string, name: string, arg: string | undefined) => {
      switch (name) {
        case 'starter': {
          const type = arg ?? (page === INDEX ? undefined : page);
          if (type === undefined) throw new Error(`${file}: {{starter}} needs a type here — write {{starter:basic}}`);
          return fence(readStarter(ctx.startersDir, type));
        }
        case 'node-types': {
          const ids = nodeTypesFor(page);
          if (ids.length === 0)
            throw new Error(
              `${file}: {{node-types}} is empty for '${page}' — this diagram type has no node types of its own`,
            );
          return codeList(ids);
        }
        case 'relation-kinds':
          return codeList(relationKindsFor(page));
        case 'topics':
          return topicList(ctx.guideDir);
        case 'version':
          return ctx.version;
        default:
          throw new Error(`${file}: unknown placeholder ${whole}`);
      }
    })
    .trimEnd();
}

/** The guide as Markdown: the index, one topic, or (`all`) everything. A topic is
 * looked up in the listing and never joined into a path first, so `../x` is an
 * unknown topic like any other. */
export function renderGuide(topic: string | undefined, ctx: GuideContext): string {
  const topics = guideTopics(ctx.guideDir);
  if (topic === undefined) return renderPage(INDEX, ctx);
  if (topic === ALL_TOPIC) return [INDEX, ...topics].map((p) => renderPage(p, ctx)).join('\n\n---\n\n');
  if (!topics.includes(topic)) throw new UnknownTopicError(topic, topics);
  return renderPage(topic, ctx);
}

export interface GuideIo {
  out(text: string): void;
  err(text: string): void;
}

const stdio: GuideIo = {
  out: (text) => void process.stdout.write(`${text}\n`),
  err: (text) => console.error(text),
};

/** `diagc guide [topic]`: print, and return the exit code. The errors a user can
 * cause or meet — a topic that does not exist, an install with no guide, an
 * install with no starter files — are one line on stderr; anything else is a bug
 * in the guide's own files and is left to throw. */
export function runGuide(topics: readonly string[], ctx: GuideContext, io: GuideIo = stdio): number {
  if (topics.length > 1) {
    io.err(
      `diagc: guide takes one topic, got ${topics.length} — run it once per topic, or 'diagc guide ${ALL_TOPIC}'.`,
    );
    return 1;
  }
  try {
    io.out(renderGuide(topics[0], ctx));
    return 0;
  } catch (e) {
    if (e instanceof UnknownTopicError || e instanceof GuideMissingError) {
      io.err(`diagc: ${e.message}`);
      return 1;
    }
    // No starter type at all means the starters directory is gone, not that the
    // guide names a misspelt one: that case has a non-empty list and stays a bug.
    if (e instanceof UnknownStarterError && e.types.length === 0) {
      io.err(`diagc: starter files missing from this install (${ctx.startersDir}) — reinstall diagc.`);
      return 1;
    }
    throw e;
  }
}
