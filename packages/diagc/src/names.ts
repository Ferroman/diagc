/** Words the studio API's action routes put after a diagram's name
 * (`/api/diagrams/<name>/rename`). A name ending in `/<word>` would be read as
 * that action on its folder, so it could be created and never saved. Alone, the
 * word is the plain route's name and is served like any other. */
const ACTION_SEGMENTS = ['rename', 'eject', 'composed'];

/** A diagram name the API, the CLI and the file tree all agree on: lowercase
 * letters, digits and `-`, with `/` between folders, every segment non-empty. */
export function isSafeName(name: string): boolean {
  if (!/^[a-z0-9][a-z0-9/-]*$/.test(name) || name.includes('..') || name.includes('//') || name.endsWith('/'))
    return false;
  const slash = name.lastIndexOf('/');
  return slash < 0 || !ACTION_SEGMENTS.includes(name.slice(slash + 1));
}
