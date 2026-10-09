// Values the editor, the renderer and validate() must agree on. They live apart
// from types.ts because the author API exports every name in types.ts; these are
// internal.

import { ACTIVITY_FRAME_TYPE } from './activity/activity';

/** Default footprint for image nodes whose size is not known yet. Kept in
 * core so the editor and the renderer cannot drift apart. */
export const DEFAULT_IMAGE_NODE_SIZE = { w: 160, h: 120 } as const;

/** Sentinel id the renderer's elk wrapper uses for its synthetic layout root.
 * Kept in core so validation can refuse a model node that would collide with
 * it — the renderer and validate() must agree on the exact string. */
export const RESERVED_NODE_ID = '__root__';

/** Node types whose containment children cannot be re-homed when the container
 * dies — an orphaned activity lane or git commit fails validation until undone.
 * Deleting one of these cascades to its subtree; every other container severs
 * only. Kept in core so the editor UI and the command algebra agree. */
export const CASCADE_DELETE_TYPES = [ACTIVITY_FRAME_TYPE, 'branch'] as const;

/** Pen width when a stroke names none. In core so editor and renderer cannot drift. */
export const DEFAULT_STROKE_WIDTH = 3;
