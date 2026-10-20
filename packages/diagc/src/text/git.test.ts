import { describe, expect, it } from 'vitest';
import { compileView, model, type DiagramModel, type ViewNode } from '@diagc/core/internal';
import type { CellPoint } from './canvas';
import { boxText, type BoxText } from './content';
import { withNeverFolds } from './folds';
import { GIT, gitCells } from './git';
import { UNICODE } from './glyphs';
import type { BoxGeometry, GitDrawing, TextLayout } from './layout';
import { cellWidth } from './width';

/** The graph laid out in cells, with what a test needs to find its parts. */
function laid(graph: DiagramModel): TextLayout & { git: GitDrawing; edge: (from: string, to: string) => CellPoint[] } {
  const view = compileView(graph, { plane: graph.planes[0]?.id, pins: withNeverFolds(graph, {}, 'git-graph') });
  const boxes = new Map<string, BoxText>();
  const walk = (vn: ViewNode): void => {
    boxes.set(vn.id, boxText(vn, { inside: 0, glyphs: UNICODE, notation: 'git-graph' }));
    vn.children.forEach(walk);
  };
  view.roots.forEach(walk);
  const layout = gitCells(graph, graph.planes[0]?.id, view, boxes);
  const edge = (from: string, to: string): CellPoint[] => {
    const e = view.edges.find((x) => x.from === from && x.to === to)!;
    return layout.routes.get(e.id)!.points;
  };
  return { ...layout, git: layout.git!, edge };
}

/** main: base → (feature branches off base, two commits) → merge tagged v3.2.0 */
function feature(): DiagramModel {
  const m = model('g');
  const g = m.gitGraph();
  const main = g.branch('main');
  const dark = g.branch('dark-mode');
  const base = main.commit();
  dark.commit({ from: base });
  const latest = dark.commit();
  main.merge(latest, { tag: 'v3.2.0' });
  return m.toJSON();
}

const box = (layout: TextLayout, id: string): BoxGeometry => layout.boxes.get(id)!;
/** the cells a tag takes on its row, as [first, last] */
const span = (git: GitDrawing, id: string): [number, number] => {
  const t = git.tags.get(id)!;
  return [t.x, t.x + cellWidth(t.text) - 1];
};

describe('gitCells', () => {
  it('gives each lane a row of its own, in declaration order, its name past every column', () => {
    const { git } = laid(feature());
    const [main, dark] = [git.names.get('main')!, git.names.get('dark-mode')!];
    expect(dark.y - main.y).toBe(GIT.LANE);
    expect(dark.x).toBe(main.x);
    for (const dot of git.dots.values()) expect(dot.x).toBeLessThan(main.x - 1);
    expect(git.dots.get('main-1')!.y).toBe(main.y);
    expect(git.dots.get('dark-mode-1')!.y).toBe(dark.y);
  });

  it('puts a commit at its column, a pitch after the one before', () => {
    const { git } = laid(feature());
    const x = (id: string): number => git.dots.get(id)!.x;
    expect([
      x('dark-mode-1') - x('main-1'),
      x('dark-mode-2') - x('dark-mode-1'),
      x('main-2') - x('dark-mode-2'),
    ]).toEqual([GIT.PITCH, GIT.PITCH, GIT.PITCH]);
  });

  it('hangs a tag over its commit, centred, on the row above its lane', () => {
    const { git } = laid(feature());
    const [dot, [from, to]] = [git.dots.get('main-2')!, span(git, 'main-2')];
    expect(git.tags.get('main-2')!.y).toBe(dot.y - 1);
    expect(dot.x - from).toBe(to - dot.x + 1); // 'v3.2.0' is six cells: three left of the dot, two right
  });

  it('moves a column right until its tag clears the tag before it on the lane', () => {
    const m = model('g');
    const main = m.gitGraph().branch('main');
    main.commit('candidate-3.2.645 = QA');
    main.commit('bug fix');
    main.commit('build #404');
    const { git } = laid(m.toJSON());
    expect(span(git, 'main-2')[0]).toBe(span(git, 'main-1')[1] + 1 + GIT.TAG_GAP);
    expect(span(git, 'main-3')[0]).toBe(span(git, 'main-2')[1] + 1 + GIT.TAG_GAP);
    expect(span(git, 'main-1')[0]).toBe(0);
  });

  it('routes a branch down from where it leaves and along its lane, a merge along and up before its target', () => {
    const layout = laid(feature());
    const at = (id: string): CellPoint => layout.git.dots.get(id)!;
    const [base, first, latest, merged] = [at('main-1'), at('dark-mode-1'), at('dark-mode-2'), at('main-2')];
    expect(layout.edge('main-1', 'dark-mode-1')).toEqual([base, { x: base.x, y: first.y }, first]);
    expect(layout.edge('dark-mode-1', 'dark-mode-2')).toEqual([first, latest]);
    const climb = merged.x - GIT.PITCH / 2;
    expect(layout.edge('dark-mode-2', 'main-2')).toEqual([
      latest,
      { x: climb, y: latest.y },
      { x: climb, y: merged.y },
      merged,
    ]);
  });

  it("runs a lane's tail from its last commit to its name, but not a lane whose last commit merged away", () => {
    const { git } = laid(feature());
    const main = git.names.get('main')!;
    expect(git.tails).toEqual([{ lane: 'main', y: main.y, from: git.dots.get('main-2')!.x + 1, to: main.x - 2 }]);
  });

  it('frames a stage across every lane, over its columns, and widens it to its title', () => {
    const m = model('g');
    const g = m.gitGraph();
    const main = g.branch('main');
    const dev = g.branch('develop');
    const base = main.commit();
    const hardened = dev.commit({ from: base });
    dev.commit();
    const title = 'Release branch hardened, then deleted';
    g.stage('harden', { name: title, from: hardened });
    const layout = laid(m.toJSON());
    const frame = box(layout, 'harden');
    const dot = layout.git.dots.get('develop-1')!;
    expect(layout.git.stages.get('harden')).toBe(title);
    expect(frame.y).toBe(0);
    expect(frame.y + frame.height - 1).toBeGreaterThan(dot.y);
    expect(layout.git.names.get('main')!.y).toBeGreaterThan(frame.y);
    expect(frame.width).toBeGreaterThanOrEqual(cellWidth(title) + 6);
    expect(frame.x + frame.width / 2).toBe(dot.x);
    // the commits either side stay outside it
    expect(layout.git.dots.get('main-1')!.x).toBeLessThan(frame.x);
    expect(layout.git.dots.get('develop-2')!.x).toBeGreaterThan(frame.x + frame.width - 1);
  });

  it('boxes every commit, tag included, every lane by its name, and every stage by its frame', () => {
    const layout = laid(feature());
    const [dot, tag] = [layout.git.dots.get('main-2')!, layout.git.tags.get('main-2')!];
    expect(box(layout, 'main-2')).toEqual({ x: tag.x, y: tag.y, width: cellWidth(tag.text), height: 2 });
    expect(box(layout, 'main-1')).toEqual({ ...layout.git.dots.get('main-1')!, width: 1, height: 1 });
    expect(dot.y).toBe(tag.y + 1);
    const name = layout.git.names.get('main')!;
    expect(box(layout, 'main')).toEqual({ x: name.x, y: name.y, width: cellWidth(name.text), height: 1 });
  });

  it('puts strays on a row of their own under the lanes, and boxes the rest in a row under that', () => {
    const graph = feature();
    graph.nodes.push({ id: 'loose', name: 'lost', type: 'commit' }, { id: 'note', name: 'Why', type: 'comment' });
    const layout = laid(graph);
    const lastLane = layout.git.names.get('dark-mode')!;
    const stray = layout.git.dots.get('loose')!;
    expect(stray.y).toBe(lastLane.y + GIT.LANE);
    expect(layout.git.tags.get('loose')!.text).toBe('lost');
    expect(box(layout, 'note').y).toBeGreaterThan(stray.y);
  });

  it('measures the picture as everything it holds', () => {
    const layout = laid(feature());
    const name = layout.git.names.get('dark-mode')!;
    expect(layout.width).toBe(name.x + cellWidth(name.text));
    expect(layout.height).toBe(name.y + 1);
  });
});
