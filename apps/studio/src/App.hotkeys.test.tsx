// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagramModel, LayoutOverlay } from '@diagc/core/internal';
import type { DiagramView } from '@diagc/renderer';
import type { Handlers } from './hotkeys/useHotkeys';
import { App } from './App';

// Which keyboard actions App hands the hotkeys dispatcher in each state, and what
// a few of them do. The rule they keep: a handler is present exactly while its
// button would be shown and enabled. Each case names the change that would break it.

const viewCapture = vi.hoisted(() => ({ props: null as Parameters<typeof DiagramView>[0] | null }));
vi.mock('@diagc/renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@diagc/renderer')>();
  const Actual = actual.DiagramView;
  function CapturingDiagramView(props: Parameters<typeof DiagramView>[0]) {
    viewCapture.props = props;
    return <Actual {...props} />;
  }
  return { ...actual, DiagramView: CapturingDiagramView };
});

// The handlers ref App passes the dispatcher, read the way the listener reads it.
const hotkeys = vi.hoisted(() => ({ ref: null as { current: Handlers } | null }));
vi.mock('./hotkeys/useHotkeys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hotkeys/useHotkeys')>();
  return {
    ...actual,
    useHotkeys: (options: Parameters<typeof actual.useHotkeys>[0]) => {
      hotkeys.ref = options.handlersRef as { current: Handlers };
      actual.useHotkeys(options);
    },
  };
});

const diagram = (rest: Partial<DiagramModel> = {}): DiagramModel => ({
  version: 1,
  id: 'sketch',
  name: 'sketch',
  nodes: [
    { id: 'sys', name: 'sys' },
    { id: 'a', name: 'a' },
    { id: 'b', name: 'b' },
  ],
  containment: [{ parent: 'sys', child: 'a' }],
  relations: [],
  layers: [],
  planes: [],
  ...rest,
});

const serve = (model: DiagramModel, { editable = true, layout }: { editable?: boolean; layout?: LayoutOverlay } = {}) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const get = init?.method === undefined || init.method === 'GET';
      if (url === '/api/diagrams')
        return new Response(JSON.stringify({ diagrams: [{ name: 'sketch', model, issues: [], editable }] }));
      if (url === '/api/layouts')
        return new Response(JSON.stringify({ layouts: layout !== undefined ? { sketch: layout } : {} }));
      if (url === '/api/drawings') return new Response(JSON.stringify({ drawings: {} }));
      if (url === '/api/diagrams/sketch' && get)
        return new Response(JSON.stringify({ model, ...(layout !== undefined ? { layout } : {}) }));
      return new Response(JSON.stringify({ ok: true }));
    }),
  );

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  viewCapture.props = null;
  hotkeys.ref = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mountView = async (model: DiagramModel, options?: Parameters<typeof serve>[1]) => {
  serve(model, options);
  render(<App />);
  await screen.findByRole('heading', { name: /layers & planes/i });
};
const enterEdit = async () => {
  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
  await screen.findByRole('button', { name: 'Done' });
};

/** the actions with a handler right now, sorted */
const present = () =>
  Object.entries(hotkeys.ref?.current ?? {})
    .filter(([, handler]) => handler !== undefined)
    .map(([id]) => id)
    .sort();
const run = (id: keyof Handlers) => {
  let result: boolean | void = undefined;
  act(() => {
    result = hotkeys.ref!.current[id]!();
  });
  return result;
};

const CANVAS = [
  'canvas.dim',
  'canvas.drawings',
  'canvas.fit',
  'canvas.laser',
  'canvas.legend',
  'canvas.loops',
  'canvas.zoom-in',
  'canvas.zoom-out',
];
const ARRANGE = [
  'arrange.align-bottom',
  'arrange.align-center',
  'arrange.align-left',
  'arrange.align-middle',
  'arrange.align-right',
  'arrange.align-top',
  'arrange.distribute-x',
  'arrange.distribute-y',
];
const WINDOW = ['window.hotkeys', 'window.left-dock', 'window.right-dock', 'window.snap', 'window.theme'];
const sorted = (...groups: string[][]) => groups.flat().sort();

describe('the hotkey handlers App offers', () => {
  it('in view mode on an editable diagram', async () => {
    // Breaks if a view-mode action loses or gains its gate: the diagram actions
    // need a design API and an owned diagram, Freeze needs the top level.
    await mountView(diagram());
    expect(present()).toEqual(
      sorted(
        [
          'diagram.duplicate',
          'diagram.eject',
          'diagram.new',
          'diagram.picker',
          'diagram.rename',
          'diagram.toggle-edit',
          'view.freeze',
        ],
        CANVAS,
        ARRANGE,
        WINDOW,
      ),
    );
  });

  it('in view mode on a diagram compiled from TypeScript', async () => {
    // Breaks if Edit, Rename or Eject are offered on a diagram with no source here.
    await mountView(diagram(), { editable: false });
    expect(present()).toEqual(
      sorted(['diagram.duplicate', 'diagram.new', 'diagram.picker', 'view.freeze'], CANVAS, ARRANGE, WINDOW),
    );
  });

  it('in edit mode, and the pen widths while the pen is out', async () => {
    // Breaks if an edit action loses its edit gate, the view actions stay in
    // edit mode, or the pen widths are offered without the pen.
    await mountView(diagram());
    await enterEdit();
    const editing = [
      'diagram.new',
      'diagram.picker',
      'diagram.toggle-edit',
      'edit.add-child',
      'edit.add-node',
      'edit.redo',
      'edit.relayout',
      'edit.save',
      'edit.toggle-auto-layout',
      'edit.undo',
      'tool.eraser',
      'tool.pen',
      'tool.select',
      'window.inspector-library',
      'window.inspector-properties',
    ];
    expect(present()).toEqual(sorted(editing, CANVAS, ARRANGE, WINDOW));
    run('tool.pen');
    await waitFor(() => expect(present()).toContain('pen.thin'));
    expect(present()).toEqual(sorted(editing, ['pen.medium', 'pen.thick', 'pen.thin'], CANVAS, ARRANGE, WINDOW));
    run('pen.thick');
    await waitFor(() => expect(viewCapture.props!.pen?.width).toBe(6));
  });

  it('Group only with two or more nodes selected on the canvas', async () => {
    // Breaks if edit.group loses its multi-selection gate.
    await mountView(diagram());
    await enterEdit();
    expect(present()).not.toContain('edit.group');
    act(() => viewCapture.props!.onMultiSelect?.(['a', 'b']));
    await waitFor(() => expect(present()).toContain('edit.group'));
  });

  it('no Freeze while drilled into a container, and the pen answers that it did nothing', async () => {
    // Breaks if Freeze is offered on a drilled view, which holds only part of
    // the plane, or the pen key takes the pen there.
    window.location.hash = '#/sketch/sys';
    await mountView(diagram());
    await waitFor(() => expect(viewCapture.props!.enteredPath).toEqual(['sys']));
    expect(present()).not.toContain('view.freeze');
    await enterEdit();
    expect(run('tool.pen')).toBe(false);
    expect(viewCapture.props!.tool).toBe('select');
  });

  it('Save positions while there are moves to save, and it posts them', async () => {
    // Breaks if view.save-positions loses its unsaved-view gate or stops saving.
    await mountView(diagram());
    expect(present()).not.toContain('view.save-positions');
    act(() => viewCapture.props!.onViewPositionsChange?.({ b: { x: 40, y: 50 } }));
    await waitFor(() => expect(present()).toContain('view.save-positions'));
    run('view.save-positions');
    await waitFor(() =>
      expect(
        (fetch as ReturnType<typeof vi.fn>).mock.calls.some(
          ([url, init]) => url === '/api/layouts/sketch' && (init as RequestInit | undefined)?.method === 'POST',
        ),
      ).toBe(true),
    );
  });

  it('Auto-arrange where the plane has saved positions, toggling what the canvas ignores', async () => {
    // Breaks if view.auto-arrange loses its saved-positions gate or stops toggling.
    await mountView(diagram(), { layout: { version: 1, planes: { default: { a: { x: 1, y: 2 } } } } });
    expect(present()).toContain('view.auto-arrange');
    run('view.auto-arrange');
    await waitFor(() => expect(viewCapture.props!.ignoreSavedPositions).toBe(true));
  });

  it('the auto-layout toggle freezes the plane through the session', async () => {
    // Breaks if edit.toggle-auto-layout stops setting the manual flag through the session.
    await mountView(diagram());
    await enterEdit();
    run('edit.toggle-auto-layout');
    await waitFor(() => expect(viewCapture.props!.layout?.manual).toEqual({ default: true }));
  });

  it('the canvas commands report that nothing ran while the canvas has not handed them over', async () => {
    // Breaks if a canvas command stops returning the canvas's answer (the dispatcher
    // swallows a key only when a handler claims it).
    await mountView(diagram());
    await waitFor(() => expect(typeof run('canvas.fit')).toBe('boolean'));
  });
});
