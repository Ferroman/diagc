import {
  SM_CHOICE_TYPE,
  SM_INITIAL_TYPE,
  SM_MACHINE_TYPE,
  SM_REGION_TYPE,
  SM_STATE_TYPE,
  SM_TRANSITION_KIND,
  isStateMachineType,
  defined,
  type DiagramNode,
} from '@diagc/core/internal';
import { createNodeAt, placeTags } from '../../canvas-editing/create-node';
import { addConnected, parentIn, type QuickAddRecipes } from '../../canvas-editing/quickAddRecipe';

/** The relation kind a connect gesture draws on a state machine. */
export const smConnectKind = (): string => SM_TRANSITION_KIND;

/**
 * A state, an initial or a choice grows the next state across a transition; a
 * region or a machine takes a state inside, with no transition (neither may be
 * a transition end). Any other node leaves `+` with nothing to offer.
 */
export const stateMachineQuickAdd: QuickAddRecipes = (src) => {
  const { model, source, ctx } = src;
  const newState = (parentId: string | undefined) => {
    const place = createNodeAt(model, {
      kind: 'state',
      plane: ctx.plane,
      borrowsContainment: ctx.borrowsContainment,
      parentId,
    });
    const node: DiagramNode = { id: place.id, name: 'State', type: SM_STATE_TYPE, ...placeTags(place, ctx.penLayer) };
    return { place, node };
  };
  if (source.type === SM_REGION_TYPE || source.type === SM_MACHINE_TYPE) {
    return {
      label: 'Add a state inside',
      build: () => {
        const { place, node } = newState(source.id);
        return {
          id: place.id,
          beside: false,
          command: { type: 'batch', commands: [{ type: 'add-node', node, ...defined({ parent: place.parent }) }] },
        };
      },
    };
  }
  const isState = source.type === SM_STATE_TYPE;
  if (!isState && source.type !== SM_INITIAL_TYPE && source.type !== SM_CHOICE_TYPE) {
    // any other glyph would be cloned by the generic sibling, which is no state
    return isStateMachineType(source.type) ? 'none' : undefined;
  }
  return {
    label: isState ? 'Add the next state' : 'Add a state',
    build: () => {
      const { place, node } = newState(parentIn(model, ctx.plane, source.id));
      return { id: place.id, beside: true, command: addConnected(src, node, place, SM_TRANSITION_KIND) };
    },
  };
};
