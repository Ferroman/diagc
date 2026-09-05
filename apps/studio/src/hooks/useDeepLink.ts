import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { getHost } from '../host';
import { formatHash, parseHash, type UrlState } from '../urlState';
import { usePersistedState } from './usePersistedState';

// Remember which diagram was open so a reload reopens it instead of resetting
// to the alphabetically-first one. localStorage is unavailable in some
// embeddings, so every access is guarded.
const SELECTED_KEY = 'diagramming.selected';

// Drill-path comparisons shared by the deep-link bookkeeping: the report
// handler settles an applied URL's validity, the URL writer classifies
// replace-vs-push.
const contentsEqual = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
const isStrictPrefix = (a: string[], b: string[]) => a.length < b.length && a.every((id, i) => id === b[i]);

export interface DeepLink {
  selected: string;
  setSelected: Dispatch<SetStateAction<string>>;
  enteredPath: string[];
  setEnteredPath: Dispatch<SetStateAction<string[]>>;
  /** DiagramView's drill-trail report: settles the applied URL's validity and
   * records the new path. The sole authority for clearing `appliedUrlRef`. */
  handleEnteredPathChange: (path: string[]) => void;
}

export interface UseDeepLinkOptions {
  names: string[];
  booted: boolean;
  /** A cross-diagram hashchange must close any open edit session first (like
   * every other diagram-switch path); read through a ref because the once-
   * subscribed hashchange listener can't capture a fresh closure. Owned by
   * useEditSession, plumbed in here. */
  leaveEditRef: RefObject<() => boolean>;
}

/**
 * URL/hash deep-link machinery: keep the hash in step with (selected,
 * enteredPath), apply external hash navigations (Back/Forward/paste) into state,
 * and correct stale links (replace, not push, so Back never loops over a dead
 * entry). The three interacting effects + `appliedUrlRef` have survived several
 * race-condition fixes — preserve their ordering exactly.
 */
export function useDeepLink({ names, booted, leaveEditRef }: UseDeepLinkOptions): DeepLink {
  // Deep link: the hash names the diagram + drill path (#/<diagram>/<id>/…).
  // Parsed once at mount; it outranks the localStorage memory, and stale parts
  // are corrected (replace, not push) once sources have loaded.
  const [initialUrl] = useState<UrlState | null>(() => parseHash(getHost().urlState.get()));
  // Restore the last-open diagram; a stale/deleted name is corrected once the
  // source list has loaded (see the fallback effect below).
  const [selected, setSelected] = usePersistedState<string>(SELECTED_KEY, '', (raw) => initialUrl?.diagram ?? raw);
  // The drill trail (reported by DiagramView; seeded from the URL). Its last
  // element is the level new nodes nest into; the full path is what the
  // shareable hash encodes.
  const [enteredPath, setEnteredPath] = useState<string[]>(() => initialUrl?.path ?? []);
  // The last URL applied INTO state (initial load or hashchange). While set, a
  // report that shortens its path is the stale-link prune — corrected with
  // replaceState so Back never loops over a dead entry.
  const appliedUrlRef = useRef<UrlState | null>(initialUrl);
  // Live (selected, enteredPath) mirror for the once-subscribed hashchange
  // listener, which must tell a genuine navigation apart from an echo of our
  // own hash write (same pattern as editorRef below).
  const urlNowRef = useRef({ selected, enteredPath });
  urlNowRef.current = { selected, enteredPath };
  const handleEnteredPathChange = useCallback((path: string[]) => {
    // Settle the applied URL's validity right where the view's report arrives,
    // independent of boot timing: this report effect fires at mount, before any
    // user gesture is possible, so validity is decided before a navigation
    // could be misread as a correction. Contents-equal → the link was valid;
    // clear the ref (all later changes are navigation). Strict prefix → this IS
    // the stale-link prune; keep the ref so the URL writer replaces once it can
    // write. Anything else → unrelated to the applied URL; clear the ref.
    const applied = appliedUrlRef.current;
    if (applied !== null) {
      if (contentsEqual(path, applied.path)) appliedUrlRef.current = null; // deep link confirmed valid
      else if (!isStrictPrefix(path, applied.path)) appliedUrlRef.current = null; // unrelated report
    }
    setEnteredPath(path);
  }, []);

  // Once everything has loaded, fall back to the first diagram if the restored
  // name no longer exists.
  useEffect(() => {
    // `selected` legitimately starts '' now that `loaded` fills in only once the
    // boot fetch resolves (no persisted/hash selection at mount = empty names, so
    // the initial useState(() => ... ?? names[0] ?? '') falls through) — so this
    // must also promote out of '' once booted, not just correct a stale name.
    if (booted && !names.includes(selected)) {
      setSelected(names[0] ?? '');
      setEnteredPath([]);
    }
  }, [booted, names, selected, setSelected, setEnteredPath]);

  // URL writer: keep the hash in step with (selected, enteredPath). User
  // navigation pushes (Back = drill out); corrections — no/malformed hash,
  // unknown diagram, stale-path prunes — replace in place.
  useEffect(() => {
    if (!booted || selected === '' || !names.includes(selected)) return;
    const target = formatHash(selected, enteredPath);
    if (getHost().urlState.get() === target) {
      // NOT the ref-clearing point: content and `booted` now arrive in the same
      // commit as this effect's first eligible run, so `enteredPath` can still be
      // the raw, unclamped path parsed from the URL (DiagramView hasn't reported
      // yet) — it trivially matches `target` because both derive from the same
      // unvalidated parse. Clearing the ref here would race ahead of
      // handleEnteredPathChange's actual validation and misclassify the
      // then-later stale-path prune as navigation (push instead of replace).
      // handleEnteredPathChange is the sole authority for settling the ref.
      return;
    }
    const cur = parseHash(getHost().urlState.get());
    const applied = appliedUrlRef.current;
    const correction =
      cur === null ||
      !names.includes(cur.diagram) ||
      (applied !== null && applied.diagram === selected && isStrictPrefix(enteredPath, applied.path));
    appliedUrlRef.current = null;
    getHost().urlState.set(target, correction); // history push: one entry per navigation step
  }, [booted, selected, enteredPath, names]);

  // External navigation: browser Back/Forward or a hand-edited/pasted hash.
  // Applying it makes state match the hash, so the writer above stays quiet.
  useEffect(() => {
    const onExternal = () => {
      const parsed = parseHash(getHost().urlState.get());
      if (parsed === null) return; // never navigate to nowhere on a mangled hash
      const now = urlNowRef.current;
      // A cross-diagram navigation closes any open edit session first, like
      // every other diagram-switch path (picker onChange, create flow) —
      // otherwise the canvas would keep rendering the old diagram's session
      // while the picker and URL claim the new one. Read through a ref: this
      // listener subscribes once with empty deps.
      if (parsed.diagram !== now.selected && !leaveEditRef.current()) return;
      // Arm the applied-URL flag only when there is something to apply. A
      // content-equal event is the echo of our own hash write (or a no-op
      // navigation): a contents-equal enteredPath prop never changes
      // DiagramView's state, so no report would ever arrive to settle the
      // flag, and pre-boot the writer's confirm can't clear it either — the
      // stale flag would misclassify the next genuine drill-out as a
      // correction (replace) instead of navigation (push).
      if (parsed.diagram !== now.selected || !contentsEqual(parsed.path, now.enteredPath)) {
        appliedUrlRef.current = parsed;
      }
      setSelected(parsed.diagram);
      setEnteredPath(parsed.path);
    };
    return getHost().urlState.subscribe(onExternal);
  }, [leaveEditRef, setSelected, setEnteredPath]);

  return { selected, setSelected, enteredPath, setEnteredPath, handleEnteredPathChange };
}
