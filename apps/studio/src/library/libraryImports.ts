import { errMessage, uniqueSlug } from '@diagc/core/internal';
import { uploadAsset } from '../canvas-editing/images';
import type { SaveIssues } from '../session/useEditSession';
import type { UseLibrary } from './useLibrary';

/** A user's own icon or shape, uploaded and added to a library category as a
 * placeable entry; a failed upload goes to the banner. */
export function libraryImports(
  lib: Pick<UseLibrary, 'library' | 'addEntry'>,
  reportIssues: (issues: SaveIssues) => void,
) {
  // Import a user icon into a library category: upload the file, then add it
  // as a new placeable entry (a fresh image-typed template).
  const importLibraryIcon = async (categoryId: string, file: File) => {
    try {
      const image = await uploadAsset(file);
      const id = uniqueSlug(file.name, new Set(lib.library.entries.map((e) => e.id)), 'icon');
      const name = file.name.replace(/\.[^.]*$/, '') || 'icon';
      lib.addEntry({ id, category: categoryId, name, template: { type: 'image', image, width: 64, height: 64 } });
    } catch (e) {
      reportIssues([{ message: errMessage(e) }]);
    }
  };

  // Import a user shape (SVG silhouette) into a library category: same upload
  // flow as importLibraryIcon, but the template carries no width/height — a
  // shape sizes to the node instead of forcing a fixed footprint.
  const importLibraryShape = async (categoryId: string, file: File) => {
    try {
      const shape = await uploadAsset(file);
      const id = uniqueSlug(file.name, new Set(lib.library.entries.map((e) => e.id)), 'shape');
      const name = file.name.replace(/\.[^.]*$/, '') || 'shape';
      lib.addEntry({ id, category: categoryId, name, template: { shape } });
    } catch (e) {
      reportIssues([{ message: errMessage(e) }]);
    }
  };

  return { importLibraryIcon, importLibraryShape };
}
