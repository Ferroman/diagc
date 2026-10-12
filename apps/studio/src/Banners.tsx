import type { LoadedArtifact } from './diagrams/artifacts';
import type { SaveIssues } from './session/useEditSession';

export interface BannersProps {
  /** every diagram the studio can open */
  names: readonly string[];
  /** the design API is up, so a diagram can be created here */
  canDesign: boolean;
  editing: boolean;
  /** the open diagram's artifact */
  current: LoadedArtifact | undefined;
  saveIssues: SaveIssues;
}

/** The banners under the top bar: nothing to open, a diagram that failed
 * validation, and what a save or a load outside edit mode reported. */
export function Banners({ names, canDesign, editing, current, saveIssues }: BannersProps) {
  return (
    <>
      {names.length === 0 && (
        <div className="banner">
          {canDesign ? (
            // The API is up, so creating is possible — telling an Obsidian (or
            // fresh-checkout) user to run diagc compile here points at a build
            // step their empty workspace doesn't need.
            <>
              No diagrams yet — use <b>New diagram</b> to create one.
            </>
          ) : (
            <>
              No artifacts found — run <code>diagc compile</code> (or <code>diagc watch</code>) first.
            </>
          )}
        </div>
      )}
      {!editing && current !== undefined && current.issues.length > 0 && (
        <div className="banner error">
          <b>{current.name}</b> failed validation:
          <ul>
            {current.issues.map((i, idx) => (
              <li key={idx}>{i.message}</li>
            ))}
          </ul>
        </div>
      )}
      {/* enterEditFromSource's catch path and a failed position save set
        saveIssues without ever setting editing — the toolbar's own banner
        only renders while editing, so view mode needs its own surface. */}
      {!editing && saveIssues !== null && saveIssues.length > 0 && (
        <div className="banner error">
          <ul>
            {saveIssues.map((i, idx) => (
              <li key={idx}>{i.message}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
