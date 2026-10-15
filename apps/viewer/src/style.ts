import { useState } from 'react';
import { isKnownStyle } from '@diagc/renderer';

export interface StyleInputs {
  /** `?style=` as written, valid or not */
  param: string | null;
  /** the reader's pick from the page's own picker, this visit */
  picked: string | undefined;
  /** the diagram's own `style` */
  own: string | undefined;
}

const known = (id: string | null | undefined): string | undefined =>
  id !== null && id !== undefined && isKnownStyle(id) ? id : undefined;

/**
 * Which style preset a published page draws in. First match wins: the URL, for a
 * page embedded on another host and for the picture `publish --style` takes; then
 * the reader's pick; then the diagram's own; then clean. An id the page does not
 * know is passed over rather than drawn blank — a retired preset must never wedge
 * a page.
 */
export function resolveStyle({ param, picked, own }: StyleInputs): string {
  return known(param) ?? known(picked) ?? known(own) ?? 'clean';
}

/** Whether the reader may switch. Not in an export, and not where the URL sets the
 * style: there the embedding page owns it, as with the theme. */
export function canSwitchStyle({ exportMode, param }: { exportMode: boolean; param: string | null }): boolean {
  return !exportMode && known(param) === undefined;
}

/**
 * The page's style, and the reader's switch where they have one. A pick lasts
 * the visit and is not remembered: the diagram's own style is its author's
 * choice, and a look tried on one page must not quietly dress every other.
 */
export function useStyle(
  exportMode: boolean,
  own: string | undefined,
): { style: string; setStyle?: (id: string) => void } {
  const [param] = useState(() => new URLSearchParams(window.location.search).get('style'));
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const style = resolveStyle({ param, picked, own });
  return canSwitchStyle({ exportMode, param }) ? { style, setStyle: setPicked } : { style };
}
