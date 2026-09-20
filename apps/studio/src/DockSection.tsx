import { useId, type ReactNode } from 'react';
import { usePersistedState } from './hooks/usePersistedState';

/**
 * One foldable panel in a dock. The dock's own toggle is all-or-nothing, which
 * stops working once a dock stacks unrelated panels (a notation's panel over
 * Layers & planes): a long threat register would bury the layer switches with
 * no way to put it aside. Each section folds to its header on its own.
 *
 * The section owns the title AND renders the panel's `<aside>` landmark, so a
 * panel swaps its root element for this one — `className` carries the panel's
 * own classes onto the landmark — and a folded section still says what it is.
 * Folded state is a viewer preference, remembered per `id`, never saved to a
 * diagram.
 */
export function DockSection({
  id,
  title,
  label,
  className,
  children,
}: {
  id: string;
  title: string;
  /** landmark name when it should say more than the title ("Git graph" for "Git") */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  // Same 'collapsed'/'expanded' on-disk format as the docks themselves.
  const [folded, setFolded] = usePersistedState<boolean>(
    `diagc.dockSection.${id}`,
    false,
    (raw) => (raw === null ? null : raw === 'collapsed'),
    (v) => (v ? 'collapsed' : 'expanded'),
  );
  const uid = useId();
  const headerId = `${uid}-header`;
  const panelId = `${uid}-panel`;
  return (
    <section className={`dock-section${folded ? ' folded' : ''}`}>
      <h2 className="dock-section-title">
        <button
          type="button"
          id={headerId}
          aria-expanded={!folded}
          // A folded section unmounts its panel, and aria-controls must not
          // point at an id that is not in the document.
          {...(folded ? {} : { 'aria-controls': panelId })}
          onClick={() => setFolded((v) => !v)}
        >
          <span className="dock-section-caret" aria-hidden="true">
            {folded ? '▸' : '▾'}
          </span>
          {title}
        </button>
      </h2>
      {!folded && (
        <aside
          id={panelId}
          className={className}
          {...(label !== undefined ? { 'aria-label': label } : { 'aria-labelledby': headerId })}
        >
          {children}
        </aside>
      )}
    </section>
  );
}
