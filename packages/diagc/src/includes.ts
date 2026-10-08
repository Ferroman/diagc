import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DiagramModel, IncludeSource } from '@diagc/core/internal';

const isHttp = (s: string): boolean => /^https?:\/\//.test(s);

export const AUTH_TOKENS_ENV = 'DIAGC_AUTH_TOKENS';

/**
 * Credentials for private include hosts, in Deno's `DENO_AUTH_TOKENS` format:
 * `;`-separated `token@host` (sent as a bearer token) or `user:pass@host`
 * (basic auth), the host with its port when it has one. Keyed by `URL.host`,
 * so a credential only ever reaches the host it names. Malformed entries are
 * skipped rather than failing a compile that may not need them.
 */
export function parseAuthTokens(raw: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of (raw ?? '').split(';').map((e) => e.trim())) {
    const at = entry.lastIndexOf('@');
    if (at <= 0) continue;
    const secret = entry.slice(0, at);
    const host = entry.slice(at + 1).toLowerCase();
    if (host === '') continue;
    out.set(host, secret.includes(':') ? `Basic ${Buffer.from(secret).toString('base64')}` : `Bearer ${secret}`);
  }
  return out;
}

/** The Authorization header for `url`, if one is configured for its host. Only
 * over https: a token sent over plain http is a token handed to the network. */
function authFor(url: URL): string | undefined {
  if (url.protocol !== 'https:') return undefined;
  return parseAuthTokens(process.env[AUTH_TOKENS_ENV]).get(url.host);
}

/** diagc's include IO: http(s) URLs via fetch, everything else via the
 * filesystem relative to the declaring file. Returns the canonical resolved
 * ref so compose can detect cycles across mixed URL/path chains. */
export async function resolveInclude(spec: string, fromRef: string): Promise<IncludeSource> {
  if (isHttp(spec) || isHttp(fromRef)) {
    const url = isHttp(spec) ? spec : new URL(spec, fromRef).href;
    const auth = authFor(new URL(url));
    // fetch drops Authorization on a cross-origin redirect, so a raw host that
    // bounces to a CDN does not take the token with it
    const res = await fetch(url, auth !== undefined ? { headers: { authorization: auth } } : undefined);
    if (!res.ok) {
      // private hosts answer 404 as often as 401/403, so hint on all three
      const hint =
        auth === undefined && [401, 403, 404].includes(res.status)
          ? ` — if the host is private, set ${AUTH_TOKENS_ENV}=<token>@${new URL(url).host}`
          : '';
      throw new Error(`HTTP ${res.status} fetching ${url}${hint}`);
    }
    return { model: (await res.json()) as DiagramModel, ref: url };
  }
  const file = path.resolve(path.dirname(fromRef), spec);
  return { model: JSON.parse(await readFile(file, 'utf8')) as DiagramModel, ref: file };
}
