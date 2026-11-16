import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { createIconRegistry } from '@diagc/icons';
import { createTypeRegistry } from '../../registry';
import { NoteStateContext, type NoteState } from '../../notes/note-state';
import { DiagramNode, type DiagramNodeData } from '../DiagramNode';

const notes: NoteState = { isOpen: () => false, toggle: () => {}, placeBadge: () => {} };

/** Test helper: a node drawn through DiagramNode, so the body is picked the way the canvas picks it. */
export function renderBody(partial: Partial<DiagramNodeData>): HTMLElement {
  const data: DiagramNodeData = {
    label: 'n',
    state: 'leaf',
    promoted: false,
    sharedMembers: [],
    hiddenCount: 0,
    typeRegistry: createTypeRegistry(),
    icons: createIconRegistry(),
    ...partial,
  };
  return render(
    <ReactFlowProvider>
      <NoteStateContext.Provider value={notes}>
        <DiagramNode id="n1" data={data} selected={false} width={100} height={40} />
      </NoteStateContext.Provider>
    </ReactFlowProvider>,
  ).container;
}
