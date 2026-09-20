import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { Drawings, LayoutOverlay } from '@diagc/core';
import { loadArtifacts, type ApiDiagram, type LoadedArtifact } from '../artifacts';
import { getHost } from '../host';

export interface DiagramBoot {
  /** render-ready models fetched from the dev API (replaces the old build-time glob) */
  loaded: Record<string, LoadedArtifact>;
  setLoaded: Dispatch<SetStateAction<Record<string, LoadedArtifact>>>;
  /** Designer-owned diagrams read straight from their source (shadow content) */
  sources: Record<string, LoadedArtifact>;
  setSources: Dispatch<SetStateAction<Record<string, LoadedArtifact>>>;
  /** Latest in-memory edits/new diagrams, shadowing the persisted artifacts
   * until a save/reload round-trip makes them authoritative. */
  drafts: Record<string, LoadedArtifact>;
  setDrafts: Dispatch<SetStateAction<Record<string, LoadedArtifact>>>;
  /** loaded ∪ sources ∪ drafts — the full artifact set the UI browses */
  artifacts: Record<string, LoadedArtifact>;
  /** sorted diagram names */
  names: string[];
  /** the source-ownership fetch has settled — only then is it safe to treat a
   * persisted selection as invalid (a source-only diagram loads asynchronously). */
  booted: boolean;
  /** names the dev middleware owns (creatable/savable/renamable by the studio) */
  ownedNames: Set<string>;
  setOwnedNames: Dispatch<SetStateAction<Set<string>>>;
  /** the dev middleware answered → diagrams can be created/saved at all. Static
   * builds (no middleware) stay pure viewers with no New button. */
  canDesign: boolean;
}

/**
 * Boot/data-loading domain: fetch the render-ready models + layouts from the dev
 * API once, track which diagrams are editable, and expose the merged artifact
 * store. `sources`/`drafts` shadow `loaded` server-side/client-side so the
 * studio always shows the freshest model.
 */
export function useDiagramBoot(): DiagramBoot {
  const [loaded, setLoaded] = useState<Record<string, LoadedArtifact>>({});
  // Designer-owned diagrams read straight from their .diagrams/src/*.diagram.json
  // source (via the dev middleware) — they shadow compiled artifacts, which go
  // stale whenever a save happens while the compile watcher isn't running.
  const [sources, setSources] = useState<Record<string, LoadedArtifact>>({});
  const [drafts, setDrafts] = useState<Record<string, LoadedArtifact>>({});
  const artifacts = useMemo(() => ({ ...loaded, ...sources, ...drafts }), [loaded, sources, drafts]);
  const names = useMemo(() => Object.keys(artifacts).sort(), [artifacts]);
  const [booted, setBooted] = useState(false);
  const [ownedNames, setOwnedNames] = useState<Set<string>>(new Set());
  const [canDesign, setCanDesign] = useState(false);

  // Boot: pull render-ready models + layouts from the dev API (replaces the old
  // build-time glob). Editable names come back flagged; sources shadow artifacts
  // server-side so the studio always shows the freshest model.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const host = getHost();
        const [dRes, lRes, kRes] = await Promise.all([
          host.apiFetch('/api/diagrams'),
          host.apiFetch('/api/layouts'),
          host.apiFetch('/api/drawings'),
        ]);
        if (!dRes.ok) return;
        const { diagrams = [] } = (await dRes.json()) as { diagrams?: ApiDiagram[] };
        const { layouts = {} } = lRes.ok
          ? ((await lRes.json()) as { layouts?: Record<string, LayoutOverlay> })
          : { layouts: {} };
        const { drawings = {} } = kRes.ok
          ? ((await kRes.json()) as { drawings?: Record<string, Drawings> })
          : { drawings: {} };
        if (!live) return;
        setLoaded(loadArtifacts(diagrams, layouts, drawings));
        setOwnedNames(new Set(diagrams.filter((d) => d.editable).map((d) => d.name)));
        setCanDesign(true);
      } catch {
        /* no dev server → empty, read-only */
      } finally {
        if (live) setBooted(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return {
    loaded,
    setLoaded,
    sources,
    setSources,
    drafts,
    setDrafts,
    artifacts,
    names,
    booted,
    ownedNames,
    setOwnedNames,
    canDesign,
  };
}
