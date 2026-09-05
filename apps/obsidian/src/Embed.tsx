import { useEffect, useState } from 'react';
import { errMessage, type DiagramModel, type Drawings, type LayoutOverlay } from '@diagramming/core';
import { applyTheme, DiagramView, lightTheme } from '@diagramming/renderer';
import { createIconRegistry } from '@diagramming/icons';
import type { HostAdapter } from '@diagramming/studio/src/host';
import type { EmbedSpec } from './fence';

const icons = createIconRegistry();

/** the shape `GET /api/diagrams/<name>` answers with (readDiagram in
 * packages/diagc/src/api/handlers.ts) */
interface EmbedResponse {
  model: DiagramModel;
  layout?: LayoutOverlay;
  drawings?: Drawings;
}

type EmbedState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: EmbedResponse };

export interface EmbedProps {
  spec: EmbedSpec;
  apiFetch: HostAdapter['apiFetch'];
  /** a linked node's badge was clicked — host resolves it (wikilink vs URL) */
  openLink: (link: string) => void;
  assetBase: string;
  libraryBase: string;
  /** the corner "Open in studio" button was clicked */
  onOpenStudio: () => void;
}

/**
 * A `diagram` code fence, rendered read-only. Mounts DiagramView the way
 * apps/viewer/src/Viewer.tsx's interactive (non-export) page does — local pins
 * and layer-toggle state the reader owns for as long as the note is open, never
 * persisted — plus a corner button to jump into the full studio for editing.
 *
 * Deliberately imports nothing from 'obsidian': the `obsidian` package ships
 * types only (`package.json` `"main": ""`), so any module reachable from a
 * vitest import graph that pulled it in would fail to resolve at test time.
 * Every host-specific capability (apiFetch, link opening, asset/library
 * bases) arrives as a prop instead — see embed-child.tsx for where those come
 * from — which is what keeps this component unit-testable under jsdom.
 */
export function Embed({ spec, apiFetch, openLink, assetBase, libraryBase, onOpenStudio }: EmbedProps) {
  const [state, setState] = useState<EmbedState>({ status: 'loading' });

  // The embed renders in light mode (colorMode="light" below); publish the
  // light theme's --dg-* tokens so node strokes/fills and the dashed
  // group-container borders resolve. Without this every embed loses those
  // variables (React Flow's colorMode themes React Flow itself, not our
  // tokens) unless the studio pane happened to run first in this session and
  // set them — see apps/viewer/src/Viewer.tsx's identical effect, which hits
  // the same gap for the published page.
  useEffect(() => {
    applyTheme(document.documentElement, lightTheme);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const res = await apiFetch(`/api/diagrams/${encodeURIComponent(spec.name)}`);
        const body = (await res.json().catch(() => null)) as
          | ({ issues?: { message: string }[] } & Partial<EmbedResponse>)
          | null;
        if (!res.ok) {
          throw new Error(body?.issues?.[0]?.message ?? `Failed to load '${spec.name}' (${res.status})`);
        }
        if (body?.model === undefined) throw new Error(`Malformed response for '${spec.name}'`);
        if (!cancelled) setState({ status: 'loaded', data: body as EmbedResponse });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: errMessage(e) });
      }
    })();
    // A stale response for a fence whose `name:` just changed must never
    // clobber the state of the (now different) diagram already loading.
    return () => {
      cancelled = true;
    };
  }, [apiFetch, spec.name]);

  // Same shape as Viewer.tsx's interactive page: folded by default, owned by
  // the reader, never written back — an embed is a read-only window.
  const [pins, setPins] = useState<Record<string, 'expanded' | 'collapsed'>>({});
  const togglePin = (id: string) =>
    setPins((p) => ({ ...p, [id]: p[id] === 'expanded' ? 'collapsed' : 'expanded' }));
  // Seeded from the fence's `layers:` line, then owned by the reader from
  // there — a fence's layers are a default, not a floor (mirrors Viewer.tsx).
  const [activeLayers, setActiveLayers] = useState<string[]>(spec.layers ?? []);
  const toggleLayer = (id: string) =>
    setActiveLayers((ls) => (ls.includes(id) ? ls.filter((l) => l !== id) : [...ls, id]));
  // `root:` opens the embed already drilled into that node, matching a deep
  // link; omitted entirely opens at the bird's-eye (DiagramView's default).
  const [enteredPath, setEnteredPath] = useState<string[]>(spec.root !== undefined ? [spec.root] : []);

  if (state.status === 'loading') return null;
  if (state.status === 'error') return <div className="dg-embed-error">{state.message}</div>;

  return (
    <div className="dg-obsidian-root dg-embed" style={{ height: spec.height }}>
      <DiagramView
        model={state.data.model}
        pins={pins}
        onTogglePin={togglePin}
        onToggleExpand={togglePin}
        enteredPath={enteredPath}
        onEnteredPathChange={setEnteredPath}
        colorMode="light"
        assetBase={assetBase}
        libraryBase={libraryBase}
        onOpenLink={openLink}
        icons={icons}
        activeLayers={activeLayers}
        onToggleLayer={toggleLayer}
        {...(spec.plane !== undefined ? { plane: spec.plane } : {})}
        {...(state.data.layout !== undefined ? { layout: state.data.layout } : {})}
        {...(state.data.drawings !== undefined ? { drawings: state.data.drawings } : {})}
      />
      <button type="button" className="dg-embed-open" onClick={onOpenStudio}>
        Open in studio
      </button>
    </div>
  );
}
