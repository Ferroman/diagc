import {
  TM_BOUNDARY_TYPE,
  TM_FLOW_KIND,
  TM_PROCESS_TYPE,
  defined,
  isThreatModelNode,
  type DiagramNode,
} from '@diagc/core/internal';
import { createNodeAt, placeTags } from '../../canvas-editing/create-node';
import { addConnected, parentIn, type QuickAddRecipes } from '../../canvas-editing/quickAddRecipe';

/**
 * A boundary grows a process inside it; an element a flow to a new process,
 * the element a data flow usually lands on. A threat model is a plain graph
 * with typed elements, so a stray node there gets the generic sibling.
 */
export const threatModelQuickAdd: QuickAddRecipes = (src) => {
  const { model, source, ctx } = src;
  if (source.type === TM_BOUNDARY_TYPE) {
    return {
      label: 'Add a process inside',
      build: () => {
        // a boundary is containment, never a flow endpoint: the process goes in,
        // with no relation (a data-flow touching a boundary fails validation)
        const place = createNodeAt(model, {
          kind: 'process',
          plane: ctx.plane,
          borrowsContainment: ctx.borrowsContainment,
          parentId: source.id,
        });
        const node: DiagramNode = { id: place.id, name: '', type: TM_PROCESS_TYPE, ...placeTags(place, ctx.penLayer) };
        return {
          id: place.id,
          beside: false,
          command: { type: 'batch', commands: [{ type: 'add-node', node, ...defined({ parent: place.parent }) }] },
        };
      },
    };
  }
  if (!isThreatModelNode(source)) return undefined;
  return {
    label: 'Add a flow to a new process',
    build: () => {
      const place = createNodeAt(model, {
        kind: 'process',
        plane: ctx.plane,
        borrowsContainment: ctx.borrowsContainment,
        parentId: parentIn(model, ctx.plane, source.id),
      });
      // a flow, whatever the connect gesture would draw: the new end is a
      // process, never a boundary
      const node: DiagramNode = { id: place.id, name: '', type: TM_PROCESS_TYPE, ...placeTags(place, ctx.penLayer) };
      return { id: place.id, beside: true, command: addConnected(src, node, place, TM_FLOW_KIND) };
    },
  };
};
