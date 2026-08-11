import type { Column, DiagramNode } from '@diagramming/core';

/** Fields a library entry stamps onto a fresh node when placed. Mostly a
 * presentation subset of DiagramNode, plus `columns` for db-table seeds. */
export type NodeTemplate = Pick<DiagramNode, 'type' | 'color' | 'image' | 'shape'> & {
  width?: number;
  height?: number;
  columns?: Column[];
};

export interface LibraryEntry {
  id: string;
  category: string; // category id
  name: string; // display + primary search term
  keywords?: string[]; // extra search terms
  template: NodeTemplate;
}

export interface LibraryCategory {
  id: string;
  name: string;
  builtin?: boolean; // bundled packs: not user-deletable
}

export interface Library {
  categories: LibraryCategory[];
  entries: LibraryEntry[];
}
