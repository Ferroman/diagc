// The studio API's handlers, one module per subject. Hosts take this module whole:
// `typeof import('./handlers')` is the `Handlers` type `dispatch` passes around, and
// the Obsidian vault host imports the file by path. So each export is named, and a
// helper one subject module exports to another does not become part of that type.
export { MAX_ASSET_BYTES, readAsset, saveAsset } from './assets';
export {
  ejectDiagramSource,
  listDiagramModels,
  readComposedDiagram,
  readDiagram,
  renameDiagram,
  saveDiagram,
  type DiagramEntry,
} from './diagrams';
export { walkDiagramJson, walkFiles } from './files';
export { readLibrary, saveLibrary } from './library';
export { exportPage } from './pages';
export type { HandlerResult } from './result';
export { listDrawings, listLayouts, saveDrawings, saveLayout } from './sidecars';

// The name rule every route checks, for the hosts and tests that reach it here.
export { isSafeName } from '../names';
