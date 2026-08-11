import { useEffect, useMemo, useState } from 'react';
import { createIconRegistry } from '@diagramming/icons';
import { createTypeRegistry, LIBRARY_ENTRY_DND_TYPE } from '@diagramming/renderer';
import { searchLibrary } from './entry';
import type { Library, LibraryEntry } from './types';

// Same registries the canvas resolves against, so a card previews the stencil it
// will actually place. Built once — they are static defaults.
const TYPE_STYLES = createTypeRegistry();
const ICONS = createIconRegistry();

interface LibraryPanelProps {
  library: Library;
  onPlace: (entry: LibraryEntry) => void;
  /** Restyle the selected node to match a card (vs. placing a new one). Enabled
   * only when a node is selected (`applyTarget` given) via a Place/Apply toggle. */
  onApply?: (entry: LibraryEntry) => void;
  /** The currently-selected node an Apply targets; undefined hides the toggle. */
  applyTarget?: { id: string; name: string };
  onAddNode?: () => void;
  onAddImages?: (files: File[]) => void;
  onAddCategory?: (name: string) => void;
  onDeleteCategory?: (id: string) => void;
  onImportIcon?: (categoryId: string, file: File) => void;
  onImportShape?: (categoryId: string, file: File) => void;
  assetBase?: string;
}

// absolute refs (bundled /library/… or http[s]:) pass through; bare refs go via assetBase
const entryThumbUrl = (assetBase: string, ref: string): string =>
  ref.startsWith('/') || /^https?:/.test(ref) ? ref : `${assetBase}${ref}`;

/** Sections bigger than this start collapsed. The bundled AWS pack is hundreds
 * of icons across ~30 categories: rendering them all would put a thousand
 * thumbnails on screen and bury the small stencils under an endless scroll.
 * Small sections (C4, Tech, a user's own category) stay open, so the panel looks
 * unchanged until a pack is genuinely large. */
const AUTO_COLLAPSE_ABOVE = 16;

/** A small preview: the icon image for image entries, else a color swatch. */
function EntryPreview({ entry, assetBase }: { entry: LibraryEntry; assetBase: string }) {
  if (entry.template.image !== undefined) {
    return <img className="lib-thumb" src={entryThumbUrl(assetBase, entry.template.image)} alt={entry.name} draggable={false} />;
  }
  if (entry.template.shape !== undefined) {
    // Preview a shape entry as its silhouette, tinted like the placed node (mask,
    // same as DiagramNode's .dg-shape-fill) rather than a plain color swatch.
    const url = `url("${entryThumbUrl(assetBase, entry.template.shape)}")`;
    return (
      <span
        className="lib-thumb lib-shape-thumb"
        aria-hidden="true"
        style={{ WebkitMaskImage: url, maskImage: url, background: entry.template.color ?? 'var(--dg-text-muted)' }}
      />
    );
  }
  // A typeless entry is just its accent color. A typed one previews the stencil
  // the canvas will draw — silhouette, glyph and dashed-ness — so the dozen C4
  // container variants are told apart by looking, not by reading every caption.
  const color = entry.template.color ?? 'var(--dg-border)';
  const style = entry.template.type !== undefined ? TYPE_STYLES.resolve(entry.template.type) : undefined;
  const Icon = style?.icon !== undefined ? ICONS.resolve(style.icon) : undefined;
  // Mirror DiagramNode: outlined types draw as a colored border, everything else
  // as a colored fill. Dashed types (the boundaries) dash that border.
  const outlined = style?.outline === true || style?.dashed === true;
  return (
    <span
      className={`lib-swatch lib-swatch-${style?.shape ?? 'box'}${outlined ? ' lib-swatch-outline' : ''}`}
      style={
        outlined
          ? { border: `1.5px ${style?.dashed === true ? 'dashed' : 'solid'} ${color}`, color }
          : { background: color }
      }
    >
      {Icon !== undefined && <Icon size={14} className="lib-swatch-icon" />}
    </span>
  );
}

export function LibraryPanel({
  library,
  onPlace,
  onApply,
  applyTarget,
  onAddNode,
  onAddImages,
  onAddCategory,
  onDeleteCategory,
  onImportIcon,
  onImportShape,
  assetBase = '/api/assets/',
}: LibraryPanelProps) {
  const [query, setQuery] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [mode, setMode] = useState<'place' | 'apply'>('place');
  // Explicit open/closed choices, keyed by category id; absent = the size-based
  // default below. Kept across searches so a section you opened stays open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const matches = useMemo(() => searchLibrary(library, query), [library, query]);
  // One pass over the matches instead of re-filtering the whole entry list once
  // per category — with the AWS pack that is ~30 × 800 comparisons per render.
  const byCategory = useMemo(() => {
    const m = new Map<string, LibraryEntry[]>();
    for (const e of matches) {
      const list = m.get(e.category);
      if (list === undefined) m.set(e.category, [e]);
      else list.push(e);
    }
    return m;
  }, [matches]);
  const searching = query.trim() !== '';

  // A card can restyle the selection only when there is one and a handler exists.
  const canApply = applyTarget !== undefined && onApply !== undefined;
  const applying = canApply && mode === 'apply';
  // Each new selection starts in Place mode — you opt into Apply per target, so a
  // stale Apply mode never silently restyles the next node you click.
  useEffect(() => {
    setMode('place');
  }, [applyTarget?.id]);

  const addCategory = () => {
    const name = newCategory.trim();
    if (name === '' || onAddCategory === undefined) return;
    onAddCategory(name);
    setNewCategory('');
  };

  return (
    <aside className="sidebar lib-panel">
      <div className="panel-head">
        <h3>Library</h3>
      </div>
      {(onAddNode !== undefined || onAddImages !== undefined) && (
        <div className="lib-actions">
          {onAddNode !== undefined && (
            <button type="button" className="chip" onClick={onAddNode}>
              Add node
            </button>
          )}
          {onAddImages !== undefined && (
            <label className="chip icon-btn" title="Add image">
              Add image
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                aria-label="Add image"
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  if (files.length > 0) onAddImages(files);
                  e.target.value = ''; // re-selecting the same file must fire again
                }}
              />
            </label>
          )}
        </div>
      )}
      {canApply && (
        <div className="lib-apply-toggle" role="group" aria-label="Card click action">
          <button
            type="button"
            className={`chip${applying ? '' : ' active'}`}
            aria-pressed={!applying}
            title="Clicking a card adds a new node"
            onClick={() => setMode('place')}
          >
            Place new
          </button>
          <button
            type="button"
            className={`chip${applying ? ' active' : ''}`}
            aria-pressed={applying}
            title={`Clicking a card restyles ${applyTarget!.name} to match it`}
            onClick={() => setMode('apply')}
          >
            Apply to {applyTarget!.name}
          </button>
        </div>
      )}
      <input
        className="lib-search"
        type="search"
        aria-label="Search library"
        placeholder="Search nodes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {library.categories.map((cat) => {
        const entries = byCategory.get(cat.id) ?? [];
        // hide an empty builtin section while searching, but keep an empty user
        // category visible so you can import into it
        if (entries.length === 0 && (searching || cat.builtin === true)) return null;
        // A search expands the sections that matched, so hits are never hidden
        // behind a collapsed header — unless you closed that one yourself.
        const open = toggled[cat.id] ?? (searching || entries.length <= AUTO_COLLAPSE_ABOVE);
        return (
          <section key={cat.id} className="lib-category">
            <div className="lib-cat-head">
              <h4 className="lib-cat-name">
                <button
                  type="button"
                  className="lib-cat-toggle"
                  // Name is the section, state is aria-expanded; the visible
                  // count stays out of the name so it doesn't read as "AWS40".
                  aria-label={cat.name}
                  aria-expanded={open}
                  title={`${open ? 'Collapse' : 'Expand'} ${cat.name}`}
                  onClick={() => setToggled((t) => ({ ...t, [cat.id]: !open }))}
                >
                  <span className="lib-cat-caret" aria-hidden="true">
                    {open ? '▾' : '▸'}
                  </span>
                  <span className="lib-cat-label">{cat.name}</span>
                  <span className="lib-cat-count">{entries.length}</span>
                </button>
              </h4>
              {cat.builtin !== true && (
                <span className="lib-cat-actions">
                  {onImportIcon !== undefined && (
                    <label className="chip icon-btn" title={`Import icon into ${cat.name}`}>
                      Icon
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        aria-label={`Import icon into ${cat.name}`}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file !== undefined) onImportIcon(cat.id, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                  {onImportShape !== undefined && (
                    <label className="chip icon-btn" title={`Import shape into ${cat.name}`}>
                      Shape
                      <input
                        type="file"
                        accept=".svg,image/svg+xml"
                        hidden
                        aria-label={`Import shape into ${cat.name}`}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file !== undefined) onImportShape(cat.id, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                  {onDeleteCategory !== undefined && (
                    <button
                      type="button"
                      className="chip icon-btn"
                      aria-label={`Delete category ${cat.name}`}
                      title={`Delete category ${cat.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete category '${cat.name}' and its imported icons?`)) onDeleteCategory(cat.id);
                      }}
                    >
                      ✕
                    </button>
                  )}
                </span>
              )}
            </div>
            {open && (
              <div className="lib-grid">
                {entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="lib-entry"
                    aria-label={applying ? `Apply ${entry.name}` : `Place ${entry.name}`}
                    title={applying ? `Apply ${entry.name} to ${applyTarget!.name}` : `Place ${entry.name}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(LIBRARY_ENTRY_DND_TYPE, entry.id);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => (applying ? onApply!(entry) : onPlace(entry))}
                  >
                    <EntryPreview entry={entry} assetBase={assetBase} />
                    <span className="lib-entry-name">{entry.name}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
      {onAddCategory !== undefined && (
        <div className="add-member">
          <input
            aria-label="New category name"
            placeholder="New category…"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCategory();
              }
            }}
          />
          <button type="button" className="chip" aria-label="Add category" onClick={addCategory}>
            +
          </button>
        </div>
      )}
    </aside>
  );
}
