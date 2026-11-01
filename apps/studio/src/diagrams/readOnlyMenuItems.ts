import type { ActionId } from '../hotkeys/actions';
import type { MenuItem } from '../MenuButton';
import type { DiagramActions } from './useDiagramActions';

export interface ReadOnlyMenuContext {
  /** the `.diagram.ts` the diagram is compiled from, when the API named it */
  source: string | undefined;
  /** ' (key)' for a button's title, or '' */
  hint: (id: ActionId) => string;
  actions: Pick<DiagramActions, 'duplicateDiagram'>;
  /** show the TypeScript source (a new tab here, the vault's editor in Obsidian) */
  openSource: () => void;
}

/**
 * What the read-only chip offers. The first thing a new user sees after
 * `diagc init` is a compiled diagram, so the chip that says it cannot be
 * edited here also says where it comes from and gives the two ways on: look at
 * the source, or copy the diagram into one the studio can edit. The copy is
 * Duplicate under its first-screen name; the ⋯ menu keeps it as Duplicate.
 */
export const readOnlyMenuItems = ({ source, hint, actions, openSource }: ReadOnlyMenuContext): MenuItem[] => [
  ...(source !== undefined
    ? [
        {
          id: 'open-source',
          label: 'Open source',
          title: `Open ${source}, the TypeScript this diagram is compiled from`,
          onSelect: openSource,
        },
      ]
    : []),
  {
    id: 'copy',
    label: 'Copy to editable diagram',
    title: `Copy this diagram — layout and all — to a new editable one and open it${hint('diagram.duplicate')}`,
    onSelect: () => void actions.duplicateDiagram(),
  },
];
