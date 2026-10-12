import type { DiagramDiff } from './compare';
import { describeDiff } from './describe';
import type { DiagramSet } from './load';

/** What `summary.md` is written from. */
export interface SummaryOptions {
  diffs: readonly DiagramDiff[];
  /** each shown diagram's pages by side, as paths under the output directory without
   * the extension, and whether a PNG was rendered beside each */
  files: Map<string, { before?: string; after?: string; png: boolean }>;
  before: DiagramSet;
  after: DiagramSet;
  /** where the images are served from, as `DiffPagesOptions.imageUrl` */
  imageUrl?: string;
}

export function summaryMarkdown({ diffs, files, before, after, imageUrl }: SummaryOptions): string {
  const from = before.label;
  const to = after.label;
  const png = (rel: string) => (imageUrl !== undefined ? imageUrl.split('{path}').join(`${rel}.png`) : `${rel}.png`);
  const out = [`# Diagram changes: ${from} → ${to}`, ''];
  for (const w of [...before.warnings, ...after.warnings]) out.push(`> ${w}`, '');
  const shown = diffs.filter((d) => d.status !== 'unchanged');
  if (shown.length === 0) out.push('No diagram changed.', '');
  for (const d of shown) {
    out.push(`## ${d.name}`, '');
    if (d.status === 'error') {
      out.push(`Not compared: ${d.error}`, '');
      continue;
    }
    const f = files.get(d.name);
    const cell = (rel: string | undefined, label: string) =>
      rel === undefined ? '—' : f?.png === true ? `![${label}](${png(rel)})` : `[${label}](${rel}.html)`;
    out.push(
      `| Before (${from}) | After (${to}) |`,
      '| --- | --- |',
      `| ${cell(f?.before, 'before')} | ${cell(f?.after, 'after')} |`,
      '',
    );
    for (const l of describeDiff(d)) out.push(`- \`${l[0]}\` ${l.slice(2)}`);
    out.push('');
  }
  return out.join('\n');
}
