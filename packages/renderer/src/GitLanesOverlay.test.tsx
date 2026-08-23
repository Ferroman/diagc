// @vitest-environment jsdom
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { model } from '@diagramming/core';
import { GIT_LAYOUT } from './git-layout';

const rfNodes: { id: string; position: { x: number; y: number }; parentId?: string; measured?: { width: number; height: number } }[] = [];
vi.mock('@xyflow/react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@xyflow/react')>();
  return { ...mod, useNodes: () => rfNodes, ViewportPortal: ({ children }: { children: ReactNode }) => <>{children}</> };
});
const { GitLanesOverlay } = await import('./GitLanesOverlay');

const { LANE, DIAMETER, MARGIN, LABEL_W } = GIT_LAYOUT;

/** master: 1.0 → 2.0 (merges hf); hotfix: hf (from 1.0, merged away) */
function graph() {
  const m = model('g');
  const g = m.gitGraph();
  const master = g.branch('master', { name: 'Master', color: '#7ba7d9' });
  const hotfix = g.branch('hotfix', { name: 'Hotfix', color: '#d9534f' });
  const v10 = master.commit('1.0');
  const hf = hotfix.commit({ from: v10 });
  master.merge(hf, { tag: '2.0' });
  return m.toJSON();
}

const WIDTH = 600;
function seed() {
  rfNodes.length = 0;
  rfNodes.push(
    { id: 'master', position: { x: 0, y: MARGIN }, measured: { width: WIDTH, height: LANE } },
    { id: 'hotfix', position: { x: 0, y: MARGIN + LANE }, measured: { width: WIDTH, height: LANE } },
    { id: 'master-1', parentId: 'master', position: { x: 24, y: 14 }, measured: { width: DIAMETER, height: DIAMETER } },
    { id: 'master-2', parentId: 'master', position: { x: 152, y: 14 }, measured: { width: DIAMETER, height: DIAMETER } },
    { id: 'hotfix-1', parentId: 'hotfix', position: { x: 88, y: 14 }, measured: { width: DIAMETER, height: DIAMETER } },
  );
}

describe('GitLanesOverlay', () => {
  it('draws a tail from a lane\'s rightmost commit to its label box, in the lane colour — but not for a lane merged away', () => {
    seed();
    const m = graph();
    const { container } = render(<GitLanesOverlay model={m} plane="git-graph" />);
    const tails = container.querySelectorAll('line.dg-git-tail');
    expect(tails).toHaveLength(1);
    const t = tails[0]!;
    expect(t.getAttribute('x1')).toBe(String(152 + DIAMETER + 4));
    expect(t.getAttribute('x2')).toBe(String(WIDTH - MARGIN - LABEL_W));
    expect(t.getAttribute('y1')).toBe(String(MARGIN + 14 + DIAMETER / 2));
    expect(t.getAttribute('stroke')).toBe('#7ba7d9');
  });

  it('draws nothing for a lane whose commits are not on screen', () => {
    seed();
    rfNodes.splice(rfNodes.findIndex((n) => n.id === 'master-2'), 1);
    rfNodes.splice(rfNodes.findIndex((n) => n.id === 'master-1'), 1);
    const { container } = render(<GitLanesOverlay model={graph()} plane="git-graph" />);
    expect(container.querySelectorAll('line.dg-git-tail')).toHaveLength(0);
  });
});
