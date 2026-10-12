import { DEFAULT_IMAGE_NODE_SIZE, defined, errMessage, type Point } from '@diagc/core/internal';
import { createNodeAt, placeTags } from './create-node';
import { readImageSize, uploadAsset } from './images';
import type { UseNodePlacementOptions } from './useNodePlacement';

/** What an image import reads: the editor, where new nodes land, and what follows an add. */
export type ImageImportScope = Pick<
  UseNodePlacementOptions,
  'editor' | 'activePlane' | 'activePlaneBorrowsContainment' | 'penLayer' | 'selectNode' | 'reportIssues'
>;

/**
 * Drop, paste and the picker all land here: upload each file, then create an
 * image node sized from the file, at the drop point when there is one. Failed
 * files are reported together once the rest are in.
 */
export async function importImages(scope: ImageImportScope, files: File[], position?: Point): Promise<void> {
  const { editor, activePlane, activePlaneBorrowsContainment, penLayer, selectNode, reportIssues } = scope;
  const issues: { message: string }[] = [];
  for (const file of files) {
    try {
      const name = await uploadAsset(file);
      const size = (await readImageSize(file)) ?? DEFAULT_IMAGE_NODE_SIZE;
      // peek(), not session: the render-bound session is stale inside this
      // loop, so a second file would reuse the first file's node id. Read
      // right before the dispatches (after all the awaits above) so the
      // stale window is zero.
      const m = editor.peek()?.state.model;
      if (m === undefined) break;
      // Plane-tag the image like any other added node: view-local on a
      // non-borrowing active plane, shared otherwise (createNodeAt), so the
      // node shows on the plane whose bucket its set-position below writes —
      // a shared image would show in every view with a position only one reads.
      const place = createNodeAt(m, {
        kind: 'image',
        plane: activePlane,
        borrowsContainment: activePlaneBorrowsContainment,
        parentId: undefined,
      });
      editor.dispatch({
        type: 'add-node',
        node: {
          id: place.id,
          name: file.name.replace(/\.[^.]*$/, '') || place.id,
          type: 'image',
          image: name,
          ...placeTags(place, penLayer),
        },
      });
      editor.dispatch({ type: 'set-size', nodeId: place.id, w: size.w, h: size.h });
      if (position !== undefined) {
        editor.dispatch({
          type: 'set-position',
          nodeId: place.id,
          x: position.x - size.w / 2,
          y: position.y - size.h / 2,
          ...defined({ plane: activePlane }),
        });
      }
      selectNode(place.id);
    } catch (e) {
      issues.push({ message: errMessage(e) });
    }
  }
  // One banner for the whole batch — per-file writes would overwrite each other.
  if (issues.length > 0) reportIssues(issues);
}
