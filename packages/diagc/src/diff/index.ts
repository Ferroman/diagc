// `diagc diff`: load each side's diagrams, compare them by name, describe the changes,
// and write the pages, the side-by-side overview and the summary.
export { loadDiagramSet, type DiagramSet, type DiagramVersion } from './load';
export { compareDiagramSets, type DiagramDiff, type DiagramDiffStatus } from './compare';
export { describeDiff, formatDiffSummary } from './describe';
export { writeDiffPages, type DiffPagesOptions, type DiffPagesResult } from './pages';
