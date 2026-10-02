import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The file every starter folder holds. One name in both layouts — a checkout's
 * `.diagrams/src/examples/<type>/` and a package's `assets/starters/<type>/` — so
 * one lookup serves both (see home.ts). */
export const STARTER_FILE = 'starter.diagram.ts';

/** The diagram types a starter exists for: each folder under `startersDir` that
 * holds one. In a checkout the folder also carries the realistic examples and a
 * few loose diagrams, which is why this tests for the file and not just the folder. */
export function starterTypes(startersDir: string): string[] {
  if (!existsSync(startersDir)) return [];
  return readdirSync(startersDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(startersDir, e.name, STARTER_FILE)))
    .map((e) => e.name)
    .sort();
}

/** Thrown for a type no starter exists for; `types` is what there is. */
export class UnknownStarterError extends Error {
  constructor(
    type: string,
    readonly types: string[],
  ) {
    super(`No starter '${type}'. Types: ${types.join(', ')}`);
    this.name = 'UnknownStarterError';
  }
}

/** One starter's source, byte for byte. The type is checked against the listing,
 * never joined into a path first, so a type that is itself a path reads nothing. */
export function readStarter(startersDir: string, type: string): string {
  const types = starterTypes(startersDir);
  if (!types.includes(type)) throw new UnknownStarterError(type, types);
  return readFileSync(path.join(startersDir, type, STARTER_FILE), 'utf8');
}
