import { useRef } from 'react';

/** The one inline-rename field. Exported because a note renames rows with
 * the same gesture and the same commit contract (`null` = cancelled) — a second
 * copy would be a second set of Enter/blur/Escape rules to keep in step. */
export function InlineName({
  label,
  onCommit,
  onTab,
  ariaLabel = 'Rename',
}: {
  label: string;
  onCommit?: (value: string | null) => void;
  /** Tab inside the box: the quick add to chain once the name is committed */
  onTab?: () => void;
  /** what the field renames, for screen readers and for the tests that find it */
  ariaLabel?: string;
}) {
  const done = useRef(false); // Enter commits then blurs — don't commit twice
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onCommit?.(value);
  };
  return (
    <input
      className="dg-label-input nodrag nopan"
      aria-label={ariaLabel}
      defaultValue={label}
      autoFocus
      onFocus={(e) => e.target.select()}
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish((e.target as HTMLInputElement).value);
        else if (e.key === 'Escape') finish(null);
        else if (e.key === 'Tab' && !e.shiftKey) {
          // Tab means "this one is named, give me the next": commit BEFORE the
          // add so the host builds it on the renamed model, then chain. The
          // default would only move focus out of the canvas — the keydown guard
          // never sees this key while an <input> has it. Shift+Tab keeps the
          // default (blur commits, focus walks back), so a name can still be
          // left without extending anything.
          e.preventDefault();
          finish((e.target as HTMLInputElement).value);
          onTab?.();
        }
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
