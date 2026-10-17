import type { ActionId } from '../hotkeys/actions';
import type { MenuItem } from '../MenuButton';
import type { DiagramActions } from './useDiagramActions';

export interface DiagramMenuContext {
  /** the diagram on screen has a source here to rename or eject */
  owned: boolean;
  /** a diagram is on screen, to export or copy */
  hasModel: boolean;
  /** ' (key)' for a button's title, or '' */
  hint: (id: ActionId) => string;
  actions: Pick<DiagramActions, 'renameDiagram' | 'duplicateDiagram' | 'ejectDiagram'>;
  /** save the canvas as drawn as a PNG */
  exportPng: () => void;
  /** save the diagram as one web page, the one `diagc publish` writes */
  exportPage: () => void;
}

/**
 * The top bar's ⋯ menu. Each row keeps the condition its chip had: a diagram
 * compiled from TypeScript has no source here to rename or eject, only a
 * model to copy.
 */
export const diagramMenuItems = ({
  owned,
  hasModel,
  hint,
  actions,
  exportPng,
  exportPage,
}: DiagramMenuContext): MenuItem[] => [
  ...(owned
    ? [
        {
          id: 'rename',
          label: 'Rename',
          title: `Rename this diagram${hint('diagram.rename')}`,
          onSelect: () => void actions.renameDiagram(),
        },
      ]
    : []),
  ...(hasModel
    ? [
        {
          id: 'export-png',
          label: 'Export PNG',
          title: 'Save the canvas as drawn — folds, layers, theme and drawings — as a PNG image',
          onSelect: exportPng,
        },
        {
          id: 'export-page',
          label: 'Export web page',
          title:
            'Save a web page anyone can open in a browser, all in one file: the diagram to explore, with a light/dark switch and a style picker. Made from what is saved — positions not yet saved are left out',
          onSelect: exportPage,
        },
        {
          id: 'duplicate',
          label: 'Duplicate',
          title: `Copy this diagram — layout and all — to a new editable one and open it${hint('diagram.duplicate')}`,
          onSelect: () => void actions.duplicateDiagram(),
        },
      ]
    : []),
  ...(owned
    ? [
        {
          id: 'eject',
          label: 'Eject',
          title: `Promote this diagram to a TypeScript source — it becomes read-only here${hint('diagram.eject')}`,
          onSelect: () => void actions.ejectDiagram(),
        },
      ]
    : []),
];
